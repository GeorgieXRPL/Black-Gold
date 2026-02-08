/**
 * @fileoverview API route for holder verification
 * Checks if a wallet holds enough COAL tokens to mine
 * 
 * DEVNET MODE (v2.9):
 * When SOLANA_NETWORK=devnet, this route bypasses market cap requirements
 * and uses simplified holder verification for testing.
 * 
 * MAINNET CHECKLIST (verified in audit):
 * 1. Set SOLANA_NETWORK=mainnet (or leave unset - defaults to mainnet)
 * 2. Set TOKEN_MINT_ADDRESS to the real Pump.fun token mint
 * 3. Set HELIUS_API_KEY for mainnet RPC
 * 4. Jupiter price API works for mainnet tokens automatically
 * 5. All devnet bypasses are gated by IS_DEVNET flag (safe for production)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRequiredPercent, getTier } from '../../../config/holder-tiers';
import { TOKEN_CONFIG, RPC_CONFIG, HOLDER_CONFIG } from '../../../config/constants';

/** Whether we're running in devnet testing mode */
const IS_DEVNET = process.env.SOLANA_NETWORK === 'devnet';

/**
 * DEVNET TESTING CONFIG
 * These values are used ONLY when SOLANA_NETWORK=devnet
 * Safe for production: all usage is gated by IS_DEVNET check
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
 * Fetch token balance directly from Solana RPC
 * Uses Helius RPC for reliability (public devnet RPC is notoriously unreliable)
 */
async function getTokenBalanceFromRPC(walletAddress: string): Promise<number | null> {
  const mintAddress = TOKEN_CONFIG.MINT_ADDRESS;
  
  try {
    // Use Helius RPC if available (much more reliable than public devnet)
    // Public devnet RPC has load balancer issues causing stale reads
    let rpcEndpoint: string;
    if (RPC_CONFIG.HELIUS_API_KEY) {
      rpcEndpoint = IS_DEVNET 
        ? `https://devnet.helius-rpc.com/?api-key=${RPC_CONFIG.HELIUS_API_KEY}`
        : `https://mainnet.helius-rpc.com/?api-key=${RPC_CONFIG.HELIUS_API_KEY}`;
      console.log(`[API] Fetching balance via Helius RPC (reliable)`);
    } else {
      // Fallback to public RPC (less reliable)
      rpcEndpoint = IS_DEVNET 
        ? 'https://api.devnet.solana.com'
        : 'https://api.mainnet-beta.solana.com';
      console.log(`[API] Fetching balance via public RPC (may be stale): ${rpcEndpoint}`);
    }
    
    // Use getTokenAccountsByOwner RPC method with 'confirmed' commitment for latest state
    const response = await fetch(rpcEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(), // Unique ID to prevent any caching
        method: 'getTokenAccountsByOwner',
        params: [
          walletAddress,
          { mint: mintAddress },
          { 
            encoding: 'jsonParsed',
            commitment: 'confirmed' // Use 'confirmed' for most up-to-date balance
          }
        ]
      })
    });
    
    if (!response.ok) {
      throw new Error(`RPC error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.error) {
      console.error('[API] RPC returned error:', data.error);
      return null;
    }
    
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
    return null; // Return null to indicate failure, not 0
  }
}

/**
 * Fetch token balance from Helius API (may have indexing delay)
 */
async function getTokenBalanceFromHelius(walletAddress: string, noCache: boolean = false): Promise<number | null> {
  const mintAddress = TOKEN_CONFIG.MINT_ADDRESS;
  
  if (!RPC_CONFIG.HELIUS_API_KEY) {
    return null;
  }
  
  try {
    const heliusBase = getHeliusApiBase();
    console.log(`[API] Fetching balance from Helius: ${heliusBase}${noCache ? ' (no-cache)' : ''}`);
    
    // When noCache, bypass Next.js fetch cache; otherwise cache for 60s
    const fetchOptions = noCache 
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
      console.log(`[API] Found REAL balance via Helius: ${balance.toLocaleString()} tokens`);
      return balance;
    }
    
    console.log('[API] No token balance found in Helius');
    return 0;
  } catch (error) {
    console.error('[API] Helius balance fetch failed:', error);
    return null;
  }
}

/**
 * Fetch REAL token balance from on-chain
 * @param walletAddress - The wallet address to check
 * @param forceRefresh - If true, uses direct RPC (always up-to-date) instead of Helius (has indexing delay)
 */
async function getTokenBalance(walletAddress: string, forceRefresh: boolean = false): Promise<number> {
  const mintAddress = TOKEN_CONFIG.MINT_ADDRESS;
  
  // Token not configured
  if (mintAddress === 'TBD' || mintAddress === 'DEVNET_TEST_TOKEN') {
    console.log('[API] Token not configured, allowing all holders');
    return Infinity;
  }

  // When force refresh (e.g., after staking), use direct RPC FIRST
  // RPC is always up-to-date, while Helius has indexing delay
  if (forceRefresh) {
    console.log('[API] Force refresh: Using direct RPC for immediate balance');
    const rpcBalance = await getTokenBalanceFromRPC(walletAddress);
    if (rpcBalance !== null) {
      return rpcBalance;
    }
    // If RPC fails, fall through to Helius with no-cache
    console.log('[API] RPC failed, falling back to Helius with no-cache');
  }

  // Normal path: Try Helius first (faster, but may have delay)
  const heliusBalance = await getTokenBalanceFromHelius(walletAddress, forceRefresh);
  if (heliusBalance !== null) {
    return heliusBalance;
  }
  
  // Fallback to RPC if Helius fails
  const rpcBalance = await getTokenBalanceFromRPC(walletAddress);
  if (rpcBalance !== null) {
    return rpcBalance;
  }
  
  // If we're on devnet and everything fails, return 0 (not fake balance)
  if (IS_DEVNET) {
    console.log('[API] DEVNET: All balance fetch methods failed, returning 0');
    return 0;
  }
  
  throw new Error('Failed to fetch token balance');
}

/**
 * Fetch current market cap from Jupiter price API
 * NOTE: Jupiter only works for mainnet tokens.
 */
async function getMarketCap(): Promise<number> {
  // DEVNET MODE: Return simulated market cap (Jupiter has no devnet prices)
  // This block is safe for production: IS_DEVNET is false when SOLANA_NETWORK != 'devnet'
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
 * Simple per-IP rate limiter for the verify-holder endpoint
 * Prevents abuse of RPC calls
 */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 30; // 30 requests per minute per IP

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  
  entry.count++;
  if (entry.count > RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }
  
  return true;
}

// Periodic cleanup of rate limit entries (every 5 minutes)
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of rateLimitMap) {
      if (now > entry.resetAt) {
        rateLimitMap.delete(ip);
      }
    }
  }, 5 * 60_000);
}

/**
 * GET /api/verify-holder?wallet=<address>&force=true
 * 
 * Query params:
 * - wallet: Solana wallet address (required)
 * - force: If 'true', bypasses cache and fetches fresh data (optional)
 */
export async function GET(request: NextRequest) {
  // Rate limiting
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() 
    || request.headers.get('x-real-ip') 
    || 'unknown';
  
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Try again in 1 minute.' },
      { status: 429 }
    );
  }

  const wallet = request.nextUrl.searchParams.get('wallet');
  const forceRefresh = request.nextUrl.searchParams.get('force') === 'true';
  
  if (!wallet || wallet.length < 32) {
    return NextResponse.json(
      { error: 'Invalid wallet address' },
      { status: 400 }
    );
  }
  
  // Validate wallet address format
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet)) {
    return NextResponse.json(
      { error: 'Invalid Solana wallet address format' },
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
    
    // When force refresh, add cache-control headers to prevent Vercel edge caching
    if (forceRefresh) {
      return NextResponse.json(response, {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      });
    }
    
    return NextResponse.json(response);
  } catch (error) {
    console.error('[API] Verification error:', error);
    
    // Return cached data if available (even if expired)
    if (cached) {
      return NextResponse.json(cached.data);
    }
    
    // DEVNET EMERGENCY FALLBACK: If everything fails, allow testing
    // Safe for production: IS_DEVNET is false on mainnet, so this never executes
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
