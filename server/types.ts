/**
 * @fileoverview Shared types for Black Gold mining platform
 * ALL AGENTS MUST USE THESE TYPES
 */

/** Represents a connected miner in the pool */
export interface Miner {
  /** Solana wallet address */
  walletAddress: string;
  /** Client IP address for anti-sybil tracking */
  ip: string;
  /** Current hashrate in H/s */
  hashrate: number;
  /** WebSocket connection timestamp */
  connectedAt: Date;
  /** Assigned nonce range to prevent duplicate work */
  nonceRange: { start: number; end: number };
  /** Number of CPU cores dedicated to mining */
  cores: number;
  /** Last activity timestamp */
  lastSeen: Date;
}

/** Work unit sent to miners */
export interface WorkUnit {
  /** Unique work unit identifier */
  id: string;
  /** Header data to hash (includes previous barrel hash) */
  barrelHeader: string;
  /** Difficulty target - hash must be below this */
  target: string;
  /** Start of nonce range for this miner */
  nonceStart: number;
  /** End of nonce range for this miner */
  nonceEnd: number;
  /** When this work was issued */
  timestamp: number;
  /** Current barrel number */
  barrelNumber: number;
}

/** Proof submission from miner */
export interface ProofSubmission {
  /** Miner's wallet address */
  walletAddress: string;
  /** Winning nonce value */
  nonce: number;
  /** Resulting hash */
  hash: string;
  /** The work unit this proof is for */
  workUnitId: string;
  /** Timestamp of submission */
  timestamp: number;
}

/** Result of a successful barrel discovery */
export interface BarrelResult {
  /** Barrel number */
  barrelNumber: number;
  /** Winning miner's wallet address */
  winner: string;
  /** Winning hash */
  hash: string;
  /** Winning nonce */
  nonce: number;
  /** Token reward amount */
  reward: number;
  /** When the barrel was found */
  timestamp: Date;
  /** Transaction signature for reward */
  txSignature?: string;
}

/** Holder verification result */
export interface HolderVerification {
  /** Wallet address checked */
  walletAddress: string;
  /** Token balance */
  balance: number;
  /** Percentage of total supply held */
  percentOfSupply: number;
  /** Required percentage based on MC tier */
  requiredPercent: number;
  /** Whether wallet is eligible to mine */
  isEligible: boolean;
  /** When this verification was cached */
  cachedAt: Date;
  /** Current market cap used for tier calculation */
  marketCap: number;
}

/** Network statistics */
export interface NetworkStats {
  /** Total connected miners */
  totalMiners: number;
  /** Combined network hashrate */
  networkHashrate: number;
  /** Total barrels found */
  totalBarrels: number;
  /** Current difficulty */
  difficulty: number;
  /** Time of last barrel */
  lastBarrelTime: Date | null;
  /** Total rewards distributed */
  totalRewardsDistributed: number;
  /** Current barrel reward pool */
  currentRewardPool: number;
}

/** WebSocket message types */
export type WSMessageType =
  | 'connect'
  | 'work'
  | 'submit'
  | 'result'
  | 'stats'
  | 'error'
  | 'hashrate'
  | 'barrel_found';

/** WebSocket message envelope */
export interface WSMessage<T = unknown> {
  type: WSMessageType;
  payload: T;
  timestamp: number;
}

/** Connect request payload */
export interface ConnectPayload {
  walletAddress: string;
  cores: number;
}

/** Hashrate update payload */
export interface HashratePayload {
  walletAddress: string;
  hashrate: number;
}

/** Error payload */
export interface ErrorPayload {
  code: string;
  message: string;
}

/** Rate limit tracking */
export interface RateLimitEntry {
  /** Number of submissions */
  count: number;
  /** Window start time */
  windowStart: number;
  /** Failed submission count */
  failedCount: number;
  /** Backoff until timestamp */
  backoffUntil?: number;
}

/** IP tracking for sybil detection */
export interface IPTracker {
  /** IP address */
  ip: string;
  /** Wallet addresses seen from this IP */
  wallets: Set<string>;
  /** Connection count */
  connectionCount: number;
  /** First seen timestamp */
  firstSeen: Date;
  /** Flagged as suspicious */
  flagged: boolean;
}

/**
 * Result payload for successful operations
 */
export interface ResultPayload {
  /** Whether the operation succeeded */
  success: boolean;
  /** Human-readable message */
  message: string;
  /** Optional additional data */
  data?: Record<string, unknown>;
}

/**
 * Server configuration for the WebSocket pool server
 */
export interface PoolServerConfig {
  /** WebSocket server port */
  port: number;
  /** Target barrel discovery time in milliseconds */
  targetBarrelTimeMs: number;
  /** Minimum difficulty level */
  minDifficulty: number;
  /** Maximum difficulty level */
  maxDifficulty: number;
  /** Size of nonce range assigned per work unit */
  nonceRangeSize: number;
  /** Work unit expiry time in milliseconds */
  workExpiryMs: number;
}

/**
 * Barrel discovery event payload broadcast to all miners
 */
export interface BarrelFoundPayload {
  /** Barrel number that was discovered */
  barrelNumber: number;
  /** Wallet address of the winning miner */
  winner: string;
  /** First 16 characters of the winning hash */
  hashPrefix: string;
  /** Token reward amount for this barrel */
  reward: number;
  /** ISO timestamp of discovery */
  timestamp: string;
  /** New difficulty target for next barrel */
  newDifficulty: number;
}
