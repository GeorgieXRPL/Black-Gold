/**
 * @fileoverview API route for holder verification
 * Checks if a wallet holds enough COAL tokens to mine
 * 
 * DEVNET MODE (v2.9):
 * When SOLANA_NETWORK=devnet, this route bypasses market cap requirements
 * and uses simplified holder verification for testing.
 * 
 * TODO [MAINNET]: Before mainnet launch, verify:
 * 1. SOLANA_NETWORK is set to 'mainnet' (or unset)
 * 2. TOKEN_MINT_ADDRESS is the real Pump.fun token
 * 3. HELIUS_API_KEY is configured for mainnet
 * 4. Jupiter price API will work for the real token
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRequiredPercent, getTier } from '../../../config/holder-tiers';
import { TOKEN_CONFIG, RPC_CONFIG, HOLDER_CONFIG } from '../../../config/constants';

/** Whether we're running in devnet testing mode */
const IS_DEVNET = process.env.SOLANA_NETWORK === 'devnet';

/**
 * DEVNET TESTING CONFIG
 * These values are used when SOLANA_NETWORK=devnet
 * 
 * TODO [MAINNET]: Remove or disable this section for production
 */
const DEVNET_CONFIG = {
  /** Simulated market cap for devnet (uses Genesis tier: 0.5% required) */
  SIMULATED_MARKET_CAP: 5000,
  /** 
   * Whether to bypass holder ELIGIBILITY requirements on devnet
   * NOTE: This bypasses the eligibility CHECK only - it still fetches real balance
   */
  BYPASS_ELIGIBILITY_CHECK: true,
};

/**
 * Simple in-memory cache for holder verification
 */
const verificationCache = new Map<string, {
  data: HolderVerificationResponse;
  timestamp: number;
}>();

interface HolderVerificationResponse {
  walletAddress: string;
  balance: number;
  percentOfSupply: number;
  requiredPercent: number;
  isEligible: boolean;
  cachedAt: string;
  marketCap: number;
  tier: string;
  /** Indicates if devnet testing mode is active */
  devnetMode?: boolean;
}

/**
 * Get the correct Helius API base URL based on network
 */
function getHeliusApiBase(): string {
  return IS_DEVNET 
    ? 'https://api-devnet.helius.xyz' 
    : 'https://api.helius.xyz';
}

/**
 * Fetch REAL token balance from Helius API or RPC fallback
 * Always returns the actual on-chain balance - never fake values
 * @param walletAddress - The wallet address to check
 * @param forceRefresh - If true, bypasses all caching to get fresh on-chain data
 */
async function getTokenBalance(walletAddress: string, forceRefresh: boolean = false): Promise<number> {
  const mintAddress = TOKEN_CONFIG.MINT_ADDRESS;
  
  // Token not configured
  if (mintAddress === 'TBD' || mintAddress === 'DEVNET_TEST_TOKEN') {
    console.log('[API] Token not configured, allowing all holders');
    return Infinity;
  }

  // Try Helius API first (works for both devnet and mainnet)
  if (RPC_CONFIG.HELIUS_API_KEY) {
    try {
      const heliusBase = getHeliusApiBase();
      console.log(`[API] Fetching REAL balance from ${heliusBase} for mint ${mintAddress}${forceRefresh ? ' (force refresh)' : ''}`);
      
      // When force refresh, bypass Next.js fetch cache; otherwise cache for 60s
      const fetchOptions = forceRefresh 
        ? { cache: 'no-store' as const }
        : { next: { revalidate: 60 } };
      
      const response = await fetch(
        `${heliusBase}/v0/addresses/${walletAddress}/balances?api-key=${RPC_CONFIG.HELIUS_API_KEY}`,
        fetchOptions
      );
      
      if (!response.ok) {
        throw new Error(`Helius API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      const tokenBalance = data.tokens?.find(
        (t: { mint: string; amount: number }) =>
          t.mint.toLowerCase() === mintAddress.toLowerCase()
      );
      
      if (tokenBalance) {
        const balance = tokenBalance.amount / Math.pow(10, TOKEN_CONFIG.DECIMALS);
        console.log(`[API] Found REAL balance: ${balance.toLocaleString()} tokens`);
        return balance;
      }
      
      console.log('[API] No token balance found for wallet');
      return 0;
    } catch (error) {
      console.error('[API] Helius balance fetch failed:', error);
      // Fall through to RPC fallback
    }
  }
  
  // RPC Fallback: Use direct Solana RPC to get token balance
  try {
    const rpcEndpoint = IS_DEVNET 
      ? 'https://api.devnet.solana.com'
      : 'https://api.mainnet-beta.solana.com';
    
    console.log(`[API] Falling back to RPC for balance: ${rpcEndpoint}`);
    
    // Use getTokenAccountsByOwner RPC method
    const response = await fetch(rpcEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTokenAccountsByOwner',
        params: [
          walletAddress,
          { mint: mintAddress },
          { encoding: 'jsonParsed' }
        ]
      })
    });
    
    if (!response.ok) {
      throw new Error(`RPC error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.result?.value?.length > 0) {
      let totalBalance = 0;
      for (const account of data.result.value) {
        const amount = account.account?.data?.parsed?.info?.tokenAmount?.uiAmount || 0;
        totalBalance += amount;
      }
      console.log(`[API] Found REAL balance via RPC: ${totalBalance.toLocaleString()} tokens`);
      return totalBalance;
    }
    
    console.log('[API] No token accounts found via RPC');
    return 0;
  } catch (error) {
    console.error('[API] RPC balance fetch failed:', error);
    
    // If we're on devnet and everything fails, return 0 (not fake balance)
    // The eligibility bypass will handle allowing access
    if (IS_DEVNET) {
      console.log('[API] DEVNET: All balance fetch methods failed, returning 0');
      return 0;
    }
    
    throw error;
  }
}

/**
 * Fetch current market cap from Jupiter price API
 * NOTE: Jupiter only works for mainnet tokens.
 */
async function getMarketCap(): Promise<number> {
  // ═══════════════════════════════════════════════════════════════════
  // DEVNET MODE: Return simulated market cap (Jupiter has no devnet prices)
  // TODO [MAINNET]: Remove this block for production
  // ═══════════════════════════════════════════════════════════════════
  if (IS_DEVNET) {
    console.log(`[API] DEVNET MODE: Using simulated market cap: $${DEVNET_CONFIG.SIMULATED_MARKET_CAP}`);
    return DEVNET_CONFIG.SIMULATED_MARKET_CAP;
  }
  // ═══════════════════════════════════════════════════════════════════
  
  if (TOKEN_CONFIG.MINT_ADDRESS === 'TBD') {
    return 10000;
  }
  
  try {
    const response = await fetch(
      `https://price.jup.ag/v6/price?ids=${TOKEN_CONFIG.MINT_ADDRESS}`,
      { next: { revalidate: 60 } }
    );
    
    if (!response.ok) {
      throw new Error(`Jupiter API error: ${response.status}`);
    }
    
    const data = await response.json();
    const tokenData = data.data?.[TOKEN_CONFIG.MINT_ADDRESS];
    
    if (tokenData?.price) {
      const marketCap = tokenData.price * TOKEN_CONFIG.TOTAL_SUPPLY;
      console.log(`[API] Market cap from Jupiter: $${marketCap.toLocaleString()}`);
      return marketCap;
    }
    
    console.log('[API] No price data from Jupiter, using default');
    return 10000;
  } catch (error) {
    console.error('[API] Market cap fetch failed:', error);
    return 10000;
  }
}

/**
 * GET /api/verify-holder?wallet=<address>&force=true
 * 
 * Query params:
 * - wallet: Solana wallet address (required)
 * - force: If 'true', bypasses cache and fetches fresh data (optional)
 */
export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get('wallet');
  const forceRefresh = request.nextUrl.searchParams.get('force') === 'true';
  
  if (!wallet || wallet.length < 32) {
    return NextResponse.json(
      { error: 'Invalid wallet address' },
      { status: 400 }
    );
  }
  
  // Get cached data (needed for error fallback even if force refresh)
  const cached = verificationCache.get(wallet);
  
  // Check cache first (unless force refresh is requested)
  if (!forceRefresh && cached && Date.now() - cached.timestamp < HOLDER_CONFIG.CACHE_DURATION_MS) {
    return NextResponse.json(cached.data);
  }
  
  if (forceRefresh) {
    console.log(`[API] Force refresh requested for ${wallet.slice(0,8)}...`);
  }
  
  try {
    // Fetch balance and market cap in parallel
    // Pass forceRefresh to bypass all caching when needed (e.g., after staking)
    const [balance, marketCap] = await Promise.all([
      getTokenBalance(wallet, forceRefresh),
      getMarketCap(),
    ]);
    
    const percentOfSupply = balance === Infinity 
      ? 100 
      : (balance / TOKEN_CONFIG.TOTAL_SUPPLY) * 100;
    const requiredPercent = getRequiredPercent(marketCap);
    const tier = getTier(marketCap);
    
    // Calculate eligibility - can be bypassed on devnet for testing
    const meetsRequirement = percentOfSupply >= requiredPercent;
    const isEligible = IS_DEVNET && DEVNET_CONFIG.BYPASS_ELIGIBILITY_CHECK 
      ? true  // Bypass on devnet - always eligible for testing
      : meetsRequirement;
    
    const response: HolderVerificationResponse = {
      walletAddress: wallet,
      balance: balance === Infinity ? 999999999 : balance,
      percentOfSupply,
      requiredPercent,
      isEligible,
      cachedAt: new Date().toISOString(),
      marketCap,
      tier: tier.name,
      // Flag to indicate devnet mode in response
      devnetMode: IS_DEVNET,
    };
    
    // Log for debugging
    if (IS_DEVNET) {
      console.log(`[API] DEVNET verification for ${wallet.slice(0,8)}...: eligible=${isEligible} (bypassed=${DEVNET_CONFIG.BYPASS_ELIGIBILITY_CHECK}), REAL balance=${balance.toLocaleString()}`);
    }
    
    // Update cache
    verificationCache.set(wallet, {
      data: response,
      timestamp: Date.now(),
    });
    
    return NextResponse.json(response);
  } catch (error) {
    console.error('[API] Verification error:', error);
    
    // Return cached data if available (even if expired)
    if (cached) {
      return NextResponse.json(cached.data);
    }
    
    // ═══════════════════════════════════════════════════════════════════
    // DEVNET EMERGENCY FALLBACK: If everything fails, allow testing
    // NOTE: Returns 0 balance but isEligible=true due to bypass
    // TODO [MAINNET]: Remove this entire block for production
    // ═══════════════════════════════════════════════════════════════════
    if (IS_DEVNET && DEVNET_CONFIG.BYPASS_ELIGIBILITY_CHECK) {
      console.log('[API] DEVNET EMERGENCY FALLBACK: All verification failed, allowing access with 0 balance');
      const fallbackResponse: HolderVerificationResponse = {
        walletAddress: wallet,
        balance: 0, // Return 0, not fake balance
        percentOfSupply: 0,
        requiredPercent: 0.5,
        isEligible: true, // Bypassed on devnet
        cachedAt: new Date().toISOString(),
        marketCap: DEVNET_CONFIG.SIMULATED_MARKET_CAP,
        tier: 'Genesis',
        devnetMode: true,
      };
      return NextResponse.json(fallbackResponse);
    }
    // ═══════════════════════════════════════════════════════════════════
    
    return NextResponse.json(
      { error: 'Verification failed' },
      { status: 500 }
    );
  }
}
