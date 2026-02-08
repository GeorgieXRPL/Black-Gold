/**
 * @fileoverview Holder verification for Black Gold
 * Verifies wallet holds required percentage of tokens based on MC tier
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { HolderVerification } from '../types';
import { TOKEN_CONFIG, RPC_CONFIG, HOLDER_CONFIG } from '../../config/constants';
import { getRequiredPercent, getTier } from '../../config/holder-tiers';

/**
 * Cache for holder verifications
 * Prevents excessive RPC calls
 */
const verificationCache = new Map<string, HolderVerification>();

/**
 * Time-weighted balance tracking for flash loan prevention
 * Tracks when a wallet's balance was first seen above the required threshold
 * Flash loan attackers won't have historical balance data
 */
interface BalanceHistory {
  /** First time balance was seen above threshold */
  firstSeenAboveThreshold: Date;
  /** Last verified balance */
  lastBalance: number;
  /** Number of consecutive verifications above threshold */
  consecutiveVerifications: number;
}

const balanceHistory = new Map<string, BalanceHistory>();

/** Minimum hold time before eligible (prevents flash loans) */
const MIN_HOLD_TIME_MS = 10 * 60 * 1000; // 10 minutes - balance must be held for at least 10 min

/** Minimum consecutive verifications to be trusted */
const MIN_CONSECUTIVE_VERIFICATIONS = 2;

/**
 * Create a Solana connection using configured RPC endpoint
 * @returns Solana Connection instance
 */
export function createConnection(): Connection {
  return new Connection(
    RPC_CONFIG.HELIUS_RPC || RPC_CONFIG.ENDPOINT,
    'confirmed'
  );
}

/**
 * Cached market cap value
 * Updated periodically by the buyback service
 */
let cachedMarketCap = 10000; // Default to lowest tier

/**
 * Update the cached market cap
 * @param marketCap - New market cap value in USD
 */
export function updateMarketCap(marketCap: number): void {
  cachedMarketCap = marketCap;
  console.log(`[Holder] Market cap updated: $${marketCap.toLocaleString()}`);
}

/**
 * Get the current market cap
 */
export function getMarketCap(): number {
  return cachedMarketCap;
}

/**
 * Get the correct Helius API base URL based on network
 */
function getHeliusApiBase(): string {
  return RPC_CONFIG.IS_DEVNET
    ? 'https://api-devnet.helius.xyz'
    : 'https://api.helius.xyz';
}

/**
 * Get token balance for a wallet using Helius API
 * @param walletAddress - Wallet to check
 * @returns Token balance (in token units, not lamports)
 */
async function getTokenBalance(walletAddress: string): Promise<number> {
  const mintAddress = TOKEN_CONFIG.MINT_ADDRESS;
  
  if (mintAddress === 'TBD' || mintAddress === 'DEVNET_TEST_TOKEN') {
    console.log('[Holder] Token not configured, allowing all holders');
    return Infinity; // Allow everyone during testing
  }

  try {
    // Use Helius DAS API for efficient token balance lookup
    if (RPC_CONFIG.HELIUS_API_KEY) {
      const heliusBase = getHeliusApiBase();
      console.log(`[Holder] Fetching balance from ${heliusBase} for mint ${mintAddress}`);
      
      const response = await fetch(
        `${heliusBase}/v0/addresses/${walletAddress}/balances?api-key=${RPC_CONFIG.HELIUS_API_KEY}`
      );
      
      if (!response.ok) {
        throw new Error(`Helius API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Find our token in the balances
      const tokenBalance = data.tokens?.find(
        (t: { mint: string; amount: number }) => 
          t.mint.toLowerCase() === mintAddress.toLowerCase()
      );
      
      if (tokenBalance) {
        // Convert from lamports to token units
        return tokenBalance.amount / Math.pow(10, TOKEN_CONFIG.DECIMALS);
      }
      
      return 0;
    }
    
    // Fallback to standard RPC
    const connection = new Connection(RPC_CONFIG.ENDPOINT);
    const walletPubkey = new PublicKey(walletAddress);
    const mintPubkey = new PublicKey(mintAddress);
    
    // Get token accounts for this wallet
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      walletPubkey,
      { mint: mintPubkey }
    );
    
    if (tokenAccounts.value.length === 0) {
      return 0;
    }
    
    // Sum up all token accounts (usually just one)
    let totalBalance = 0;
    for (const account of tokenAccounts.value) {
      const amount = account.account.data.parsed.info.tokenAmount.uiAmount;
      if (amount) {
        totalBalance += amount;
      }
    }
    
    return totalBalance;
  } catch (error) {
    console.error(`[Holder] Error getting balance for ${walletAddress}:`, error);
    throw error;
  }
}

/**
 * Verify if a wallet holds enough tokens to mine
 * @param walletAddress - Wallet to verify
 * @returns Verification result
 */
export async function verifyHolder(walletAddress: string): Promise<HolderVerification> {
  // Check cache first
  const cached = verificationCache.get(walletAddress);
  if (cached && Date.now() - cached.cachedAt.getTime() < HOLDER_CONFIG.CACHE_DURATION_MS) {
    return cached;
  }
  
  try {
    // Get token balance
    const balance = await getTokenBalance(walletAddress);
    
    // Calculate percentage of supply
    const percentOfSupply = (balance / TOKEN_CONFIG.TOTAL_SUPPLY) * 100;
    
    // Get required percentage based on market cap
    const requiredPercent = getRequiredPercent(cachedMarketCap);
    const tier = getTier(cachedMarketCap);
    
    // Check basic eligibility (balance above threshold)
    const meetsBalanceRequirement = percentOfSupply >= requiredPercent || balance === Infinity;
    
    // Time-weighted balance check (flash loan prevention)
    let isEligible = meetsBalanceRequirement;
    
    if (meetsBalanceRequirement && balance !== Infinity) {
      const history = balanceHistory.get(walletAddress);
      const now = new Date();
      
      if (!history) {
        // First time seeing this wallet above threshold - start tracking
        balanceHistory.set(walletAddress, {
          firstSeenAboveThreshold: now,
          lastBalance: balance,
          consecutiveVerifications: 1,
        });
        // Allow on first verification (grace period for new users)
        // But require time-weighted verification for subsequent checks
        console.log(`[Holder] New wallet tracked: ${walletAddress.slice(0, 8)}... - first verification`);
      } else {
        // Update history
        history.lastBalance = balance;
        history.consecutiveVerifications++;
        
        // Check if they've held long enough
        const holdDuration = now.getTime() - history.firstSeenAboveThreshold.getTime();
        
        if (holdDuration < MIN_HOLD_TIME_MS && history.consecutiveVerifications < MIN_CONSECUTIVE_VERIFICATIONS) {
          // Balance appeared too recently - possible flash loan
          isEligible = false;
          const remainingMs = MIN_HOLD_TIME_MS - holdDuration;
          console.log(
            `[Holder] Flash loan guard: ${walletAddress.slice(0, 8)}... ` +
            `balance appeared ${Math.round(holdDuration / 1000)}s ago, ` +
            `need ${Math.round(remainingMs / 1000)}s more`
          );
        }
      }
    } else if (!meetsBalanceRequirement) {
      // Balance dropped below threshold - reset tracking
      balanceHistory.delete(walletAddress);
    }
    
    const verification: HolderVerification = {
      walletAddress,
      balance,
      percentOfSupply,
      requiredPercent,
      isEligible,
      cachedAt: new Date(),
      marketCap: cachedMarketCap,
    };
    
    // Cache the result
    verificationCache.set(walletAddress, verification);
    
    console.log(
      `[Holder] ${walletAddress}: ${balance.toFixed(2)} tokens ` +
      `(${percentOfSupply.toFixed(4)}%), need ${requiredPercent}% (${tier.name} tier) - ` +
      `${isEligible ? 'ELIGIBLE' : 'NOT ELIGIBLE'}`
    );
    
    return verification;
  } catch (error) {
    console.error(`[Holder] Verification failed for ${walletAddress}:`, error);
    
    // Return cached value if available (even if expired)
    if (cached) {
      console.log(`[Holder] Using expired cache for ${walletAddress}`);
      return cached;
    }
    
    // If no cache and error, deny access
    return {
      walletAddress,
      balance: 0,
      percentOfSupply: 0,
      requiredPercent: getRequiredPercent(cachedMarketCap),
      isEligible: false,
      cachedAt: new Date(),
      marketCap: cachedMarketCap,
    };
  }
}

/**
 * Invalidate cache for a wallet (e.g., after they buy/sell)
 * @param walletAddress - Wallet to invalidate
 */
export function invalidateCache(walletAddress: string): void {
  verificationCache.delete(walletAddress);
}

/**
 * Clear all cached verifications
 */
export function clearCache(): void {
  verificationCache.clear();
  console.log('[Holder] Cache cleared');
}

/**
 * Get cache statistics
 */
export function getCacheStats(): { size: number; oldestEntry: Date | null } {
  let oldestEntry: Date | null = null;
  
  for (const verification of verificationCache.values()) {
    if (!oldestEntry || verification.cachedAt < oldestEntry) {
      oldestEntry = verification.cachedAt;
    }
  }
  
  return {
    size: verificationCache.size,
    oldestEntry,
  };
}
