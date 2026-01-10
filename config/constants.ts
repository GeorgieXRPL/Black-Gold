/**
 * @fileoverview Configuration constants for Black Gold mining platform
 * Supports both mainnet and devnet environments via SOLANA_NETWORK env var
 */

/** Network environment - 'mainnet' or 'devnet' */
export const NETWORK = (process.env.SOLANA_NETWORK || 'mainnet') as 'mainnet' | 'devnet';

/** Whether running in development/test mode */
export const IS_DEVNET = NETWORK === 'devnet';

/** Token configuration - UPDATE AFTER LAUNCH */
export const TOKEN_CONFIG = {
  /** Token mint address (SPL token) */
  MINT_ADDRESS: process.env.TOKEN_MINT_ADDRESS || (IS_DEVNET ? 'DEVNET_TEST_TOKEN' : 'TBD'),
  /** Token decimals */
  DECIMALS: 9,
  /** Total supply */
  TOTAL_SUPPLY: 1_000_000_000,
  /** Token symbol */
  SYMBOL: IS_DEVNET ? 'tCOAL' : 'COAL',
  /** Token name */
  NAME: IS_DEVNET ? 'Test Black Gold' : 'Black Gold',
} as const;

/** Wallet configuration */
export const WALLET_CONFIG = {
  /** Reward pool wallet (holds tokens for distribution) */
  REWARD_WALLET: process.env.REWARD_WALLET_ADDRESS || 'TBD',
  /** Creator wallet (receives Pump.fun creator fees) */
  CREATOR_WALLET: process.env.CREATOR_WALLET_ADDRESS || 'TBD',
} as const;

/** RPC endpoints by network */
const RPC_ENDPOINTS = {
  mainnet: 'https://api.mainnet-beta.solana.com',
  devnet: 'https://api.devnet.solana.com',
} as const;

/** Helius RPC endpoints by network */
const HELIUS_ENDPOINTS = {
  mainnet: 'https://mainnet.helius-rpc.com',
  devnet: 'https://devnet.helius-rpc.com',
} as const;

/** Solana RPC configuration */
export const RPC_CONFIG = {
  /** Current network */
  NETWORK,
  /** Is devnet */
  IS_DEVNET,
  /** Main RPC endpoint */
  ENDPOINT: process.env.SOLANA_RPC_URL || RPC_ENDPOINTS[NETWORK],
  /** Helius API key for holder verification */
  HELIUS_API_KEY: process.env.HELIUS_API_KEY || '',
  /** Helius RPC endpoint (network-aware) */
  HELIUS_RPC: process.env.HELIUS_API_KEY 
    ? `${HELIUS_ENDPOINTS[NETWORK]}/?api-key=${process.env.HELIUS_API_KEY}`
    : RPC_ENDPOINTS[NETWORK],
} as const;

/** Mining pool configuration */
export const POOL_CONFIG = {
  /** WebSocket server port */
  PORT: parseInt(process.env.WEBSOCKET_PORT || '8080', 10),
  
  /**
   * Baseline hashrate assumption for difficulty calculation (H/s)
   * Based on observed hashrates (15-50 KH/s from logs):
   * - Low-end/mobile: ~10,000 H/s
   * - Average laptop: ~25,000 H/s
   * - High-end desktop: ~100,000+ H/s
   * 
   * Using 25,000 H/s as baseline for difficulty calculation
   * This ensures discovery times are reasonable from the start
   */
  BASELINE_HASHRATE: parseInt(process.env.BASELINE_HASHRATE || '25000', 10),
  
  /**
   * Minimum difficulty - calibrated for ACTUAL hashrates observed
   * 
   * IMPORTANT: Logs show miners hitting 15-50 KH/s, not 5 KH/s!
   * 
   * Formula: difficulty = targetTimeSeconds × hashrate
   * 
   * For 5-minute Coal mines with typical 25k H/s miner:
   *   300 seconds × 25,000 H/s = 7,500,000 difficulty
   * 
   * For 8-minute Silver mines with typical 25k H/s miner:
   *   480 seconds × 25,000 H/s = 12,000,000 difficulty
   * 
   * For 20-minute Gold mines with typical 25k H/s miner:
   *   1200 seconds × 25,000 H/s = 30,000,000 difficulty
   * 
   * Setting MIN to 7.5M ensures Coal mines (fastest) take ~5 minutes
   * at the baseline hashrate. Higher hashrate = shorter time until
   * dynamic difficulty kicks in.
   */
  MIN_DIFFICULTY: parseInt(process.env.MIN_DIFFICULTY || '7500000', 10),
  
  /**
   * Maximum difficulty - for scaling with many miners
   * At 50 miners with 25k H/s each = 1.25M H/s network
   * Gold mines (20 min): 1,200 sec × 1,250,000 H/s = 1.5 billion
   * Cap at 2 billion to allow for growth
   */
  MAX_DIFFICULTY: parseInt(process.env.MAX_DIFFICULTY || '2000000000', 10),
  
  /**
   * Target discovery time in milliseconds (fallback if mine doesn't specify)
   * Each mine has its own baseDiscoveryTimeMs in config/mines.ts
   * This is only used as a fallback for the global pool
   */
  TARGET_BARREL_TIME_MS: parseInt(process.env.TARGET_BARREL_TIME_MS || '300000', 10), // 5 min default (Coal)
  
  /** Nonce range size per work unit */
  NONCE_RANGE_SIZE: 50_000_000, // Large range for higher hashrates
  
  /** Work unit expiry time in ms - increased for longer mining */
  WORK_EXPIRY_MS: 10 * 60_000, // 10 minutes (covers Gold mines)
  
  /**
   * Announcement delay before revealing discovery winner (ms)
   * Creates suspense for all miners while winner is revealed
   */
  ANNOUNCEMENT_DELAY_MS: parseInt(process.env.ANNOUNCEMENT_DELAY_MS || '30000', 10), // 30 seconds
} as const;

/** Rate limiting configuration */
export const RATE_LIMIT_CONFIG = {
  /** Max submissions per minute per wallet */
  MAX_SUBMISSIONS_PER_MINUTE: 10,
  /** Max concurrent connections per IP */
  MAX_CONNECTIONS_PER_IP: 3,
  /** Max IPs per wallet before flagging */
  MAX_IPS_PER_WALLET: 3,
  /** Rate limit window in ms */
  WINDOW_MS: 60_000,
  /** Initial backoff time in ms */
  INITIAL_BACKOFF_MS: 1_000,
  /** Max backoff time in ms */
  MAX_BACKOFF_MS: 60_000,
  /** Backoff multiplier */
  BACKOFF_MULTIPLIER: 2,
} as const;

/** Holder verification configuration */
export const HOLDER_CONFIG = {
  /** Cache duration for holder verification in ms */
  CACHE_DURATION_MS: 5 * 60 * 1000, // 5 minutes
  /** Minimum balance to be considered a holder (in token units) */
  MIN_BALANCE: 1,
} as const;

/** Redis configuration */
export const REDIS_CONFIG = {
  URL: process.env.REDIS_URL || 'redis://localhost:6379',
} as const;

/** Buyback service configuration */
export const BUYBACK_CONFIG = {
  /** Check interval for new creator rewards */
  CHECK_INTERVAL_MS: 3 * 60 * 1000, // 3 minutes
  /** Minimum SOL to trigger buyback */
  MIN_SOL_FOR_BUYBACK: 0.01,
  /** Slippage tolerance for swaps (in basis points) */
  SLIPPAGE_BPS: 100, // 1%
  /** Jupiter API endpoint */
  JUPITER_API: 'https://quote-api.jup.ag/v6',
} as const;
