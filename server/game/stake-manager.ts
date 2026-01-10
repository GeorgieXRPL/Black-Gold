/**
 * @fileoverview Stake Manager for Black Gold v2.8
 * 
 * Architecture (Quarry + BetEscrow):
 * - Quarry: On-chain token custody for staking (instant unstake OK)
 * - BetEscrow: Separate system for raid bets (locked until raid ends)
 * - This manager: Game state tracking + power calculations
 * 
 * Key changes from v2.7:
 * - Unstake queue removed (Quarry handles instant unstake)
 * - Bet locking handled by BetEscrow (not stake locking)
 * - Defense power queries Quarry for real-time on-chain balance
 * - Raid bets are separate from staking
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
import { getBetEscrowManager } from './bet-escrow';
import { getRedisStore } from '../storage/redis-store';

/**
 * Unstake result
 * Note: With Quarry architecture, unstaking is always instant.
 * Raid bets are locked separately via BetEscrow.
 */
export interface UnstakeResult {
  success: boolean;
  error?: string;
  /** Warning if user has active raid bets (separate from stake) */
  warning?: string;
}

/**
 * Stake Manager class
 * Handles game state tracking and power calculations
 * 
 * Note: Actual token custody is handled by Quarry (on-chain).
 * This manager tracks game state, calculates powers, and coordinates with BetEscrow.
 */
export class StakeManager {
  /** Stakes by wallet address (in-memory cache, synced with Quarry) */
  private stakes: Map<string, StakeRecord[]> = new Map();
  
  /** Miner game states */
  private minerStates: Map<string, MinerGameState> = new Map();

  /** Pending rewards from defender spoils and other sources (wallet -> amount) */
  private pendingRewards: Map<string, number> = new Map();

  /** Active raids by wallet (wallet -> raid IDs) - for tracking, not blocking */
  private activeRaidsByWallet: Map<string, Set<string>> = new Map();

  /** Mines currently under attack (mineId -> attack count) */
  private minesUnderAttack: Map<string, number> = new Map();
  
  /** Whether Quarry integration is enabled */
  private quarryEnabled: boolean = false;
  
  constructor() {
    this.quarryEnabled = !!process.env.QUARRY_ADDRESS;
    if (this.quarryEnabled) {
      console.log('[StakeManager] Quarry integration enabled');
    } else {
      console.log('[StakeManager] Running in simulation mode (no Quarry)');
    }
  }

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
   * Persists to Redis for session recovery
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

    // Persist to Redis for session recovery
    const redisStore = getRedisStore();
    redisStore.setUserHomeMine(walletAddress, mineId).catch((err) => {
      console.error('[StakeManager] Failed to persist home mine to Redis:', err);
    });

    console.log(`[StakeManager] ${walletAddress} set home base to ${mine.definition.name}`);
    return true;
  }

  /**
   * Restore a miner's home base from Redis
   * Called when miner connects to restore their previous home mine
   */
  async restoreHomeMine(walletAddress: string): Promise<string | null> {
    try {
      const redisStore = getRedisStore();
      const homeMineId = await redisStore.getUserHomeMine(walletAddress);
      
      if (homeMineId) {
        const state = this.getMinerState(walletAddress);
        state.homeBaseMineId = homeMineId;
        state.activeMineId = homeMineId;
        console.log(`[StakeManager] Restored home mine for ${walletAddress.slice(0, 8)}...: ${homeMineId}`);
        return homeMineId;
      }
      
      return null;
    } catch (error) {
      console.error('[StakeManager] Failed to restore home mine:', error);
      return null;
    }
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
   * 
   * With Quarry architecture:
   * - Unstaking is always allowed (handled on-chain by Quarry)
   * - This just updates our in-memory cache
   * - Raid bets are separate and locked via BetEscrow
   * - If user has active bets, we warn but don't block
   */
  requestUnstake(walletAddress: string, mineId: string, amount: number): UnstakeResult {
    const walletStakes = this.stakes.get(walletAddress);
    if (!walletStakes) {
      return { success: false, error: 'No stakes found' };
    }

    const stakeIndex = walletStakes.findIndex(s => s.mineId === mineId);
    if (stakeIndex < 0) {
      return { success: false, error: 'No stake at this mine' };
    }

    const stake = walletStakes[stakeIndex];
    if (amount > stake.amount) {
      amount = stake.amount; // Unstake all
    }

    // Check if user has active raid bets (warn but don't block)
    const betEscrow = getBetEscrowManager();
    const hasActiveBets = betEscrow.hasLockedBets(walletAddress);
    const lockedBetAmount = betEscrow.getLockedBetAmount(walletAddress);

    // Process unstake immediately (Quarry handles on-chain)
    const success = this.processUnstake(walletAddress, mineId, amount);
    
    if (success && hasActiveBets) {
      return { 
        success: true, 
        warning: `You have ${lockedBetAmount} COAL locked in active raid bets. ` +
                 `Unstaking reduces your defense power but bets remain locked.`
      };
    }

    return { success };
  }

  /**
   * Process an unstake (internal method, always executes)
   * Updates in-memory cache; actual tokens handled by Quarry on-chain
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
   * Note: With new architecture, this is for tracking only (no queue processing)
   */
  unregisterActiveRaid(walletAddress: string, raidId: string): void {
    const raids = this.activeRaidsByWallet.get(walletAddress);
    if (raids) {
      raids.delete(raidId);
      if (raids.size === 0) {
        this.activeRaidsByWallet.delete(walletAddress);
      }
    }
    console.log(`[StakeManager] Unregistered active raid ${raidId} for ${walletAddress}`);
  }

  /**
   * Register a mine as under attack (for tracking)
   */
  registerMineUnderAttack(mineId: string): void {
    const current = this.minesUnderAttack.get(mineId) || 0;
    this.minesUnderAttack.set(mineId, current + 1);
    console.log(`[StakeManager] Mine ${mineId} under attack (count: ${current + 1})`);
  }

  /**
   * Unregister a mine attack
   */
  unregisterMineAttack(mineId: string): void {
    const current = this.minesUnderAttack.get(mineId) || 0;
    if (current <= 1) {
      this.minesUnderAttack.delete(mineId);
    } else {
      this.minesUnderAttack.set(mineId, current - 1);
    }
    console.log(`[StakeManager] Mine ${mineId} attack ended (remaining: ${Math.max(0, current - 1)})`);
  }

  /**
   * Check if a mine is currently under attack
   */
  isMineUnderAttack(mineId: string): boolean {
    return (this.minesUnderAttack.get(mineId) || 0) > 0;
  }

  /**
   * Get number of active raids for a wallet
   */
  getActiveRaidCount(walletAddress: string): number {
    return this.activeRaidsByWallet.get(walletAddress)?.size || 0;
  }

  /**
   * Check if wallet has active raids
   */
  hasActiveRaids(walletAddress: string): boolean {
    return this.getActiveRaidCount(walletAddress) > 0;
  }

  /**
   * Get locked bet amount for a wallet (from BetEscrow)
   */
  getLockedBetAmount(walletAddress: string): number {
    return getBetEscrowManager().getLockedBetAmount(walletAddress);
  }

  /**
   * Check if Quarry integration is enabled
   */
  isQuarryEnabled(): boolean {
    return this.quarryEnabled;
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
