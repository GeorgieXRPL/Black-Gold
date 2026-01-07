/**
 * @fileoverview Mine Vault Manager
 * Manages the 30% pool share of discovery rewards and hourly distribution
 * 
 * Flow:
 * 1. Discovery found → 30% goes to mine's vault
 * 2. Hourly, vault is distributed to all active miners
 * 3. Distribution weighted by: hashrate contribution, stake tier, loyalty bonus, time active
 */

import {
  MineVault,
  MinerContribution,
  VaultDistributionResult,
  getStakeTier,
} from './types';

/** 70/30 split constants */
const FINDER_SHARE_PERCENT = 0.70;
const VAULT_SHARE_PERCENT = 0.30;

/** Minimum vault balance to trigger distribution */
const MIN_DISTRIBUTION_AMOUNT = 1;

/** Vault manager state */
interface VaultManagerState {
  /** Vaults by mine ID */
  vaults: Map<string, MineVault>;
  /** Last distribution check time */
  lastDistributionCheck: Date;
  /** Distribution interval in ms (1 hour) */
  distributionIntervalMs: number;
  /** Whether hourly distribution is running */
  isDistributionRunning: boolean;
}

/** Create a new vault manager */
export function createVaultManager(): VaultManagerState {
  return {
    vaults: new Map(),
    lastDistributionCheck: new Date(),
    distributionIntervalMs: 60 * 60 * 1000, // 1 hour
    isDistributionRunning: false,
  };
}

/** Initialize vault for a mine */
export function initializeVault(
  state: VaultManagerState,
  mineId: string
): MineVault {
  const vault: MineVault = {
    mineId,
    balance: 0,
    pendingDistribution: 0,
    lastDistributionTime: new Date(),
    hourlyContributions: new Map(),
    totalDistributed: 0,
    distributionCount: 0,
  };
  state.vaults.set(mineId, vault);
  return vault;
}

/** Get or create vault for a mine */
export function getOrCreateVault(
  state: VaultManagerState,
  mineId: string
): MineVault {
  const existing = state.vaults.get(mineId);
  if (existing) return existing;
  return initializeVault(state, mineId);
}

/**
 * Calculate reward split for a discovery
 * @returns Object with finder share (70%) and vault share (30%)
 */
export function calculateRewardSplit(totalReward: number): {
  finderShare: number;
  vaultShare: number;
} {
  return {
    finderShare: Math.floor(totalReward * FINDER_SHARE_PERCENT),
    vaultShare: Math.floor(totalReward * VAULT_SHARE_PERCENT),
  };
}

/**
 * Add discovery rewards to mine vault
 * Called when a discovery is made - adds 30% to the vault
 */
export function addToVault(
  state: VaultManagerState,
  mineId: string,
  amount: number
): number {
  const vault = getOrCreateVault(state, mineId);
  vault.balance += amount;
  vault.pendingDistribution += amount;
  console.log(`[Vault] Added ${amount} COAL to ${mineId} vault. Balance: ${vault.balance}`);
  return vault.balance;
}

/**
 * Update miner contribution for hourly tracking
 * Called periodically to track miner activity
 */
export function updateMinerContribution(
  state: VaultManagerState,
  mineId: string,
  walletAddress: string,
  currentHashrate: number,
  stakeAmount: number,
  loyaltyDays: number,
  isCoalMine: boolean,
  deltaSeconds: number
): void {
  const vault = getOrCreateVault(state, mineId);
  
  const existing = vault.hourlyContributions.get(walletAddress);
  const stakeTier = getStakeTier(stakeAmount);
  
  // Coal loyalty bonus: +10% after 7 days
  const loyaltyBonus = isCoalMine && loyaltyDays >= 7 ? 0.1 : 0;
  
  if (existing) {
    // Update existing contribution
    existing.hashrateSeconds += currentHashrate * deltaSeconds;
    existing.stakeTierMultiplier = stakeTier.hashrateMultiplier;
    existing.loyaltyBonus = loyaltyBonus;
    existing.timeActiveSeconds += deltaSeconds;
  } else {
    // Create new contribution record
    const contribution: MinerContribution = {
      walletAddress,
      hashrateSeconds: currentHashrate * deltaSeconds,
      stakeTierMultiplier: stakeTier.hashrateMultiplier,
      loyaltyBonus,
      timeActiveSeconds: deltaSeconds,
    };
    vault.hourlyContributions.set(walletAddress, contribution);
  }
}

/**
 * Calculate miner score for distribution
 * Formula: (hashrate_contributed / mine_total) × stake_tier × (1 + loyalty) × time_factor
 */
export function calculateMinerScore(
  contribution: MinerContribution,
  totalHashrateSeconds: number
): number {
  if (totalHashrateSeconds === 0) return 0;
  
  const hashrateShare = contribution.hashrateSeconds / totalHashrateSeconds;
  const stakeFactor = contribution.stakeTierMultiplier;
  const loyaltyFactor = 1 + contribution.loyaltyBonus;
  
  // Time factor: normalize to 1 hour (3600 seconds)
  const timeFactor = Math.min(1, contribution.timeActiveSeconds / 3600);
  
  return hashrateShare * stakeFactor * loyaltyFactor * timeFactor;
}

/**
 * Perform hourly distribution for a single mine
 * Distributes vault balance to all active miners based on their contribution scores
 */
export function distributeVault(
  state: VaultManagerState,
  mineId: string
): VaultDistributionResult | null {
  const vault = state.vaults.get(mineId);
  if (!vault) return null;
  
  // Check if there's anything to distribute
  if (vault.pendingDistribution < MIN_DISTRIBUTION_AMOUNT) {
    console.log(`[Vault] ${mineId}: Nothing to distribute (pending: ${vault.pendingDistribution})`);
    return null;
  }
  
  // Check if there are any contributors
  if (vault.hourlyContributions.size === 0) {
    console.log(`[Vault] ${mineId}: No contributors this hour`);
    return null;
  }
  
  // Calculate total hashrate-seconds for all contributors
  let totalHashrateSeconds = 0;
  for (const contribution of vault.hourlyContributions.values()) {
    totalHashrateSeconds += contribution.hashrateSeconds;
  }
  
  if (totalHashrateSeconds === 0) {
    console.log(`[Vault] ${mineId}: No hashrate contributed this hour`);
    return null;
  }
  
  // Calculate scores for all contributors
  const scores = new Map<string, number>();
  let totalScore = 0;
  
  for (const [wallet, contribution] of vault.hourlyContributions.entries()) {
    const score = calculateMinerScore(contribution, totalHashrateSeconds);
    scores.set(wallet, score);
    totalScore += score;
  }
  
  if (totalScore === 0) {
    console.log(`[Vault] ${mineId}: Total score is zero`);
    return null;
  }
  
  // Distribute rewards proportionally
  const amountToDistribute = vault.pendingDistribution;
  const payouts = new Map<string, number>();
  let actualDistributed = 0;
  
  for (const [wallet, score] of scores.entries()) {
    const sharePercent = score / totalScore;
    const payout = Math.floor(amountToDistribute * sharePercent);
    
    if (payout > 0) {
      payouts.set(wallet, payout);
      actualDistributed += payout;
    }
  }
  
  // Update vault state
  vault.balance -= actualDistributed;
  vault.pendingDistribution = 0;
  vault.totalDistributed += actualDistributed;
  vault.distributionCount += 1;
  vault.lastDistributionTime = new Date();
  
  // Clear contributions for next hour
  vault.hourlyContributions.clear();
  
  const result: VaultDistributionResult = {
    mineId,
    totalDistributed: actualDistributed,
    minerCount: payouts.size,
    payouts,
    distributedAt: new Date(),
  };
  
  console.log(`[Vault] ${mineId}: Distributed ${actualDistributed} COAL to ${payouts.size} miners`);
  
  return result;
}

/**
 * Perform hourly distribution for all mines
 * Called by the main server loop every hour
 */
export function distributeAllVaults(
  state: VaultManagerState
): VaultDistributionResult[] {
  const results: VaultDistributionResult[] = [];
  
  for (const mineId of state.vaults.keys()) {
    const result = distributeVault(state, mineId);
    if (result) {
      results.push(result);
    }
  }
  
  state.lastDistributionCheck = new Date();
  
  return results;
}

/**
 * Check if it's time for hourly distribution
 */
export function shouldDistribute(state: VaultManagerState): boolean {
  const now = Date.now();
  const lastCheck = state.lastDistributionCheck.getTime();
  return now - lastCheck >= state.distributionIntervalMs;
}

/**
 * Get vault stats for a mine
 */
export function getVaultStats(
  state: VaultManagerState,
  mineId: string
): {
  balance: number;
  pendingDistribution: number;
  totalDistributed: number;
  distributionCount: number;
  contributorCount: number;
  lastDistribution: Date | null;
} | null {
  const vault = state.vaults.get(mineId);
  if (!vault) return null;
  
  return {
    balance: vault.balance,
    pendingDistribution: vault.pendingDistribution,
    totalDistributed: vault.totalDistributed,
    distributionCount: vault.distributionCount,
    contributorCount: vault.hourlyContributions.size,
    lastDistribution: vault.lastDistributionTime,
  };
}

/**
 * Get all vault balances
 */
export function getAllVaultBalances(
  state: VaultManagerState
): Map<string, number> {
  const balances = new Map<string, number>();
  for (const [mineId, vault] of state.vaults.entries()) {
    balances.set(mineId, vault.balance);
  }
  return balances;
}

/**
 * Get total across all vaults
 */
export function getTotalVaultBalance(state: VaultManagerState): number {
  let total = 0;
  for (const vault of state.vaults.values()) {
    total += vault.balance;
  }
  return total;
}

/**
 * Get miner's pending share estimate
 * Shows what a miner would receive if distribution happened now
 */
export function getMinerPendingShare(
  state: VaultManagerState,
  mineId: string,
  walletAddress: string
): { amount: number; sharePercent: number } | null {
  const vault = state.vaults.get(mineId);
  if (!vault) return null;
  
  const contribution = vault.hourlyContributions.get(walletAddress);
  if (!contribution) return { amount: 0, sharePercent: 0 };
  
  // Calculate total hashrate-seconds
  let totalHashrateSeconds = 0;
  for (const c of vault.hourlyContributions.values()) {
    totalHashrateSeconds += c.hashrateSeconds;
  }
  
  if (totalHashrateSeconds === 0) return { amount: 0, sharePercent: 0 };
  
  // Calculate scores
  let totalScore = 0;
  let myScore = 0;
  
  for (const [wallet, c] of vault.hourlyContributions.entries()) {
    const score = calculateMinerScore(c, totalHashrateSeconds);
    totalScore += score;
    if (wallet === walletAddress) {
      myScore = score;
    }
  }
  
  if (totalScore === 0) return { amount: 0, sharePercent: 0 };
  
  const sharePercent = (myScore / totalScore) * 100;
  const amount = Math.floor(vault.pendingDistribution * (myScore / totalScore));
  
  return { amount, sharePercent };
}
