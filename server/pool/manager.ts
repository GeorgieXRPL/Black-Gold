/**
 * @fileoverview Pool Manager for Black Gold mining pool
 * Orchestrates miner connections, work distribution, and barrel discovery
 */

import { WebSocket } from 'ws';
import {
  Miner,
  WorkUnit,
  ProofSubmission,
  BarrelResult,
  NetworkStats,
  WSMessage,
  WSMessageType,
  ConnectPayload,
  HashratePayload,
  ErrorPayload,
  RateLimitEntry,
  IPTracker,
} from '../types';
import {
  WorkTracker,
  createWorkTracker,
  generateWork,
  validateWork,
  invalidateWork,
  startNewBarrel,
  cleanupExpiredWork,
} from './work';
import {
  DifficultyState,
  createDifficultyState,
  createDifficultyStateForMine,
  adjustDifficulty,
  updateHashrateEstimate,
  difficultyToTarget,
  calculateScaledDifficulty,
} from './difficulty';
import { POOL_CONFIG, RATE_LIMIT_CONFIG, MINE_TIMING, TIMEOUT_REWARDS, MineTimingConfig, ResourceType } from '../../config/constants';
import { getMineRegistry } from '../game/mine-registry';

/**
 * Miner's contribution tracking for share-based rewards
 */
export interface MinerContribution {
  /** Total hash-seconds contributed this period (hashrate × seconds) */
  hashSeconds: number;
  /** Last hashrate update timestamp */
  lastUpdate: number;
  /** Current hashrate for this miner */
  hashrate: number;
}

/**
 * Extended miner info with WebSocket connection
 */
export interface ConnectedMiner extends Miner {
  /** WebSocket connection */
  ws: WebSocket;
  /** Current work unit IDs assigned to this miner */
  activeWorkIds: Set<string>;
  /** Contribution tracking for fair reward distribution */
  contribution: MinerContribution;
}

/**
 * Miner share for reward distribution
 */
export interface MinerShare {
  walletAddress: string;
  hashSeconds: number;
  sharePercent: number;
  reward: number;
}

/**
 * Best hash tracking for timeout/closest-hash system
 */
export interface MinerBestHash {
  /** The best hash found by this miner */
  hash: string;
  /** Nonce that produced this hash */
  nonce: number;
  /** Distance from target (lower = better, as bigint for precision) */
  distance: bigint;
  /** When this best hash was submitted */
  submittedAt: number;
  /** Total valid submissions in this round */
  submissionCount: number;
  /** When miner first joined this round */
  firstSeenAt: number;
}

/**
 * Pending discovery awaiting announcement
 */
export interface PendingDiscovery {
  result: BarrelResult;
  announceAt: number;
  timer: NodeJS.Timeout;
  /** Miner shares at time of discovery */
  shares: MinerShare[];
}

/**
 * Pool manager state
 */
export interface PoolState {
  /** Connected miners by wallet address */
  miners: Map<string, ConnectedMiner>;
  /** Work unit tracker */
  workTracker: WorkTracker;
  /** Pending discovery awaiting announcement (null if mining normally) */
  pendingDiscovery: PendingDiscovery | null;
  /** Difficulty state */
  difficultyState: DifficultyState;
  /** Rate limit tracking by wallet */
  rateLimits: Map<string, RateLimitEntry>;
  /** IP tracking for sybil detection */
  ipTrackers: Map<string, IPTracker>;
  /** Total discoveries found */
  totalDiscoveries: number;
  /** Total rewards distributed */
  totalRewardsDistributed: number;
  /** Discovery history */
  discoveryHistory: BarrelResult[];
  /** Start of current mining period (for share calculation) */
  periodStartTime: number;
  /** Best hash tracking per miner for timeout system */
  bestHashes: Map<string, MinerBestHash>;
  /** When current round started (for timeout calculation) */
  roundStartTime: number;
  /** Accumulated rollover from timed-out rounds */
  rolloverAmount: number;
}

/**
 * Event handlers that can be registered with the pool manager
 */
export interface PoolEventHandlers {
  /** Called when a discovery is found */
  onDiscoveryFound?: (result: BarrelResult) => void | Promise<void>;
  /** Called when a miner connects */
  onMinerConnect?: (miner: Miner) => void;
  /** Called when a miner disconnects */
  onMinerDisconnect?: (walletAddress: string) => void;
  /** Called when network stats change */
  onStatsUpdate?: (stats: NetworkStats) => void;
}

/**
 * Pool Manager class
 * Central coordinator for the mining pool operations
 * Each mine has its own pool manager with mine-specific difficulty
 */
export class PoolManager {
  private state: PoolState;
  private eventHandlers: PoolEventHandlers;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private statsInterval: ReturnType<typeof setInterval> | null = null;
  private timeoutInterval: ReturnType<typeof setInterval> | null = null;
  private mineId: string | null = null;
  private mineConfig: MineTimingConfig;
  private resourceType: ResourceType;

  /**
   * Creates a new PoolManager instance
   * @param eventHandlers - Optional event handlers for pool events
   * @param mineId - Optional mine ID for mine-specific difficulty
   */
  constructor(eventHandlers: PoolEventHandlers = {}, mineId?: string) {
    this.mineId = mineId || null;
    
    // Determine resource type from mine ID (e.g., "oil-ghawar" -> "oil")
    this.resourceType = this.getResourceTypeFromMineId(mineId);
    this.mineConfig = MINE_TIMING[this.resourceType];
    
    // Get mine-specific difficulty if mine ID provided
    let difficultyState: DifficultyState;
    if (mineId) {
      const registry = getMineRegistry();
      const mine = registry.getMine(mineId);
      if (mine) {
        // Use mine's target discovery time for difficulty
        difficultyState = createDifficultyStateForMine(mine.definition.baseDiscoveryTimeMs);
        console.log(
          `[PoolManager] Created for mine ${mineId} (${this.resourceType}): ` +
          `difficulty=${difficultyState.current.toLocaleString()}, ` +
          `target time=${this.mineConfig.targetTimeMs / 60000}min, ` +
          `max time=${this.mineConfig.maxTimeMs ? this.mineConfig.maxTimeMs / 60000 + 'min' : 'unlimited'}`
        );
      } else {
        difficultyState = createDifficultyState();
      }
    } else {
      difficultyState = createDifficultyState();
    }
    
    const now = Date.now();
    this.state = {
      miners: new Map(),
      workTracker: createWorkTracker(),
      pendingDiscovery: null,
      difficultyState,
      rateLimits: new Map(),
      ipTrackers: new Map(),
      totalDiscoveries: 0,
      totalRewardsDistributed: 0,
      discoveryHistory: [],
      periodStartTime: now,
      bestHashes: new Map(),
      roundStartTime: now,
      rolloverAmount: 0,
    };
    this.eventHandlers = eventHandlers;
  }

  /**
   * Extract resource type from mine ID
   * @param mineId - Mine ID like "oil-ghawar" or "coal-appalachian"
   * @returns Resource type
   */
  private getResourceTypeFromMineId(mineId?: string): ResourceType {
    if (!mineId) return 'coal'; // Default
    const prefix = mineId.split('-')[0];
    if (prefix === 'coal' || prefix === 'gold' || prefix === 'oil' || prefix === 'silver') {
      return prefix as ResourceType;
    }
    return 'coal'; // Default fallback
  }

  /**
   * Starts the pool manager background processes
   * - Work cleanup interval
   * - Stats broadcast interval
   * - Round timeout checker (for timed mines)
   */
  public start(): void {
    console.log('[PoolManager] Starting pool manager');

    // Cleanup expired work every 30 seconds
    this.cleanupInterval = setInterval(() => {
      this.state.workTracker = cleanupExpiredWork(this.state.workTracker);
    }, 30_000);

    // Broadcast stats every 10 seconds
    this.statsInterval = setInterval(() => {
      this.broadcastStats();
    }, 10_000);

    // Check for round timeout every second (only for mines with timeout)
    if (this.mineConfig.hasTimeout) {
      this.timeoutInterval = setInterval(() => {
        this.checkRoundTimeout();
      }, 1000);
      console.log(`[PoolManager] Timeout checker enabled: max ${this.mineConfig.maxTimeMs! / 60000}min`);
    }

    console.log('[PoolManager] Pool manager started');
  }

  /**
   * Stops the pool manager and cleans up resources
   */
  public stop(): void {
    console.log('[PoolManager] Stopping pool manager');

    // Force-announce any pending discovery
    this.forceAnnounce();

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }

    if (this.timeoutInterval) {
      clearInterval(this.timeoutInterval);
      this.timeoutInterval = null;
    }

    // Close all miner connections
    for (const miner of this.state.miners.values()) {
      miner.ws.close(1000, 'Pool shutting down');
    }
    this.state.miners.clear();

    console.log('[PoolManager] Pool manager stopped');
  }

  /**
   * Handles a new miner connection
   * @param ws - WebSocket connection
   * @param payload - Connection payload with wallet and core count
   * @param ip - Client IP address
   * @returns True if connection was accepted, false otherwise
   */
  public handleConnect(
    ws: WebSocket,
    payload: ConnectPayload,
    ip: string
  ): boolean {
    const { walletAddress, cores } = payload;

    // Check IP tracking for sybil detection
    if (!this.checkIPLimit(ip, walletAddress)) {
      this.sendError(ws, 'RATE_LIMIT', 'Too many connections from this IP');
      return false;
    }

    // Check if wallet is already connected
    if (this.state.miners.has(walletAddress)) {
      const existingMiner = this.state.miners.get(walletAddress)!;
      existingMiner.ws.close(1000, 'New connection from same wallet');
      this.state.miners.delete(walletAddress);
    }

    // Create miner entry
    const now = new Date();
    const miner: ConnectedMiner = {
      walletAddress,
      ip,
      hashrate: 0,
      connectedAt: now,
      lastSeen: now,
      cores,
      nonceRange: { start: 0, end: 0 }, // Will be set when work is assigned
      ws,
      activeWorkIds: new Set(),
      contribution: {
        hashSeconds: 0,
        lastUpdate: Date.now(),
        hashrate: 0,
      },
    };

    this.state.miners.set(walletAddress, miner);

    // Update IP tracker
    this.updateIPTracker(ip, walletAddress);

    // Initialize rate limit entry
    this.state.rateLimits.set(walletAddress, {
      count: 0,
      windowStart: Date.now(),
      failedCount: 0,
    });

    console.log(
      `[PoolManager] Miner connected: ${walletAddress} (${cores} cores) from ${ip}`
    );

    // Notify handler
    if (this.eventHandlers.onMinerConnect) {
      this.eventHandlers.onMinerConnect(miner);
    }

    // Send initial work
    this.assignWork(walletAddress);

    return true;
  }

  /**
   * Handles miner disconnection
   * @param walletAddress - Disconnecting miner's wallet address
   */
  public handleDisconnect(walletAddress: string): void {
    const miner = this.state.miners.get(walletAddress);
    if (!miner) return;

    // Invalidate all active work for this miner
    for (const workId of miner.activeWorkIds) {
      this.state.workTracker = invalidateWork(this.state.workTracker, workId);
    }

    this.state.miners.delete(walletAddress);

    console.log(`[PoolManager] Miner disconnected: ${walletAddress}`);

    // Notify handler
    if (this.eventHandlers.onMinerDisconnect) {
      this.eventHandlers.onMinerDisconnect(walletAddress);
    }
  }

  /**
   * Updates a miner's reported hashrate and tracks contribution
   * @param payload - Hashrate update payload
   */
  public handleHashrateUpdate(payload: HashratePayload): void {
    const { walletAddress, hashrate } = payload;
    const miner = this.state.miners.get(walletAddress);

    if (!miner) {
      console.log(`[PoolManager] Hashrate update from unknown miner: ${walletAddress}`);
      return;
    }

    // Track contribution: accumulate hash-seconds since last update
    const now = Date.now();
    const secondsElapsed = (now - miner.contribution.lastUpdate) / 1000;
    
    // Add contribution (hashrate × time in seconds)
    // Use the PREVIOUS hashrate for this interval (not the new one)
    if (miner.contribution.hashrate > 0 && secondsElapsed > 0) {
      miner.contribution.hashSeconds += miner.contribution.hashrate * secondsElapsed;
    }
    
    // Update contribution tracking
    miner.contribution.lastUpdate = now;
    miner.contribution.hashrate = hashrate;
    
    miner.hashrate = hashrate;
    miner.lastSeen = new Date();

    // Update network hashrate estimate
    const totalHashrate = this.calculateNetworkHashrate();
    this.state.difficultyState = updateHashrateEstimate(
      this.state.difficultyState,
      totalHashrate
    );
  }

  /**
   * Handles a proof submission from a miner
   * @param submission - The proof submission
   * @returns True if proof was valid, false otherwise
   */
  public async handleSubmission(submission: ProofSubmission): Promise<boolean> {
    const { walletAddress, workUnitId, nonce, hash } = submission;

    // Check rate limit
    if (!this.checkRateLimit(walletAddress)) {
      const miner = this.state.miners.get(walletAddress);
      if (miner) {
        this.sendError(miner.ws, 'RATE_LIMIT', 'Too many submissions');
      }
      return false;
    }

    // Validate work unit
    const workUnit = validateWork(
      this.state.workTracker,
      workUnitId,
      walletAddress
    );

    if (!workUnit) {
      this.incrementFailedSubmission(walletAddress);
      const miner = this.state.miners.get(walletAddress);
      if (miner) {
        this.sendError(miner.ws, 'INVALID_WORK', 'Invalid or expired work unit');
      }
      return false;
    }

    // Validate nonce is within assigned range
    if (nonce < workUnit.nonceStart || nonce >= workUnit.nonceEnd) {
      console.log(
        `[PoolManager] Nonce ${nonce} outside range [${workUnit.nonceStart}, ${workUnit.nonceEnd})`
      );
      this.incrementFailedSubmission(walletAddress);
      return false;
    }

    // Calculate hash distance for best hash tracking (timeout system)
    const hashDistance = this.calculateHashDistance(hash, workUnit.target);
    this.updateBestHash(walletAddress, hash, nonce, hashDistance);

    // Check if hash meets difficulty target (actual solution)
    const meetsTarget = this.validateHash(hash, workUnit.target);
    
    if (!meetsTarget) {
      // Hash doesn't meet target, but we've tracked it for closest-hash fallback
      // This is not a failure - just not a winning solution yet
      return false;
    }

    // TODO: Verify hash computation (should be done by verification module)
    // For now, we trust the submitted hash matches the computation

    console.log(
      `[PoolManager] Valid proof from ${walletAddress}: nonce=${nonce}`
    );

    // Discovery found!
    await this.handleDiscoveryFound(walletAddress, hash, nonce, workUnit);

    return true;
  }

  /**
   * Calculate the distance between a hash and the target
   * Lower distance = closer to winning (better)
   * @param hash - The submitted hash
   * @param target - The difficulty target
   * @returns Distance as bigint (hash - target, or 0 if hash <= target)
   */
  private calculateHashDistance(hash: string, target: string): bigint {
    const hashBigInt = BigInt('0x' + hash);
    const targetBigInt = BigInt('0x' + target);
    
    // If hash is below target (winning), distance is 0
    if (hashBigInt <= targetBigInt) {
      return BigInt(0);
    }
    
    // Otherwise, distance is how far above the target
    return hashBigInt - targetBigInt;
  }

  /**
   * Update a miner's best hash if this submission is better
   * @param walletAddress - Miner's wallet
   * @param hash - Submitted hash
   * @param nonce - Nonce used
   * @param distance - Distance from target
   */
  private updateBestHash(walletAddress: string, hash: string, nonce: number, distance: bigint): void {
    const now = Date.now();
    const existing = this.state.bestHashes.get(walletAddress);
    
    if (!existing) {
      // First submission from this miner this round
      this.state.bestHashes.set(walletAddress, {
        hash,
        nonce,
        distance,
        submittedAt: now,
        submissionCount: 1,
        firstSeenAt: now,
      });
      return;
    }
    
    // Increment submission count
    existing.submissionCount++;
    
    // Check if we're in cooldown period (last 30 seconds)
    if (this.mineConfig.hasTimeout && this.mineConfig.maxTimeMs) {
      const elapsed = now - this.state.roundStartTime;
      const remaining = this.mineConfig.maxTimeMs - elapsed;
      
      if (remaining <= TIMEOUT_REWARDS.COOLDOWN_SECONDS * 1000) {
        // In cooldown - check if improvement is within allowed limit
        if (existing.distance > BigInt(0)) {
          const maxImprovement = existing.distance * BigInt(Math.floor(TIMEOUT_REWARDS.COOLDOWN_MAX_IMPROVEMENT * 100)) / BigInt(100);
          const actualImprovement = existing.distance - distance;
          
          if (actualImprovement > maxImprovement) {
            // Improvement too large in cooldown, cap it
            console.log(`[PoolManager] Cooldown cap: ${walletAddress} improvement capped`);
            return;
          }
        }
      }
    }
    
    // Update if this hash is better (lower distance)
    if (distance < existing.distance) {
      existing.hash = hash;
      existing.nonce = nonce;
      existing.distance = distance;
      existing.submittedAt = now;
    }
  }

  /**
   * Assigns new work to a miner
   * @param walletAddress - Miner's wallet address
   * @param mineId - Optional mine ID for mine-specific difficulty
   * @param mineTarget - Optional mine-specific target hex string
   */
  public assignWork(walletAddress: string, mineId?: string, mineTarget?: string): void {
    const miner = this.state.miners.get(walletAddress);
    if (!miner) return;

    // Use mine-specific target if provided, otherwise fall back to global
    const target = mineTarget || this.state.difficultyState.target;

    const { work, tracker } = generateWork(
      this.state.workTracker,
      walletAddress,
      target
    );

    // Set the mine ID on the work unit
    if (mineId) {
      work.mineId = mineId;
    }

    this.state.workTracker = tracker;
    miner.activeWorkIds.add(work.id);
    miner.nonceRange = { start: work.nonceStart, end: work.nonceEnd };
    miner.lastSeen = new Date();

    // Send work to miner
    this.sendMessage(miner.ws, 'work', work);

    console.log(
      `[PoolManager] Assigned work ${work.id} to ${walletAddress} ` +
        `[${work.nonceStart}, ${work.nonceEnd}) ` +
        `target: ${target.substring(0, 12)}... (mine: ${mineId || 'global'})`
    );
  }

  /**
   * Gets current network statistics
   * @returns Network statistics object
   */
  public getNetworkStats(): NetworkStats {
    const totalHashrate = this.calculateNetworkHashrate();

    return {
      totalMiners: this.state.miners.size,
      networkHashrate: totalHashrate,
      totalDiscoveries: this.state.totalDiscoveries,
      difficulty: this.state.difficultyState.current,
      lastDiscoveryTime: this.state.difficultyState.lastDiscoveryTime
        ? new Date(this.state.difficultyState.lastDiscoveryTime)
        : null,
      totalRewardsDistributed: this.state.totalRewardsDistributed,
      currentRewardPool: 0, // TODO: Get from reward wallet balance
    };
  }

  /**
   * Gets a miner by wallet address
   * @param walletAddress - Wallet address to look up
   * @returns Miner if found, undefined otherwise
   */
  public getMiner(walletAddress: string): ConnectedMiner | undefined {
    return this.state.miners.get(walletAddress);
  }

  /**
   * Gets all connected miners
   * @returns Array of connected miners
   */
  public getAllMiners(): ConnectedMiner[] {
    return Array.from(this.state.miners.values());
  }

  /**
   * Invalidate all active work for all miners
   * Called when difficulty changes to prevent old easy work from being valid
   */
  public invalidateAllWork(): void {
    console.log(`[PoolManager] Invalidating all active work for ${this.state.miners.size} miners`);
    
    for (const miner of this.state.miners.values()) {
      // Invalidate each work unit in the tracker
      for (const workId of miner.activeWorkIds) {
        this.state.workTracker = invalidateWork(this.state.workTracker, workId);
      }
      // Clear the miner's active work
      miner.activeWorkIds.clear();
    }
  }

  /**
   * Gets current difficulty state
   * @returns Current difficulty state
   */
  public getDifficultyState(): DifficultyState {
    return { ...this.state.difficultyState };
  }

  /**
   * Gets discovery history
   * @param limit - Maximum number of results
   * @returns Array of discovery results, most recent first
   */
  public getDiscoveryHistory(limit: number = 100): BarrelResult[] {
    return this.state.discoveryHistory.slice(-limit).reverse();
  }

  // ============ Private Methods ============

  // Announcement delay in milliseconds (configurable, default 30 seconds of suspense)
  private static get ANNOUNCEMENT_DELAY_MS(): number {
    // Import here to avoid circular dependency
    const { POOL_CONFIG } = require('../../config/constants');
    return POOL_CONFIG.ANNOUNCEMENT_DELAY_MS || 30_000;
  }

  /**
   * Check if mining is currently paused (pending discovery announcement)
   */
  public isMiningPaused(): boolean {
    return this.state.pendingDiscovery !== null;
  }

  /**
   * Get time until announcement (in ms), or null if no pending discovery
   */
  public getAnnouncementCountdown(): number | null {
    if (!this.state.pendingDiscovery) return null;
    const remaining = this.state.pendingDiscovery.announceAt - Date.now();
    return Math.max(0, remaining);
  }

  /**
   * Configuration for share-based reward distribution
   * - Finder gets a 20% BONUS on top of their contribution share
   * - This incentivizes finding solutions while still rewarding all contributors
   */
  private static readonly FINDER_BONUS_PERCENT = 20;

  /**
   * Calculate miner shares based on contribution during this mining period
   * @returns Array of miner shares sorted by contribution (highest first)
   */
  private calculateMinerShares(): MinerShare[] {
    const shares: MinerShare[] = [];
    const now = Date.now();
    
    // Finalize all contributions up to now
    for (const miner of this.state.miners.values()) {
      const secondsElapsed = (now - miner.contribution.lastUpdate) / 1000;
      if (miner.contribution.hashrate > 0 && secondsElapsed > 0) {
        miner.contribution.hashSeconds += miner.contribution.hashrate * secondsElapsed;
        miner.contribution.lastUpdate = now;
      }
    }
    
    // Calculate total hash-seconds
    let totalHashSeconds = 0;
    for (const miner of this.state.miners.values()) {
      if (miner.contribution.hashSeconds > 0) {
        totalHashSeconds += miner.contribution.hashSeconds;
      }
    }
    
    // Calculate each miner's share
    for (const miner of this.state.miners.values()) {
      if (miner.contribution.hashSeconds > 0 && totalHashSeconds > 0) {
        const sharePercent = (miner.contribution.hashSeconds / totalHashSeconds) * 100;
        shares.push({
          walletAddress: miner.walletAddress,
          hashSeconds: miner.contribution.hashSeconds,
          sharePercent,
          reward: 0, // Will be calculated when distributing rewards
        });
      }
    }
    
    // Sort by contribution (highest first)
    shares.sort((a, b) => b.hashSeconds - a.hashSeconds);
    
    console.log(
      `[PoolManager] Share calculation: ${shares.length} miners, ` +
      `total ${(totalHashSeconds / 1000).toFixed(1)}k hash-seconds`
    );
    
    return shares;
  }

  /**
   * Reset miner contributions for a new mining period
   */
  private resetContributions(): void {
    const now = Date.now();
    for (const miner of this.state.miners.values()) {
      miner.contribution = {
        hashSeconds: 0,
        lastUpdate: now,
        hashrate: miner.hashrate,
      };
    }
    this.state.periodStartTime = now;
    console.log('[PoolManager] Contributions reset for new mining period');
  }

  /**
   * Get miner shares for external use (e.g., reward distribution)
   */
  public getMinerShares(): MinerShare[] {
    return this.state.pendingDiscovery?.shares || this.calculateMinerShares();
  }

  /**
   * Handles a discovery with 30-second suspense delay
   * Uses share-based reward system for fair distribution
   * @param walletAddress - Winning miner's wallet
   * @param hash - Winning hash
   * @param nonce - Winning nonce
   * @param workUnit - The work unit that was solved
   */
  private async handleDiscoveryFound(
    walletAddress: string,
    hash: string,
    nonce: number,
    workUnit: WorkUnit
  ): Promise<void> {
    const now = new Date();
    const discoveryNumber = workUnit.discoveryNumber;

    console.log(
      `[PoolManager] ⛏️ DISCOVERY #${discoveryNumber} FOUND! Starting countdown...`
    );

    // Calculate miner shares BEFORE announcing (captures state at discovery time)
    const shares = this.calculateMinerShares();
    
    // Log share distribution
    const topMiners = shares.slice(0, 5);
    console.log('[PoolManager] Top contributors:');
    topMiners.forEach((s, i) => {
      console.log(`  ${i + 1}. ${s.walletAddress.slice(0, 8)}... - ${s.sharePercent.toFixed(1)}%`);
    });

    // Create discovery result (winner kept private until announcement)
    const result: BarrelResult = {
      discoveryNumber,
      winner: walletAddress,
      hash,
      nonce,
      totalReward: 0, // Will be set by reward orchestrator
      finderShare: 0, // Will include finder bonus
      vaultShare: 0, // 30% to vault
      timestamp: now,
      mineId: workUnit.mineId,
      resource: 'coal', // Default, should be set by caller
      discoveryName: 'Seam', // Default, should be set by caller
    };

    // Calculate time since last discovery for difficulty adjustment
    const lastDiscoveryTime = this.state.difficultyState.lastDiscoveryTime;
    if (lastDiscoveryTime !== null) {
      const actualTime = now.getTime() - lastDiscoveryTime;
      this.state.difficultyState = adjustDifficulty(
        this.state.difficultyState,
        actualTime
      );
    } else {
      this.state.difficultyState = {
        ...this.state.difficultyState,
        lastDiscoveryTime: now.getTime(),
      };
    }

    // Broadcast PENDING discovery (no winner revealed yet) to build suspense
    const announceAt = Date.now() + PoolManager.ANNOUNCEMENT_DELAY_MS;
    this.broadcastMessage('discovery_pending', {
      discoveryNumber,
      mineId: workUnit.mineId,
      resource: result.resource,
      discoveryName: result.discoveryName,
      announceAt,
      countdownSeconds: PoolManager.ANNOUNCEMENT_DELAY_MS / 1000,
      message: '⛏️ A discovery has been found! Winner will be revealed in 30 seconds...',
    });

    // Set up the delayed announcement
    const timer = setTimeout(() => {
      this.announceDiscovery();
    }, PoolManager.ANNOUNCEMENT_DELAY_MS);

    // Store pending discovery WITH shares for later distribution
    this.state.pendingDiscovery = {
      result,
      announceAt,
      timer,
      shares, // IMPORTANT: Store shares calculated at discovery time
    };

    // Clear all active work - mining pauses during countdown
    for (const miner of this.state.miners.values()) {
      miner.activeWorkIds.clear();
    }

    console.log(
      `[PoolManager] Mining paused at mine ${workUnit.mineId || 'global'}. ` +
      `Winner announced at ${new Date(announceAt).toISOString()}`
    );
  }

  /**
   * Announce the pending discovery winner after the countdown
   * Uses share-based distribution to fairly reward all contributors
   */
  private async announceDiscovery(): Promise<void> {
    if (!this.state.pendingDiscovery) {
      console.warn('[PoolManager] announceDiscovery called but no pending discovery');
      return;
    }

    const { result, shares } = this.state.pendingDiscovery;

    console.log(
      `[PoolManager] 🎉 ANNOUNCING WINNER: ${result.winner} for discovery #${result.discoveryNumber}!`
    );
    
    // Log share distribution for the announcement
    console.log(`[PoolManager] 📊 Share-based distribution to ${shares.length} miners:`);
    const finderShare = shares.find(s => s.walletAddress === result.winner);
    if (finderShare) {
      console.log(`  🏆 Finder ${result.winner.slice(0, 8)}... gets ${finderShare.sharePercent.toFixed(1)}% + ${PoolManager.FINDER_BONUS_PERCENT}% bonus`);
    }

    // Add to history
    this.state.discoveryHistory.push(result);
    this.state.totalDiscoveries++;

    // Start new discovery work
    this.state.workTracker = startNewBarrel(this.state.workTracker, result.hash);

    // Clear pending discovery BEFORE broadcasting to allow new mining
    this.state.pendingDiscovery = null;
    
    // Reset contributions for the new mining period
    this.resetContributions();

    // Broadcast the actual discovery with winner revealed AND shares included
    this.broadcastMessage('discovery_found', {
      ...result,
      announcement: true,
      message: `🏆 ${result.winner.slice(0, 8)}...${result.winner.slice(-4)} found the discovery!`,
      shares: shares.map(s => ({
        wallet: s.walletAddress.slice(0, 8) + '...' + s.walletAddress.slice(-4),
        percent: s.sharePercent.toFixed(1),
        isFinder: s.walletAddress === result.winner,
      })),
      finderBonus: PoolManager.FINDER_BONUS_PERCENT,
      totalContributors: shares.length,
    });

    // Notify event handler for persistence, rewards distribution, etc.
    // Pass shares so the reward orchestrator can distribute proportionally
    if (this.eventHandlers.onDiscoveryFound) {
      // Attach shares to result for reward distribution
      const resultWithShares = {
        ...result,
        shares,
        finderBonus: PoolManager.FINDER_BONUS_PERCENT,
      };
      await this.eventHandlers.onDiscoveryFound(resultWithShares as BarrelResult);
    }

    // IMPORTANT: Recalculate difficulty BEFORE assigning new work
    // This ensures the new target reflects current network hashrate
    let newTarget: string | undefined;
    if (this.mineId) {
      const registry = getMineRegistry();
      registry.recalculateMineDifficulty(this.mineId);
      newTarget = registry.getMineTarget(this.mineId);
      
      // Also update local difficulty state to match
      if (newTarget) {
        const mine = registry.getMine(this.mineId);
        if (mine) {
          this.state.difficultyState.target = newTarget;
          this.state.difficultyState.current = mine.difficulty;
          console.log(
            `[PoolManager] Difficulty recalculated for ${this.mineId}: ` +
            `${mine.difficulty.toLocaleString()}, target: ${newTarget.substring(0, 12)}...`
          );
        }
      }
    }

    // Resume mining - assign new work to all miners with updated difficulty
    for (const miner of this.state.miners.values()) {
      this.assignWork(miner.walletAddress, this.mineId || undefined, newTarget);
    }

    console.log(`[PoolManager] Mining resumed. New work assigned to ${this.state.miners.size} miners.`);
  }

  /**
   * Force-announce a pending discovery (used when stopping the pool)
   */
  public forceAnnounce(): void {
    if (this.state.pendingDiscovery) {
      clearTimeout(this.state.pendingDiscovery.timer);
      // Synchronously announce
      const { result } = this.state.pendingDiscovery;
      this.state.discoveryHistory.push(result);
      this.state.totalDiscoveries++;
      this.state.pendingDiscovery = null;
      console.log(`[PoolManager] Force-announced discovery #${result.discoveryNumber}`);
    }
  }

  /**
   * Validates that a hash meets the difficulty target
   * @param hash - Hash to validate
   * @param target - Difficulty target
   * @returns True if hash is below target
   */
  private validateHash(hash: string, target: string): boolean {
    // Compare hex strings lexicographically
    // A valid hash must be less than the target
    return hash.toLowerCase() < target.toLowerCase();
  }

  /**
   * Calculates total network hashrate from all miners
   * @returns Total hashrate in H/s
   */
  private calculateNetworkHashrate(): number {
    let total = 0;
    for (const miner of this.state.miners.values()) {
      total += miner.hashrate;
    }
    return total;
  }

  /**
   * Checks rate limit for a wallet
   * @param walletAddress - Wallet to check
   * @returns True if within rate limit
   */
  private checkRateLimit(walletAddress: string): boolean {
    const entry = this.state.rateLimits.get(walletAddress);
    if (!entry) return true;

    const now = Date.now();

    // Check backoff
    if (entry.backoffUntil && now < entry.backoffUntil) {
      return false;
    }

    // Check if window expired
    if (now - entry.windowStart > RATE_LIMIT_CONFIG.WINDOW_MS) {
      // Reset window
      entry.count = 1;
      entry.windowStart = now;
      entry.failedCount = 0;
      entry.backoffUntil = undefined;
      return true;
    }

    // Check count
    if (entry.count >= RATE_LIMIT_CONFIG.MAX_SUBMISSIONS_PER_MINUTE) {
      return false;
    }

    entry.count++;
    return true;
  }

  /**
   * Increments failed submission count and applies backoff if needed
   * @param walletAddress - Wallet that failed
   */
  private incrementFailedSubmission(walletAddress: string): void {
    const entry = this.state.rateLimits.get(walletAddress);
    if (!entry) return;

    entry.failedCount++;

    // Apply exponential backoff for repeated failures
    if (entry.failedCount >= 3) {
      const backoffTime = Math.min(
        RATE_LIMIT_CONFIG.INITIAL_BACKOFF_MS *
          Math.pow(RATE_LIMIT_CONFIG.BACKOFF_MULTIPLIER, entry.failedCount - 3),
        RATE_LIMIT_CONFIG.MAX_BACKOFF_MS
      );
      entry.backoffUntil = Date.now() + backoffTime;
      console.log(
        `[PoolManager] Backoff applied to ${walletAddress}: ${backoffTime}ms`
      );
    }
  }

  /**
   * Checks IP connection limit for sybil detection
   * @param ip - IP address
   * @param walletAddress - Wallet address
   * @returns True if connection is allowed
   */
  private checkIPLimit(ip: string, walletAddress: string): boolean {
    const tracker = this.state.ipTrackers.get(ip);

    if (!tracker) {
      return true;
    }

    // Check connection count
    if (tracker.connectionCount >= RATE_LIMIT_CONFIG.MAX_CONNECTIONS_PER_IP) {
      console.log(`[PoolManager] IP ${ip} exceeded connection limit`);
      return false;
    }

    // Check wallets per IP
    if (
      tracker.wallets.size >= RATE_LIMIT_CONFIG.MAX_IPS_PER_WALLET &&
      !tracker.wallets.has(walletAddress)
    ) {
      console.log(`[PoolManager] IP ${ip} has too many wallets`);
      return false;
    }

    return true;
  }

  /**
   * Updates IP tracker for a new connection
   * @param ip - IP address
   * @param walletAddress - Wallet address
   */
  private updateIPTracker(ip: string, walletAddress: string): void {
    let tracker = this.state.ipTrackers.get(ip);

    if (!tracker) {
      tracker = {
        ip,
        wallets: new Set(),
        connectionCount: 0,
        firstSeen: new Date(),
        flagged: false,
      };
      this.state.ipTrackers.set(ip, tracker);
    }

    tracker.wallets.add(walletAddress);
    tracker.connectionCount++;
  }

  /**
   * Sends a typed message to a WebSocket client
   * @param ws - WebSocket connection
   * @param type - Message type
   * @param payload - Message payload
   */
  private sendMessage<T>(ws: WebSocket, type: WSMessageType, payload: T): void {
    const message: WSMessage<T> = {
      type,
      payload,
      timestamp: Date.now(),
    };

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Sends an error message to a WebSocket client
   * @param ws - WebSocket connection
   * @param code - Error code
   * @param message - Error message
   */
  private sendError(ws: WebSocket, code: string, message: string): void {
    const payload: ErrorPayload = { code, message };
    this.sendMessage(ws, 'error', payload);
  }

  /**
   * Broadcasts a message to all connected miners
   * @param type - Message type
   * @param payload - Message payload
   */
  private broadcastMessage<T>(type: WSMessageType, payload: T): void {
    const message: WSMessage<T> = {
      type,
      payload,
      timestamp: Date.now(),
    };

    const data = JSON.stringify(message);

    for (const miner of this.state.miners.values()) {
      if (miner.ws.readyState === WebSocket.OPEN) {
        miner.ws.send(data);
      }
    }
  }

  /**
   * Broadcasts network stats to all connected miners
   */
  private broadcastStats(): void {
    const stats = this.getNetworkStats();
    this.broadcastMessage('stats', stats);

    if (this.eventHandlers.onStatsUpdate) {
      this.eventHandlers.onStatsUpdate(stats);
    }
  }

  // =========================================================================
  // TIMEOUT SYSTEM METHODS
  // =========================================================================

  /**
   * Check if the round has timed out (called every second)
   * Only applies to mines with hasTimeout = true
   */
  private checkRoundTimeout(): void {
    // Skip if no timeout configured or pending discovery
    if (!this.mineConfig.hasTimeout || !this.mineConfig.maxTimeMs) return;
    if (this.state.pendingDiscovery) return;
    
    const elapsed = Date.now() - this.state.roundStartTime;
    
    if (elapsed >= this.mineConfig.maxTimeMs) {
      console.log(`[PoolManager] Round timeout reached for ${this.mineId} after ${elapsed / 1000}s`);
      this.handleTimeoutWinner();
    }
  }

  /**
   * Handle round timeout - find closest hash winner
   */
  private async handleTimeoutWinner(): Promise<void> {
    const winner = this.findClosestHashWinner();
    
    if (!winner) {
      // No qualified winner - rollover everything except vault
      console.log(`[PoolManager] No qualified winner for timeout, rolling over`);
      const baseReward = this.calculateBaseReward();
      const totalReward = baseReward + this.state.rolloverAmount;
      
      // 70% rolls over (finder share), 30% to vault
      this.state.rolloverAmount += totalReward * TIMEOUT_REWARDS.SOLUTION_FINDER_SHARE;
      
      // Broadcast timeout with no winner
      this.broadcastMessage('timeout_winner', {
        mineId: this.mineId,
        winner: null,
        reason: 'No qualified miners',
        rolloverAmount: this.state.rolloverAmount,
        nextRoundIn: POOL_CONFIG.ANNOUNCEMENT_DELAY_MS,
      });
      
      // Start new round after delay
      setTimeout(() => this.startNewRound(false), POOL_CONFIG.ANNOUNCEMENT_DELAY_MS);
      return;
    }
    
    // Calculate rewards for timeout scenario
    const baseReward = this.calculateBaseReward();
    const totalReward = baseReward + this.state.rolloverAmount;
    
    const finderShare = totalReward * TIMEOUT_REWARDS.TIMEOUT_FINDER_SHARE;
    const vaultShare = totalReward * TIMEOUT_REWARDS.VAULT_SHARE;
    const rolloverShare = totalReward * TIMEOUT_REWARDS.ROLLOVER_SHARE;
    
    // Finder bonus (10% of finder share for timeout)
    const finderBonus = finderShare * TIMEOUT_REWARDS.TIMEOUT_FINDER_BONUS;
    
    console.log(
      `[PoolManager] Timeout winner: ${winner.walletAddress} ` +
      `(distance: ${winner.bestHash.distance}, submissions: ${winner.bestHash.submissionCount})`
    );
    
    // Calculate shares for all participants
    const shares = this.calculateMinerShares();
    
    // Create timeout result (similar to BarrelResult but for timeout)
    const timeoutResult = {
      type: 'timeout' as const,
      mineId: this.mineId,
      winner: winner.walletAddress,
      winnerHash: winner.bestHash.hash,
      totalReward,
      finderShare,
      finderBonus,
      vaultShare,
      rolloverShare,
      shares,
      timestamp: Date.now(),
    };
    
    // Broadcast timeout winner
    this.broadcastMessage('timeout_winner', {
      mineId: this.mineId,
      mineName: this.getMineName(),
      resource: this.resourceType,
      winner: winner.walletAddress,
      winnerHash: winner.bestHash.hash.slice(0, 16) + '...',
      totalReward,
      finderShare,
      vaultShare,
      rolloverAmount: rolloverShare,
      participantCount: this.state.bestHashes.size,
      shares: shares.slice(0, 10), // Top 10 for UI
      nextRoundIn: POOL_CONFIG.ANNOUNCEMENT_DELAY_MS,
    });
    
    // Update rollover for next round
    this.state.rolloverAmount = rolloverShare;
    
    // Distribute rewards (would integrate with reward orchestrator)
    // For now, just log
    console.log(`[PoolManager] Timeout rewards: finder=${finderShare}, vault=${vaultShare}, rollover=${rolloverShare}`);
    
    // Start new round after announcement delay
    setTimeout(() => this.startNewRound(true), POOL_CONFIG.ANNOUNCEMENT_DELAY_MS);
  }

  /**
   * Find the miner with the closest hash who qualifies
   * @returns Winner info or null if no qualified miners
   */
  private findClosestHashWinner(): { walletAddress: string; bestHash: MinerBestHash } | null {
    let winner: { walletAddress: string; bestHash: MinerBestHash } | null = null;
    
    for (const [walletAddress, bestHash] of this.state.bestHashes) {
      // Check minimum participation requirements
      if (!this.isQualifiedForClosest(bestHash)) {
        continue;
      }
      
      // Check if this is better than current winner
      if (!winner || bestHash.distance < winner.bestHash.distance) {
        winner = { walletAddress, bestHash };
      }
    }
    
    return winner;
  }

  /**
   * Check if a miner qualifies for closest-hash win
   * Must have minimum submissions and been in round for minimum time
   */
  private isQualifiedForClosest(bestHash: MinerBestHash): boolean {
    // Check minimum submissions
    if (bestHash.submissionCount < TIMEOUT_REWARDS.MIN_SUBMISSIONS) {
      return false;
    }
    
    // Check minimum time in round
    const roundDuration = Date.now() - this.state.roundStartTime;
    const timeInRound = Date.now() - bestHash.firstSeenAt;
    const timePercent = timeInRound / roundDuration;
    
    if (timePercent < TIMEOUT_REWARDS.MIN_TIME_PERCENT) {
      return false;
    }
    
    return true;
  }

  /**
   * Calculate base reward for the current round
   * This would be based on mine configuration
   */
  private calculateBaseReward(): number {
    // TODO: Get from mine configuration or token economics
    // For now, use a placeholder based on resource type
    const baseRewards: Record<ResourceType, number> = {
      coal: 100,
      silver: 200,
      oil: 300,
      gold: 500,
    };
    return baseRewards[this.resourceType] || 100;
  }

  /**
   * Get the mine name for display
   */
  private getMineName(): string {
    if (!this.mineId) return 'Unknown Mine';
    const registry = getMineRegistry();
    const mine = registry.getMine(this.mineId);
    return mine?.definition.name || this.mineId;
  }

  /**
   * Start a new mining round
   * @param clearRollover - Whether to clear rollover (true if actual solution was found)
   */
  private startNewRound(keepRollover: boolean): void {
    const now = Date.now();
    
    // Reset round state
    this.state.roundStartTime = now;
    this.state.bestHashes.clear();
    this.state.periodStartTime = now;
    
    // Clear rollover if actual solution was found
    if (!keepRollover) {
      this.state.rolloverAmount = 0;
    }
    
    // Reset miner contributions
    for (const miner of this.state.miners.values()) {
      miner.contribution = {
        hashSeconds: 0,
        lastUpdate: now,
        hashrate: miner.hashrate,
      };
    }
    
    // Generate new work for all miners
    const registry = getMineRegistry();
    registry.recalculateMineDifficulty(this.mineId!);
    const target = registry.getMineTarget(this.mineId!);
    
    for (const [walletAddress] of this.state.miners) {
      this.assignWork(walletAddress, this.mineId!, target);
    }
    
    console.log(
      `[PoolManager] New round started for ${this.mineId} ` +
      `(rollover: ${this.state.rolloverAmount}, miners: ${this.state.miners.size})`
    );
  }

  /**
   * Get round status for broadcasting to clients
   */
  public getRoundStatus(): {
    roundStartTime: number;
    maxTime: number | null;
    timeRemaining: number | null;
    rolloverAmount: number;
    leaderboard: Array<{ wallet: string; distance: string; submissions: number }>;
  } {
    const elapsed = Date.now() - this.state.roundStartTime;
    const timeRemaining = this.mineConfig.maxTimeMs 
      ? Math.max(0, this.mineConfig.maxTimeMs - elapsed)
      : null;
    
    // Build leaderboard (top 10 closest hashes)
    const sorted = Array.from(this.state.bestHashes.entries())
      .filter(([, bh]) => this.isQualifiedForClosest(bh))
      .sort((a, b) => {
        if (a[1].distance < b[1].distance) return -1;
        if (a[1].distance > b[1].distance) return 1;
        return 0;
      })
      .slice(0, 10);
    
    const leaderboard = sorted.map(([wallet, bh]) => ({
      wallet: wallet.slice(0, 8) + '...',
      distance: bh.distance.toString(),
      submissions: bh.submissionCount,
    }));
    
    return {
      roundStartTime: this.state.roundStartTime,
      maxTime: this.mineConfig.maxTimeMs,
      timeRemaining,
      rolloverAmount: this.state.rolloverAmount,
      leaderboard,
    };
  }

  /**
   * Get a miner's best hash info
   */
  public getMinerBestHash(walletAddress: string): MinerBestHash | undefined {
    return this.state.bestHashes.get(walletAddress);
  }
}
