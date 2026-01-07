/**
 * @fileoverview Stake Manager for Black Gold v2
 * Manages staking operations, power calculations, and tier tracking
 * Includes unstake queue system to prevent mid-raid exploits
 */

import {
  StakeRecord,
  StakeTier,
  STAKE_TIERS,
  getStakeTier,
  calculateEffectiveHashrate,
  calculateDefensePower,
  MinerGameState,
} from './types';
import { getMineRegistry } from './mine-registry';
import { ResourceType } from '../../config/mines';

/**
 * Unstake queue entry
 * Stores pending unstake requests during active events
 */
export interface UnstakeRequest {
  id: string;
  walletAddress: string;
  mineId: string;
  amount: number;
  requestedAt: Date;
  reason: 'raid_attacker' | 'raid_defender' | 'expedition_active';
  estimatedProcessTime: Date;
}

/**
 * Unstake result
 */
export interface UnstakeResult {
  success: boolean;
  queued: boolean;
  queuePosition?: number;
  estimatedWait?: number; // in seconds
  error?: string;
}

/**
 * Stake Manager class
 * Handles all staking operations and calculations
 */
export class StakeManager {
  /** Stakes by wallet address */
  private stakes: Map<string, StakeRecord[]> = new Map();
  
  /** Miner game states */
  private minerStates: Map<string, MinerGameState> = new Map();

  /** Pending rewards from defender spoils and other sources (wallet -> amount) */
  private pendingRewards: Map<string, number> = new Map();

  /** Unstake queue for requests made during active events */
  private unstakeQueue: Map<string, UnstakeRequest[]> = new Map();

  /** Active raids by wallet (wallet -> raid IDs) */
  private activeRaidsByWallet: Map<string, Set<string>> = new Map();

  /** Mines currently under attack (mineId -> attack count) */
  private minesUnderAttack: Map<string, number> = new Map();

  /** Maximum wait time for queued unstakes in ms (15 minutes) */
  private readonly MAX_QUEUE_WAIT_MS = 15 * 60 * 1000;

  /**
   * Get or create miner game state
   */
  getMinerState(walletAddress: string): MinerGameState {
    let state = this.minerStates.get(walletAddress);
    if (!state) {
      state = {
        walletAddress,
        homeBaseMineId: null,
        activeMineId: null,
        currentExpeditionId: null,
        totalStake: 0,
        cooldowns: [],
        loyaltyDays: 0,
        homeBaseJoinedAt: null,
      };
      this.minerStates.set(walletAddress, state);
    }
    return state;
  }

  /**
   * Set a miner's home base
   */
  setHomeBase(walletAddress: string, mineId: string): boolean {
    const registry = getMineRegistry();
    const mine = registry.getMine(mineId);
    if (!mine) {
      console.log(`[StakeManager] Mine ${mineId} not found`);
      return false;
    }

    const state = this.getMinerState(walletAddress);
    
    // Update home base
    state.homeBaseMineId = mineId;
    state.activeMineId = mineId;
    state.homeBaseJoinedAt = new Date();
    state.loyaltyDays = 0;

    console.log(`[StakeManager] ${walletAddress} set home base to ${mine.definition.name}`);
    return true;
  }

  /**
   * Stake tokens at a mine
   */
  stake(walletAddress: string, mineId: string, amount: number): boolean {
    if (amount <= 0) {
      console.log(`[StakeManager] Invalid stake amount: ${amount}`);
      return false;
    }

    const registry = getMineRegistry();
    const mine = registry.getMine(mineId);
    if (!mine) {
      console.log(`[StakeManager] Mine ${mineId} not found`);
      return false;
    }

    const state = this.getMinerState(walletAddress);
    
    // If this is their first stake, set as home base
    if (!state.homeBaseMineId) {
      this.setHomeBase(walletAddress, mineId);
    }

    // Create stake record
    const record: StakeRecord = {
      walletAddress,
      mineId,
      amount,
      stakedAt: new Date(),
      isHomeBase: mineId === state.homeBaseMineId,
      loyaltyDays: 0,
    };

    // Add to stakes
    let walletStakes = this.stakes.get(walletAddress);
    if (!walletStakes) {
      walletStakes = [];
      this.stakes.set(walletAddress, walletStakes);
    }
    
    // Check if already has a stake at this mine
    const existingIndex = walletStakes.findIndex(s => s.mineId === mineId);
    if (existingIndex >= 0) {
      // Add to existing stake
      walletStakes[existingIndex].amount += amount;
    } else {
      walletStakes.push(record);
    }

    // Update totals
    state.totalStake += amount;
    registry.updateMineStake(mineId, amount);

    const tier = getStakeTier(this.getStakeAtMine(walletAddress, mineId));
    console.log(
      `[StakeManager] ${walletAddress} staked ${amount} at ${mine.definition.name} ` +
      `(Tier: ${tier.name}, Total: ${this.getStakeAtMine(walletAddress, mineId)})`
    );

    return true;
  }

  /**
   * Request to withdraw stake from a mine
   * May be queued if user has active raids or mine is under attack
   */
  requestUnstake(walletAddress: string, mineId: string, amount: number): UnstakeResult {
    const walletStakes = this.stakes.get(walletAddress);
    if (!walletStakes) {
      return { success: false, queued: false, error: 'No stakes found' };
    }

    const stakeIndex = walletStakes.findIndex(s => s.mineId === mineId);
    if (stakeIndex < 0) {
      return { success: false, queued: false, error: 'No stake at this mine' };
    }

    const stake = walletStakes[stakeIndex];
    if (amount > stake.amount) {
      amount = stake.amount; // Unstake all
    }

    // Check if user has active raids
    const activeRaids = this.activeRaidsByWallet.get(walletAddress);
    if (activeRaids && activeRaids.size > 0) {
      return this.queueUnstake(walletAddress, mineId, amount, 'raid_attacker');
    }

    // Check if mine is under attack (for defenders)
    const attackCount = this.minesUnderAttack.get(mineId) || 0;
    if (attackCount > 0) {
      return this.queueUnstake(walletAddress, mineId, amount, 'raid_defender');
    }

    // Check if user has active expedition
    const state = this.getMinerState(walletAddress);
    if (state.currentExpeditionId) {
      return this.queueUnstake(walletAddress, mineId, amount, 'expedition_active');
    }

    // No active events - process immediately
    const success = this.processUnstake(walletAddress, mineId, amount);
    return { success, queued: false };
  }

  /**
   * Queue an unstake request for later processing
   */
  private queueUnstake(
    walletAddress: string,
    mineId: string,
    amount: number,
    reason: UnstakeRequest['reason']
  ): UnstakeResult {
    const request: UnstakeRequest = {
      id: `unstake_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      walletAddress,
      mineId,
      amount,
      requestedAt: new Date(),
      reason,
      estimatedProcessTime: new Date(Date.now() + 10 * 60 * 1000), // 10 min estimate
    };

    let queue = this.unstakeQueue.get(walletAddress);
    if (!queue) {
      queue = [];
      this.unstakeQueue.set(walletAddress, queue);
    }

    queue.push(request);

    console.log(
      `[StakeManager] Queued unstake for ${walletAddress}: ${amount} from ${mineId} ` +
      `(reason: ${reason}, position: ${queue.length})`
    );

    return {
      success: true,
      queued: true,
      queuePosition: queue.length,
      estimatedWait: 10 * 60, // 10 minutes in seconds
    };
  }

  /**
   * Process an unstake (internal method, always executes)
   */
  private processUnstake(walletAddress: string, mineId: string, amount: number): boolean {
    const walletStakes = this.stakes.get(walletAddress);
    if (!walletStakes) return false;

    const stakeIndex = walletStakes.findIndex(s => s.mineId === mineId);
    if (stakeIndex < 0) return false;

    const stake = walletStakes[stakeIndex];
    if (amount > stake.amount) {
      amount = stake.amount;
    }

    stake.amount -= amount;
    if (stake.amount <= 0) {
      walletStakes.splice(stakeIndex, 1);
    }

    // Update totals
    const state = this.getMinerState(walletAddress);
    state.totalStake -= amount;

    const registry = getMineRegistry();
    registry.updateMineStake(mineId, -amount);

    console.log(`[StakeManager] ${walletAddress} unstaked ${amount} from ${mineId}`);
    return true;
  }

  /**
   * Legacy unstake method (bypasses queue, use for internal calls only)
   */
  unstake(walletAddress: string, mineId: string, amount: number): boolean {
    return this.processUnstake(walletAddress, mineId, amount);
  }

  /**
   * Register an active raid for a wallet
   */
  registerActiveRaid(walletAddress: string, raidId: string): void {
    let raids = this.activeRaidsByWallet.get(walletAddress);
    if (!raids) {
      raids = new Set();
      this.activeRaidsByWallet.set(walletAddress, raids);
    }
    raids.add(raidId);
    console.log(`[StakeManager] Registered active raid ${raidId} for ${walletAddress}`);
  }

  /**
   * Unregister an active raid for a wallet
   * Also processes any queued unstakes for this wallet
   */
  unregisterActiveRaid(walletAddress: string, raidId: string): void {
    const raids = this.activeRaidsByWallet.get(walletAddress);
    if (raids) {
      raids.delete(raidId);
      if (raids.size === 0) {
        this.activeRaidsByWallet.delete(walletAddress);
        // Process queued unstakes for this wallet
        this.processQueuedUnstakes(walletAddress);
      }
    }
    console.log(`[StakeManager] Unregistered active raid ${raidId} for ${walletAddress}`);
  }

  /**
   * Register a mine as under attack
   */
  registerMineUnderAttack(mineId: string): void {
    const current = this.minesUnderAttack.get(mineId) || 0;
    this.minesUnderAttack.set(mineId, current + 1);
    console.log(`[StakeManager] Mine ${mineId} under attack (count: ${current + 1})`);
  }

  /**
   * Unregister a mine attack
   * Also processes queued unstakes for stakers at that mine
   */
  unregisterMineAttack(mineId: string): void {
    const current = this.minesUnderAttack.get(mineId) || 0;
    if (current <= 1) {
      this.minesUnderAttack.delete(mineId);
      // Process queued unstakes for defenders at this mine
      this.processQueuedUnstakesForMine(mineId);
    } else {
      this.minesUnderAttack.set(mineId, current - 1);
    }
    console.log(`[StakeManager] Mine ${mineId} attack ended (remaining: ${Math.max(0, current - 1)})`);
  }

  /**
   * Process queued unstakes for a wallet
   */
  private processQueuedUnstakes(walletAddress: string): void {
    const queue = this.unstakeQueue.get(walletAddress);
    if (!queue || queue.length === 0) return;

    // Check if wallet still has any blocking conditions
    const activeRaids = this.activeRaidsByWallet.get(walletAddress);
    if (activeRaids && activeRaids.size > 0) return;

    const state = this.getMinerState(walletAddress);
    if (state.currentExpeditionId) return;

    console.log(`[StakeManager] Processing ${queue.length} queued unstakes for ${walletAddress}`);

    // Process all queued unstakes
    for (const request of queue) {
      // Check if mine is still under attack
      const attackCount = this.minesUnderAttack.get(request.mineId) || 0;
      if (attackCount > 0 && request.reason === 'raid_defender') {
        continue; // Keep in queue
      }

      this.processUnstake(request.walletAddress, request.mineId, request.amount);
    }

    // Clear processed requests (keep ones still blocked)
    const remaining = queue.filter(r => {
      if (r.reason === 'raid_defender') {
        const attackCount = this.minesUnderAttack.get(r.mineId) || 0;
        return attackCount > 0;
      }
      return false;
    });

    if (remaining.length > 0) {
      this.unstakeQueue.set(walletAddress, remaining);
    } else {
      this.unstakeQueue.delete(walletAddress);
    }
  }

  /**
   * Process queued unstakes for defenders at a specific mine
   */
  private processQueuedUnstakesForMine(mineId: string): void {
    console.log(`[StakeManager] Processing queued unstakes for mine ${mineId}`);

    for (const [walletAddress, queue] of this.unstakeQueue) {
      const mineRequests = queue.filter(r => r.mineId === mineId && r.reason === 'raid_defender');
      
      for (const request of mineRequests) {
        this.processUnstake(request.walletAddress, request.mineId, request.amount);
      }

      // Remove processed requests
      const remaining = queue.filter(r => !(r.mineId === mineId && r.reason === 'raid_defender'));
      if (remaining.length > 0) {
        this.unstakeQueue.set(walletAddress, remaining);
      } else {
        this.unstakeQueue.delete(walletAddress);
      }
    }
  }

  /**
   * Get queued unstakes for a wallet
   */
  getQueuedUnstakes(walletAddress: string): UnstakeRequest[] {
    return this.unstakeQueue.get(walletAddress) || [];
  }

  /**
   * Check if wallet has any queued unstakes
   */
  hasQueuedUnstakes(walletAddress: string): boolean {
    const queue = this.unstakeQueue.get(walletAddress);
    return queue ? queue.length > 0 : false;
  }

  /**
   * Force process all expired queue items (safety valve)
   */
  processExpiredQueueItems(): void {
    const now = Date.now();

    for (const [walletAddress, queue] of this.unstakeQueue) {
      const expired = queue.filter(
        r => now - r.requestedAt.getTime() > this.MAX_QUEUE_WAIT_MS
      );

      for (const request of expired) {
        console.log(
          `[StakeManager] Force processing expired unstake for ${walletAddress} ` +
          `(waited ${Math.floor((now - request.requestedAt.getTime()) / 1000)}s)`
        );
        this.processUnstake(request.walletAddress, request.mineId, request.amount);
      }

      // Remove expired from queue
      const remaining = queue.filter(
        r => now - r.requestedAt.getTime() <= this.MAX_QUEUE_WAIT_MS
      );

      if (remaining.length > 0) {
        this.unstakeQueue.set(walletAddress, remaining);
      } else {
        this.unstakeQueue.delete(walletAddress);
      }
    }
  }

  /**
   * Get stake amount at a specific mine
   */
  getStakeAtMine(walletAddress: string, mineId: string): number {
    const walletStakes = this.stakes.get(walletAddress);
    if (!walletStakes) return 0;

    const stake = walletStakes.find(s => s.mineId === mineId);
    return stake?.amount || 0;
  }

  /**
   * Get total stake across all mines for a wallet
   */
  getTotalStake(walletAddress: string): number {
    return this.getMinerState(walletAddress).totalStake;
  }

  /**
   * Get all stakes for a wallet
   */
  getWalletStakes(walletAddress: string): StakeRecord[] {
    return this.stakes.get(walletAddress) || [];
  }

  /**
   * Get stake tier for a wallet at a specific mine
   */
  getStakeTierAtMine(walletAddress: string, mineId: string): StakeTier {
    const stakeAmount = this.getStakeAtMine(walletAddress, mineId);
    return getStakeTier(stakeAmount);
  }

  /**
   * Get effective hashrate for a miner at their current mine
   */
  getEffectiveHashrate(
    walletAddress: string,
    baseHashrate: number,
    mineId: string
  ): number {
    const registry = getMineRegistry();
    const mine = registry.getMine(mineId);
    if (!mine) return baseHashrate;

    const stakeAmount = this.getStakeAtMine(walletAddress, mineId);
    const state = this.getMinerState(walletAddress);
    
    return calculateEffectiveHashrate(
      baseHashrate,
      stakeAmount,
      state.loyaltyDays,
      mine.definition.resource
    );
  }

  /**
   * Get defense power for a miner at a mine
   */
  getDefensePower(walletAddress: string, mineId: string): number {
    const stakeAmount = this.getStakeAtMine(walletAddress, mineId);
    const state = this.getMinerState(walletAddress);
    const isHomeBase = state.homeBaseMineId === mineId;

    return calculateDefensePower(stakeAmount, isHomeBase);
  }

  /**
   * Get total defense power for a mine (all stakers)
   */
  getTotalDefensePower(mineId: string): number {
    let total = 0;

    for (const [walletAddress, stakes] of this.stakes) {
      const stake = stakes.find(s => s.mineId === mineId);
      if (stake) {
        total += this.getDefensePower(walletAddress, mineId);
      }
    }

    return total;
  }

  /**
   * Update loyalty days for all miners (call daily)
   */
  updateLoyaltyDays(): void {
    const now = new Date();

    for (const [walletAddress, state] of this.minerStates) {
      if (state.homeBaseJoinedAt && state.homeBaseMineId) {
        const daysSinceJoin = Math.floor(
          (now.getTime() - state.homeBaseJoinedAt.getTime()) / (24 * 60 * 60 * 1000)
        );
        state.loyaltyDays = daysSinceJoin;

        // Update stake records
        const stakes = this.stakes.get(walletAddress);
        if (stakes) {
          for (const stake of stakes) {
            if (stake.mineId === state.homeBaseMineId) {
              stake.loyaltyDays = daysSinceJoin;
            }
          }
        }
      }
    }
  }

  /**
   * Get all stakers at a mine
   */
  getMineSakers(mineId: string): StakeRecord[] {
    const stakers: StakeRecord[] = [];

    for (const [, stakes] of this.stakes) {
      const stake = stakes.find(s => s.mineId === mineId);
      if (stake && stake.amount > 0) {
        stakers.push(stake);
      }
    }

    return stakers;
  }

  /**
   * Calculate reward share for a miner based on stake
   */
  calculateRewardShare(walletAddress: string, mineId: string, totalReward: number): number {
    const stakeAmount = this.getStakeAtMine(walletAddress, mineId);
    const registry = getMineRegistry();
    const mine = registry.getMine(mineId);
    
    if (!mine || mine.totalStake === 0) {
      // No stakes, equal distribution based on hashrate only
      return 0;
    }

    // Stake-weighted portion (50% of reward goes to stakers)
    const stakeWeight = stakeAmount / mine.totalStake;
    return totalReward * 0.5 * stakeWeight;
  }

  /**
   * Process a bet for a raid
   */
  processBet(walletAddress: string, mineId: string, betAmount: number): boolean {
    const currentStake = this.getStakeAtMine(walletAddress, mineId);
    
    // Can only bet up to 20% of stake
    const maxBet = currentStake * 0.2;
    if (betAmount > maxBet) {
      console.log(`[StakeManager] Bet ${betAmount} exceeds max ${maxBet} for ${walletAddress}`);
      return false;
    }

    // Lock the bet (reduce available stake temporarily)
    // In production, this would interact with on-chain staking
    return true;
  }

  /**
   * Burn bet (after failed raid)
   */
  burnBet(walletAddress: string, mineId: string, betAmount: number): void {
    // Remove from stake permanently
    this.unstake(walletAddress, mineId, betAmount);
    console.log(`[StakeManager] Burned ${betAmount} from ${walletAddress} at ${mineId}`);
  }

  /**
   * Return bet plus winnings (after successful raid)
   */
  returnBetWithWinnings(
    walletAddress: string,
    mineId: string,
    betAmount: number,
    winnings: number
  ): void {
    // In production, this would send tokens from raid pool
    console.log(
      `[StakeManager] Returned ${betAmount} + ${winnings} winnings to ${walletAddress}`
    );
  }

  /**
   * Add pending reward for a wallet (from defender spoils, etc.)
   */
  addPendingReward(walletAddress: string, mineId: string, amount: number): void {
    const current = this.pendingRewards.get(walletAddress) || 0;
    this.pendingRewards.set(walletAddress, current + amount);
    console.log(
      `[StakeManager] Added ${amount} pending reward for ${walletAddress} ` +
      `(total pending: ${current + amount})`
    );
  }

  /**
   * Get pending reward for a wallet
   */
  getPendingReward(walletAddress: string): number {
    return this.pendingRewards.get(walletAddress) || 0;
  }

  /**
   * Claim pending rewards for a wallet
   * Returns the amount and resets the pending to 0
   */
  claimPendingReward(walletAddress: string): number {
    const amount = this.pendingRewards.get(walletAddress) || 0;
    this.pendingRewards.delete(walletAddress);
    if (amount > 0) {
      console.log(`[StakeManager] Claimed ${amount} pending rewards for ${walletAddress}`);
    }
    return amount;
  }

  /**
   * Get all wallets with pending rewards
   */
  getAllPendingRewards(): Map<string, number> {
    return new Map(this.pendingRewards);
  }

  /**
   * Get total pending rewards across all wallets
   */
  getTotalPendingRewards(): number {
    let total = 0;
    for (const amount of this.pendingRewards.values()) {
      total += amount;
    }
    return total;
  }

  /**
   * Get all miner states
   */
  getAllMinerStates(): MinerGameState[] {
    return Array.from(this.minerStates.values());
  }

  /**
   * Clear expired cooldowns
   */
  clearExpiredCooldowns(): void {
    const now = new Date();

    for (const [, state] of this.minerStates) {
      state.cooldowns = state.cooldowns.filter(cd => cd.expiresAt > now);
    }
  }
}

// Singleton instance
let stakeManagerInstance: StakeManager | null = null;

export function getStakeManager(): StakeManager {
  if (!stakeManagerInstance) {
    stakeManagerInstance = new StakeManager();
  }
  return stakeManagerInstance;
}

export function resetStakeManager(): void {
  stakeManagerInstance = null;
}
