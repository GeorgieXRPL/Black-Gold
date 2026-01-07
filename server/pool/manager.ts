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
  adjustDifficulty,
  updateHashrateEstimate,
} from './difficulty';
import { POOL_CONFIG, RATE_LIMIT_CONFIG } from '../../config/constants';

/**
 * Extended miner info with WebSocket connection
 */
export interface ConnectedMiner extends Miner {
  /** WebSocket connection */
  ws: WebSocket;
  /** Current work unit IDs assigned to this miner */
  activeWorkIds: Set<string>;
}

/**
 * Pool manager state
 */
export interface PoolState {
  /** Connected miners by wallet address */
  miners: Map<string, ConnectedMiner>;
  /** Work unit tracker */
  workTracker: WorkTracker;
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
 */
export class PoolManager {
  private state: PoolState;
  private eventHandlers: PoolEventHandlers;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private statsInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Creates a new PoolManager instance
   * @param eventHandlers - Optional event handlers for pool events
   */
  constructor(eventHandlers: PoolEventHandlers = {}) {
    this.state = {
      miners: new Map(),
      workTracker: createWorkTracker(),
      difficultyState: createDifficultyState(),
      rateLimits: new Map(),
      ipTrackers: new Map(),
      totalDiscoveries: 0,
      totalRewardsDistributed: 0,
      discoveryHistory: [],
    };
    this.eventHandlers = eventHandlers;
  }

  /**
   * Starts the pool manager background processes
   * - Work cleanup interval
   * - Stats broadcast interval
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

    console.log('[PoolManager] Pool manager started');
  }

  /**
   * Stops the pool manager and cleans up resources
   */
  public stop(): void {
    console.log('[PoolManager] Stopping pool manager');

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
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
   * Updates a miner's reported hashrate
   * @param payload - Hashrate update payload
   */
  public handleHashrateUpdate(payload: HashratePayload): void {
    const { walletAddress, hashrate } = payload;
    const miner = this.state.miners.get(walletAddress);

    if (!miner) {
      console.log(`[PoolManager] Hashrate update from unknown miner: ${walletAddress}`);
      return;
    }

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

    // Validate hash meets difficulty target
    if (!this.validateHash(hash, workUnit.target)) {
      console.log(`[PoolManager] Hash does not meet target`);
      this.incrementFailedSubmission(walletAddress);
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
   * Assigns new work to a miner
   * @param walletAddress - Miner's wallet address
   */
  public assignWork(walletAddress: string): void {
    const miner = this.state.miners.get(walletAddress);
    if (!miner) return;

    const { work, tracker } = generateWork(
      this.state.workTracker,
      walletAddress,
      this.state.difficultyState.target
    );

    this.state.workTracker = tracker;
    miner.activeWorkIds.add(work.id);
    miner.nonceRange = { start: work.nonceStart, end: work.nonceEnd };
    miner.lastSeen = new Date();

    // Send work to miner
    this.sendMessage(miner.ws, 'work', work);

    console.log(
      `[PoolManager] Assigned work ${work.id} to ${walletAddress} ` +
        `[${work.nonceStart}, ${work.nonceEnd})`
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

  /**
   * Handles a discovery
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
      `[PoolManager] ⛏️ DISCOVERY #${discoveryNumber} FOUND by ${walletAddress}!`
    );

    // Create discovery result
    const result: BarrelResult = {
      discoveryNumber,
      winner: walletAddress,
      hash,
      nonce,
      totalReward: 0, // TODO: Calculate based on reward pool
      finderShare: 0, // 70%
      vaultShare: 0, // 30%
      timestamp: now,
      mineId: workUnit.mineId,
      resource: 'coal', // Default, should be set by caller
      discoveryName: 'Seam', // Default, should be set by caller
    };

    // Add to history
    this.state.discoveryHistory.push(result);
    this.state.totalDiscoveries++;

    // Calculate time since last discovery for difficulty adjustment
    const lastDiscoveryTime = this.state.difficultyState.lastDiscoveryTime;
    if (lastDiscoveryTime !== null) {
      const actualTime = now.getTime() - lastDiscoveryTime;
      this.state.difficultyState = adjustDifficulty(
        this.state.difficultyState,
        actualTime
      );
    } else {
      // First discovery, just update the timestamp
      this.state.difficultyState = {
        ...this.state.difficultyState,
        lastDiscoveryTime: now.getTime(),
      };
    }

    // Start new discovery work
    this.state.workTracker = startNewBarrel(this.state.workTracker, hash);

    // Broadcast discovery found to all miners
    this.broadcastMessage('discovery_found', result);

    // Notify event handler
    if (this.eventHandlers.onDiscoveryFound) {
      await this.eventHandlers.onDiscoveryFound(result);
    }

    // Assign new work to all miners
    for (const miner of this.state.miners.values()) {
      miner.activeWorkIds.clear();
      this.assignWork(miner.walletAddress);
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
}
