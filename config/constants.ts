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
   * Used to calculate initial difficulty for a single miner
   * Conservative estimate for mobile devices: ~5,000 H/s
   * Average laptop: ~10,000 H/s
   */
  BASELINE_HASHRATE: parseInt(process.env.BASELINE_HASHRATE || '5000', 10),
  
  /**
   * Minimum difficulty - calibrated for real mining times
   * 
   * Formula: difficulty ≈ targetTimeSeconds × hashrate
   * 
   * For 5-minute Coal mines with single 5k H/s miner:
   *   300 seconds × 5,000 H/s = 1,500,000 difficulty
   * 
   * Previous value of 256 was WAY too low (solutions in milliseconds!)
   * 
   * Resource target times from config/mines.ts:
   * - Coal:   5 min  → ~1,500,000 base difficulty
   * - Silver: 8 min  → ~2,400,000 base difficulty  
   * - Oil:   10 min  → ~3,000,000 base difficulty
   * - Gold:  20 min  → ~6,000,000 base difficulty
   */
  MIN_DIFFICULTY: parseInt(process.env.MIN_DIFFICULTY || '1500000', 10),
  
  /**
   * Maximum difficulty - for scaling with many miners
   * At 100 miners with 10k H/s each = 1M H/s network
   * Gold mines (20 min): 1,200 sec × 1,000,000 H/s = 1.2 billion
   * Cap at 500 million to prevent extreme values
   */
  MAX_DIFFICULTY: parseInt(process.env.MAX_DIFFICULTY || '500000000', 10),
  
  /**
   * Target discovery time in milliseconds (fallback if mine doesn't specify)
   * Each mine has its own baseDiscoveryTimeMs in config/mines.ts
   * This is only used as a fallback for the global pool
   */
  TARGET_BARREL_TIME_MS: parseInt(process.env.TARGET_BARREL_TIME_MS || '300000', 10), // 5 min default (Coal)
  
  /** Nonce range size per work unit */
  NONCE_RANGE_SIZE: 10_000_000, // Increased for longer mining times
  
  /** Work unit expiry time in ms - increased for longer mining */
  WORK_EXPIRY_MS: 5 * 60_000, // 5 minutes (longer than shortest discovery time)
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
