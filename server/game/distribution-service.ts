/**
 * @fileoverview Hourly Distribution Service
 * Manages the scheduled distribution of vault rewards to miners
 * 
 * This service:
 * 1. Tracks miner contributions in real-time
 * 2. Runs hourly distribution of accumulated vault rewards
 * 3. Queues reward payouts for the Solana rewards module
 */

import {
  createVaultManager,
  distributeAllVaults,
  updateMinerContribution,
  addToVault,
  shouldDistribute,
  getVaultStats,
  getMinerPendingShare,
  calculateRewardSplit,
} from './vault-manager';
import { VaultDistributionResult } from './types';
import { ResourceType } from '../../config/mines';

/** Distribution service state */
interface DistributionServiceState {
  vaultManager: ReturnType<typeof createVaultManager>;
  distributionInterval: ReturnType<typeof setInterval> | null;
  contributionInterval: ReturnType<typeof setInterval> | null;
  isRunning: boolean;
  onDistribution?: (results: VaultDistributionResult[]) => void;
  onRewardPayout?: (wallet: string, amount: number, mineId: string) => void;
}

/** Active miners tracking for contribution updates */
interface ActiveMiner {
  walletAddress: string;
  mineId: string;
  currentHashrate: number;
  stakeAmount: number;
  loyaltyDays: number;
  resource: ResourceType;
  lastUpdate: Date;
}

/** Singleton instance */
let serviceState: DistributionServiceState | null = null;

/** Active miners map */
const activeMiners = new Map<string, ActiveMiner>();

/**
 * Initialize the distribution service
 */
export function initDistributionService(options?: {
  onDistribution?: (results: VaultDistributionResult[]) => void;
  onRewardPayout?: (wallet: string, amount: number, mineId: string) => void;
}): DistributionServiceState {
  if (serviceState) {
    console.log('[DistributionService] Already initialized');
    return serviceState;
  }

  serviceState = {
    vaultManager: createVaultManager(),
    distributionInterval: null,
    contributionInterval: null,
    isRunning: false,
    onDistribution: options?.onDistribution,
    onRewardPayout: options?.onRewardPayout,
  };

  console.log('[DistributionService] Initialized');
  return serviceState;
}

/**
 * Start the distribution service
 * Begins tracking contributions and scheduling hourly distributions
 */
export function startDistributionService(): void {
  if (!serviceState) {
    serviceState = initDistributionService();
  }

  if (serviceState.isRunning) {
    console.log('[DistributionService] Already running');
    return;
  }

  // Update contributions every 30 seconds
  serviceState.contributionInterval = setInterval(() => {
    updateAllContributions();
  }, 30 * 1000);

  // Check for distribution every minute
  serviceState.distributionInterval = setInterval(() => {
    checkAndDistribute();
  }, 60 * 1000);

  serviceState.isRunning = true;
  console.log('[DistributionService] Started - contributions tracked every 30s, distribution checked every 1m');
}

/**
 * Stop the distribution service
 */
export function stopDistributionService(): void {
  if (!serviceState) return;

  if (serviceState.contributionInterval) {
    clearInterval(serviceState.contributionInterval);
    serviceState.contributionInterval = null;
  }

  if (serviceState.distributionInterval) {
    clearInterval(serviceState.distributionInterval);
    serviceState.distributionInterval = null;
  }

  serviceState.isRunning = false;
  console.log('[DistributionService] Stopped');
}

/**
 * Register an active miner
 * Called when a miner joins a mine
 */
export function registerActiveMiner(
  walletAddress: string,
  mineId: string,
  resource: ResourceType,
  hashrate: number = 0,
  stakeAmount: number = 0,
  loyaltyDays: number = 0
): void {
  activeMiners.set(walletAddress, {
    walletAddress,
    mineId,
    currentHashrate: hashrate,
    stakeAmount,
    loyaltyDays,
    resource,
    lastUpdate: new Date(),
  });
}

/**
 * Unregister an active miner
 * Called when a miner leaves a mine or disconnects
 */
export function unregisterActiveMiner(walletAddress: string): void {
  activeMiners.delete(walletAddress);
}

/**
 * Update miner's current stats
 * Called when hashrate or stake changes
 */
export function updateMinerStats(
  walletAddress: string,
  updates: Partial<{
    hashrate: number;
    stakeAmount: number;
    loyaltyDays: number;
    mineId: string;
    resource: ResourceType;
  }>
): void {
  const miner = activeMiners.get(walletAddress);
  if (!miner) return;

  if (updates.hashrate !== undefined) miner.currentHashrate = updates.hashrate;
  if (updates.stakeAmount !== undefined) miner.stakeAmount = updates.stakeAmount;
  if (updates.loyaltyDays !== undefined) miner.loyaltyDays = updates.loyaltyDays;
  if (updates.mineId !== undefined) miner.mineId = updates.mineId;
  if (updates.resource !== undefined) miner.resource = updates.resource;
  miner.lastUpdate = new Date();
}

/**
 * Update all contributions based on current miner states
 * Called every 30 seconds
 */
function updateAllContributions(): void {
  if (!serviceState) return;

  const now = new Date();
  
  for (const miner of activeMiners.values()) {
    const deltaMs = now.getTime() - miner.lastUpdate.getTime();
    const deltaSeconds = deltaMs / 1000;
    
    // Only update if there's meaningful time passed
    if (deltaSeconds < 1) continue;
    
    updateMinerContribution(
      serviceState.vaultManager,
      miner.mineId,
      miner.walletAddress,
      miner.currentHashrate,
      miner.stakeAmount,
      miner.loyaltyDays,
      miner.resource === 'coal',
      deltaSeconds
    );
    
    miner.lastUpdate = now;
  }
}

/**
 * Check if distribution should run and execute if needed
 */
function checkAndDistribute(): void {
  if (!serviceState) return;

  if (shouldDistribute(serviceState.vaultManager)) {
    performDistribution();
  }
}

/**
 * Perform the hourly distribution
 */
export function performDistribution(): VaultDistributionResult[] {
  if (!serviceState) {
    console.log('[DistributionService] Not initialized');
    return [];
  }

  console.log('[DistributionService] Running hourly distribution...');
  
  const results = distributeAllVaults(serviceState.vaultManager);
  
  // Process payouts
  for (const result of results) {
    for (const [wallet, amount] of result.payouts.entries()) {
      if (serviceState.onRewardPayout) {
        serviceState.onRewardPayout(wallet, amount, result.mineId);
      }
    }
  }
  
  // Notify listeners
  if (serviceState.onDistribution && results.length > 0) {
    serviceState.onDistribution(results);
  }
  
  console.log(`[DistributionService] Completed ${results.length} mine distributions`);
  
  return results;
}

/**
 * Handle a new discovery - add 30% to vault
 * Called when a miner makes a discovery
 */
export function handleDiscovery(
  mineId: string,
  totalReward: number
): { finderShare: number; vaultShare: number } {
  if (!serviceState) {
    serviceState = initDistributionService();
  }

  const split = calculateRewardSplit(totalReward);
  addToVault(serviceState.vaultManager, mineId, split.vaultShare);
  
  return split;
}

/**
 * Get vault stats for a mine
 */
export function getDistributionStats(mineId: string) {
  if (!serviceState) return null;
  return getVaultStats(serviceState.vaultManager, mineId);
}

/**
 * Get a miner's pending share estimate
 */
export function getMinerPendingReward(mineId: string, walletAddress: string) {
  if (!serviceState) return null;
  return getMinerPendingShare(serviceState.vaultManager, mineId, walletAddress);
}

/**
 * Get count of active miners being tracked
 */
export function getActiveMinerCount(): number {
  return activeMiners.size;
}

/**
 * Get active miner info
 */
export function getActiveMiner(walletAddress: string): ActiveMiner | undefined {
  return activeMiners.get(walletAddress);
}

/**
 * Force a distribution (for testing or manual triggers)
 */
export function forceDistribution(): VaultDistributionResult[] {
  return performDistribution();
}

/**
 * Reset the service (for testing)
 */
export function resetDistributionService(): void {
  stopDistributionService();
  activeMiners.clear();
  serviceState = null;
}
