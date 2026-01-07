/**
 * @fileoverview Stake Manager for Black Gold v2
 * Manages staking operations, power calculations, and tier tracking
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
   * Withdraw stake from a mine
   */
  unstake(walletAddress: string, mineId: string, amount: number): boolean {
    const walletStakes = this.stakes.get(walletAddress);
    if (!walletStakes) {
      console.log(`[StakeManager] No stakes found for ${walletAddress}`);
      return false;
    }

    const stakeIndex = walletStakes.findIndex(s => s.mineId === mineId);
    if (stakeIndex < 0) {
      console.log(`[StakeManager] No stake at ${mineId} for ${walletAddress}`);
      return false;
    }

    const stake = walletStakes[stakeIndex];
    if (amount > stake.amount) {
      amount = stake.amount; // Unstake all
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
