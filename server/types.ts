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
  /** Header data to hash (includes previous discovery hash) */
  discoveryHeader: string;
  /** Difficulty target - hash must be below this */
  target: string;
  /** Start of nonce range for this miner */
  nonceStart: number;
  /** End of nonce range for this miner */
  nonceEnd: number;
  /** When this work was issued */
  timestamp: number;
  /** Current discovery number */
  discoveryNumber: number;
  /** Mine ID this work is for */
  mineId: string;
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

/** Result of a successful discovery (legacy alias) */
export interface BarrelResult {
  /** Discovery number */
  discoveryNumber: number;
  /** Winning miner's wallet address */
  winner: string;
  /** Winning hash */
  hash: string;
  /** Winning nonce */
  nonce: number;
  /** Total reward amount */
  totalReward: number;
  /** Finder's instant share (70%) */
  finderShare: number;
  /** Vault share (30%) */
  vaultShare: number;
  /** When the discovery was found */
  timestamp: Date;
  /** Mine ID */
  mineId: string;
  /** Resource type */
  resource: string;
  /** Discovery name (Seam/Nugget/Gusher/Lode) */
  discoveryName: string;
  /** Transaction signature for reward */
  txSignature?: string;
  /** Was jackpot triggered */
  isJackpot?: boolean;
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
  /** Total discoveries found */
  totalDiscoveries: number;
  /** Current difficulty */
  difficulty: number;
  /** Time of last discovery */
  lastDiscoveryTime: Date | null;
  /** Total rewards distributed */
  totalRewardsDistributed: number;
  /** Current reward pool */
  currentRewardPool: number;
}

/** WebSocket message types */
export type WSMessageType =
  | 'connect'
  | 'disconnect'
  | 'join_mine'
  | 'leave_mine'
  | 'work'
  | 'submit'
  | 'result'
  | 'stats'
  | 'mine_stats'
  | 'error'
  | 'hashrate'
  | 'discovery_found'
  | 'discovery_pending'
  | 'stake'
  | 'unstake'
  | 'set_home'
  | 'start_expedition'
  | 'leave_expedition'
  | 'rally_defense'
  | 'raid_result'
  | 'game_event'
  | 'get_activity'
  | 'activity_feed'
  | 'vault_distribution'
  | 'spoils_distribution'
  | 'syndicate_action'
  | 'syndicate_raid'
  | 'syndicate_update'
  | 'miner_joined'
  | 'miner_left'
  | 'request_work';

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
  /** Target discovery time in milliseconds */
  targetDiscoveryTimeMs: number;
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
 * Discovery found event payload broadcast to all miners
 */
export interface DiscoveryFoundPayload {
  /** Discovery number that was made */
  discoveryNumber: number;
  /** Wallet address of the winning miner */
  winner: string;
  /** First 16 characters of the winning hash */
  hashPrefix: string;
  /** Total reward amount */
  totalReward: number;
  /** Finder's instant share (70%) */
  finderShare: number;
  /** Vault share (30%) */
  vaultShare: number;
  /** ISO timestamp of discovery */
  timestamp: string;
  /** New difficulty target for next discovery */
  newDifficulty: number;
  /** Mine ID */
  mineId: string;
  /** Resource type */
  resource: string;
  /** Discovery name (Seam/Nugget/Gusher/Lode) */
  discoveryName: string;
  /** Discovery verb (struck/found/hit/discovered) */
  discoveryVerb: string;
  /** Was jackpot triggered */
  isJackpot: boolean;
}

/** Vault distribution payload */
export interface VaultDistributionPayload {
  /** Mine ID */
  mineId: string;
  /** Total distributed */
  totalDistributed: number;
  /** Number of miners who received */
  minerCount: number;
  /** User's individual payout (if applicable) */
  yourPayout?: number;
  /** User's share percentage */
  yourSharePercent?: number;
  /** Timestamp */
  timestamp: string;
}

/** Defender spoils payload */
export interface SpoilsDistributionPayload {
  /** Failed raid ID */
  raidId: string;
  /** Total spoils distributed to defenders */
  spoilsAmount: number;
  /** Amount burned */
  burnedAmount: number;
  /** User's payout (if they were a defender) */
  yourPayout?: number;
  /** Timestamp */
  timestamp: string;
}

/** Syndicate-related payloads */
export interface SyndicateActionPayload {
  /** Action type */
  action: 'create' | 'join' | 'leave' | 'invite' | 'kick' | 'promote' | 'demote' | 'settings' | 'treasury';
  /** Syndicate ID */
  syndicateId: string;
  /** Target wallet (for invite/kick/promote/demote) */
  targetWallet?: string;
  /** Settings update (for settings action) */
  settings?: Partial<{
    rewardSplit: number;
    raidCoordination: boolean;
    defenseAlerts: boolean;
  }>;
  /** Treasury amount (for deposit/withdraw) */
  amount?: number;
}

/** Syndicate raid payload */
export interface SyndicateRaidPayload {
  /** Action type */
  action: 'start' | 'join' | 'leave';
  /** Syndicate ID */
  syndicateId: string;
  /** Target mine */
  targetMineId?: string;
  /** Bet amount */
  betAmount?: number;
}
