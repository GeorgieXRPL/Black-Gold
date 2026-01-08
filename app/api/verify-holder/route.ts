/**
 * @fileoverview API route for holder verification
 * Checks if a wallet holds enough COAL tokens to mine
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRequiredPercent, getTier } from '../../../config/holder-tiers';
import { TOKEN_CONFIG, RPC_CONFIG, HOLDER_CONFIG } from '../../../config/constants';

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
}

/**
 * Get the correct Helius API base URL based on network
 */
function getHeliusApiBase(): string {
  const isDevnet = process.env.SOLANA_NETWORK === 'devnet';
  return isDevnet 
    ? 'https://api-devnet.helius.xyz' 
    : 'https://api.helius.xyz';
}

/**
 * Fetch token balance from Helius API
 */
async function getTokenBalance(walletAddress: string): Promise<number> {
  const mintAddress = TOKEN_CONFIG.MINT_ADDRESS;
  
  // Token not launched yet - allow everyone
  if (mintAddress === 'TBD' || mintAddress === 'DEVNET_TEST_TOKEN') {
    console.log('[API] Token not configured, allowing all holders');
    return Infinity;
  }
  
  // Use Helius API if available
  if (RPC_CONFIG.HELIUS_API_KEY) {
    try {
      const heliusBase = getHeliusApiBase();
      console.log(`[API] Fetching balance from ${heliusBase} for mint ${mintAddress}`);
      
      const response = await fetch(
        `${heliusBase}/v0/addresses/${walletAddress}/balances?api-key=${RPC_CONFIG.HELIUS_API_KEY}`,
        { next: { revalidate: 60 } } // Cache for 60 seconds
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
        return tokenBalance.amount / Math.pow(10, TOKEN_CONFIG.DECIMALS);
      }
      
      return 0;
    } catch (error) {
      console.error('[API] Helius balance fetch failed:', error);
      throw error;
    }
  }
  
  // No Helius key - return mock data for testing
  return 50000000; // 5% of supply for testing
}

/**
 * Fetch current market cap from Jupiter price API
 */
async function getMarketCap(): Promise<number> {
  if (TOKEN_CONFIG.MINT_ADDRESS === 'TBD') {
    return 10000; // Default to lowest tier for testing
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
      return tokenData.price * TOKEN_CONFIG.TOTAL_SUPPLY;
    }
    
    return 10000; // Default
  } catch (error) {
    console.error('[API] Market cap fetch failed:', error);
    return 10000;
  }
}

/**
 * GET /api/verify-holder?wallet=<address>
 */
export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get('wallet');
  
  if (!wallet || wallet.length < 32) {
    return NextResponse.json(
      { error: 'Invalid wallet address' },
      { status: 400 }
    );
  }
  
  // Check cache first
  const cached = verificationCache.get(wallet);
  if (cached && Date.now() - cached.timestamp < HOLDER_CONFIG.CACHE_DURATION_MS) {
    return NextResponse.json(cached.data);
  }
  
  try {
    // Fetch balance and market cap in parallel
    const [balance, marketCap] = await Promise.all([
      getTokenBalance(wallet),
      getMarketCap(),
    ]);
    
    const percentOfSupply = balance === Infinity 
      ? 100 
      : (balance / TOKEN_CONFIG.TOTAL_SUPPLY) * 100;
    const requiredPercent = getRequiredPercent(marketCap);
    const tier = getTier(marketCap);
    const isEligible = percentOfSupply >= requiredPercent;
    
    const response: HolderVerificationResponse = {
      walletAddress: wallet,
      balance: balance === Infinity ? 999999999 : balance,
      percentOfSupply,
      requiredPercent,
      isEligible,
      cachedAt: new Date().toISOString(),
      marketCap,
      tier: tier.name,
    };
    
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
    
    return NextResponse.json(
      { error: 'Verification failed' },
      { status: 500 }
    );
  }
}
