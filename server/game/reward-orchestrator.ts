/**
 * @fileoverview Reward Orchestration Service
 * Connects buyback, discovery rewards, and distribution systems
 * 
 * Flow:
 * 1. Pump.fun creator fees → Creator Wallet (SOL)
 * 2. Buyback Service → Reward Pool (COAL tokens)
 * 3. Discovery → 70% to finder + 30% to vault
 * 4. Hourly → Vault distributed to active miners
 */

import { sendReward, queueReward, getRewardPoolBalance } from '../solana/rewards';
import { 
  initDistributionService, 
  startDistributionService,
  handleDiscovery,
  performDistribution,
  getDistributionStats,
} from './distribution-service';
import { getMineRegistry } from './mine-registry';
import { TOKEN_CONFIG, IS_DEVNET, TIMEOUT_REWARDS } from '../../config/constants';

/** Reward orchestrator state */
interface OrchestratorState {
  isRunning: boolean;
  totalDiscoveries: number;
  totalRewardsDistributed: number;
  totalFinderRewards: number;
  totalVaultRewards: number;
  lastDistribution: Date | null;
  rewardPoolBalance: number;
}

const state: OrchestratorState = {
  isRunning: false,
  totalDiscoveries: 0,
  totalRewardsDistributed: 0,
  totalFinderRewards: 0,
  totalVaultRewards: 0,
  lastDistribution: null,
  rewardPoolBalance: 0,
};

/**
 * Discovery reward configuration
 * 
 * SHARE-BASED SYSTEM:
 * - 70% of total reward distributed to ALL miners based on contribution
 * - 30% goes to vault for hourly distribution
 * - Finder gets a BONUS on top of their share (20% of their share)
 * 
 * Example with 100 COAL total, 3 miners:
 * - Miner A (finder): 50% contribution → 35 COAL + 7 COAL bonus = 42 COAL
 * - Miner B: 30% contribution → 21 COAL
 * - Miner C: 20% contribution → 14 COAL
 * - Vault: 30 COAL
 * - Total distributed: 77 COAL to miners, 30 to vault (7 COAL is finder bonus)
 */
export const REWARD_CONFIG = {
  /** Percentage of total reward distributed to miners (based on contribution shares) */
  MINER_POOL_PERCENT: 70,
  /** Percentage that goes to the mine vault for hourly distribution */
  VAULT_SHARE_PERCENT: 30,
  /** Finder bonus: extra % on TOP of their share (incentivizes finding) */
  FINDER_BONUS_PERCENT: 20,
  /** Base reward per discovery (in COAL tokens) */
  BASE_REWARD_PER_DISCOVERY: 100,
  /** Multiplier range for variable rewards */
  REWARD_VARIANCE: 0.2, // +/- 20%
};

/**
 * Calculate reward for a discovery based on mine and resource type
 */
function calculateDiscoveryReward(mineId: string): number {
  const registry = getMineRegistry();
  const mine = registry.getMine(mineId);
  
  if (!mine) {
    return REWARD_CONFIG.BASE_REWARD_PER_DISCOVERY;
  }
  
  let baseReward = REWARD_CONFIG.BASE_REWARD_PER_DISCOVERY;
  
  // Resource-specific multipliers
  switch (mine.definition.resource) {
    case 'gold':
      baseReward *= 1.5; // Gold is more valuable
      break;
    case 'oil':
      baseReward *= 1.3; // Oil rewards scale with group size
      break;
    case 'silver':
      baseReward *= 1.2; // Silver has volatile rewards
      break;
    case 'coal':
    default:
      baseReward *= 1.0; // Coal is the baseline
  }
  
  // Add variance
  const variance = 1 + (Math.random() * 2 - 1) * REWARD_CONFIG.REWARD_VARIANCE;
  
  return Math.floor(baseReward * variance);
}

/**
 * Initialize the reward orchestrator
 */
export function initRewardOrchestrator(): void {
  if (state.isRunning) {
    console.log('[RewardOrchestrator] Already running');
    return;
  }
  
  console.log('[RewardOrchestrator] Initializing...');
  
  // Initialize distribution service with callbacks
  initDistributionService({
    onDistribution: (results) => {
      console.log(`[RewardOrchestrator] Hourly distribution completed for ${results.length} mines`);
      state.lastDistribution = new Date();
    },
    onRewardPayout: async (wallet, amount, mineId) => {
      await processRewardPayout(wallet, amount, mineId, 'vault_distribution');
    },
  });
  
  // Start the distribution service
  startDistributionService();
  
  // Periodically check reward pool balance
  setInterval(async () => {
    try {
      state.rewardPoolBalance = await getRewardPoolBalance();
    } catch (error) {
      console.error('[RewardOrchestrator] Failed to get pool balance:', error);
    }
  }, 60 * 1000); // Every minute
  
  state.isRunning = true;
  console.log('[RewardOrchestrator] Started');
}

/** Share information from PoolManager */
interface MinerShareInfo {
  walletAddress: string;
  hashSeconds: number;
  sharePercent: number;
  reward: number;
}

/**
 * Handle a new discovery with SHARE-BASED distribution
 * Distributes rewards proportionally based on contribution
 * 
 * @param mineId - Mine where discovery was made
 * @param finderWallet - Wallet of the miner who made the discovery
 * @param discoveryNumber - Sequential discovery number
 * @param shares - Optional array of miner shares from PoolManager
 * @param finderBonus - Optional finder bonus percentage from PoolManager
 */
export async function handleNewDiscovery(
  mineId: string,
  finderWallet: string,
  discoveryNumber: number,
  shares?: MinerShareInfo[],
  finderBonus?: number
): Promise<{
  success: boolean;
  finderReward: number;
  vaultReward: number;
  totalReward: number;
  minerPayouts: Array<{ wallet: string; amount: number; isFinder: boolean }>;
  finderSignature?: string;
  error?: string;
}> {
  console.log(`[RewardOrchestrator] Processing discovery #${discoveryNumber} at ${mineId} by ${finderWallet.slice(0, 8)}...`);
  
  state.totalDiscoveries++;
  
  // Calculate total reward
  const totalReward = calculateDiscoveryReward(mineId);
  
  // Calculate vault share (30%)
  const vaultAmount = Math.floor(totalReward * REWARD_CONFIG.VAULT_SHARE_PERCENT / 100);
  // Miner pool share (70%)
  const minerPoolAmount = totalReward - vaultAmount;
  
  // Add vault share to distribution service
  handleDiscovery(mineId, totalReward);
  state.totalVaultRewards += vaultAmount;
  
  // Calculate payouts for each miner
  const minerPayouts: Array<{ wallet: string; amount: number; isFinder: boolean }> = [];
  const bonusPercent = finderBonus || REWARD_CONFIG.FINDER_BONUS_PERCENT;
  
  if (shares && shares.length > 0) {
    // SHARE-BASED DISTRIBUTION
    console.log(`[RewardOrchestrator] Share-based distribution to ${shares.length} miners`);
    
    for (const share of shares) {
      // Each miner's base share of the pool
      const baseShare = Math.floor(minerPoolAmount * share.sharePercent / 100);
      const isFinder = share.walletAddress === finderWallet;
      
      // Finder gets bonus on top of their share
      const bonus = isFinder ? Math.floor(baseShare * bonusPercent / 100) : 0;
      const totalAmount = baseShare + bonus;
      
      if (totalAmount > 0) {
        minerPayouts.push({
          wallet: share.walletAddress,
          amount: totalAmount,
          isFinder,
        });
        
        if (isFinder) {
          console.log(
            `[RewardOrchestrator] 🏆 Finder ${finderWallet.slice(0, 8)}... gets ` +
            `${baseShare} + ${bonus} bonus = ${totalAmount} ${TOKEN_CONFIG.SYMBOL}`
          );
        }
      }
    }
  } else {
    // FALLBACK: Old behavior - 100% of miner pool to finder
    console.log('[RewardOrchestrator] No shares provided, using legacy distribution');
    minerPayouts.push({
      wallet: finderWallet,
      amount: minerPoolAmount,
      isFinder: true,
    });
  }
  
  // Send payouts to all miners
  let finderSignature: string | undefined;
  let anyFailed = false;
  
  for (const payout of minerPayouts) {
    const result = await processRewardPayout(
      payout.wallet,
      payout.amount,
      mineId,
      payout.isFinder ? 'discovery_finder' : 'discovery_share'
    );
    
    if (!result.success) {
      console.error(`[RewardOrchestrator] Failed to send reward to ${payout.wallet.slice(0, 8)}...`);
      queueReward(payout.wallet, payout.amount, discoveryNumber);
      anyFailed = true;
    } else if (payout.isFinder) {
      finderSignature = result.signature;
    }
    
    state.totalFinderRewards += payout.amount;
  }
  
  // Find the finder's payout for return value
  const finderPayout = minerPayouts.find(p => p.isFinder);
  
  console.log(
    `[RewardOrchestrator] Discovery #${discoveryNumber}: ` +
    `${minerPoolAmount} ${TOKEN_CONFIG.SYMBOL} to ${minerPayouts.length} miners, ${vaultAmount} to vault`
  );
  
  return {
    success: !anyFailed,
    finderReward: finderPayout?.amount || 0,
    vaultReward: vaultAmount,
    totalReward,
    minerPayouts,
    finderSignature,
    error: anyFailed ? 'Some payouts failed' : undefined,
  };
}

/**
 * Process a reward payout
 */
async function processRewardPayout(
  wallet: string,
  amount: number,
  mineId: string,
  type: 'discovery_finder' | 'discovery_share' | 'vault_distribution' | 'raid_spoils'
): Promise<{ success: boolean; signature?: string; error?: string }> {
  // In devnet/testing mode, just log the payout
  if (IS_DEVNET || TOKEN_CONFIG.MINT_ADDRESS === 'TBD') {
    console.log(`[RewardOrchestrator] [MOCK] Would send ${amount} ${TOKEN_CONFIG.SYMBOL} to ${wallet.slice(0, 8)}... (${type})`);
    state.totalRewardsDistributed += amount;
    return { success: true, signature: 'MOCK_SIGNATURE' };
  }
  
  try {
    const result = await sendReward(wallet, amount, state.totalDiscoveries);
    
    if (result.success) {
      state.totalRewardsDistributed += amount;
      return { success: true, signature: result.signature };
    } else {
      return { success: false, error: result.error };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

/**
 * Handle defender spoils distribution (when attacker loses)
 * 10% to defenders, 90% burned
 */
export async function handleDefenderSpoils(
  mineId: string,
  spoilsAmount: number,
  defenders: Array<{ wallet: string; sharePercent: number }>
): Promise<void> {
  console.log(`[RewardOrchestrator] Distributing ${spoilsAmount} spoils to ${defenders.length} defenders`);
  
  for (const defender of defenders) {
    const share = Math.floor(spoilsAmount * (defender.sharePercent / 100));
    if (share > 0) {
      await processRewardPayout(defender.wallet, share, mineId, 'raid_spoils');
    }
  }
}

/**
 * Handle a timeout-based discovery (closest hash wins)
 * Uses reduced rewards with rollover mechanism
 * 
 * Reward Split (Timeout):
 * - 35% to closest hash winner + pool based on shares
 * - 30% to vault (same as solution)
 * - 35% rollover to next round's jackpot
 * 
 * @param mineId - Mine where timeout occurred
 * @param closestWallet - Wallet of the miner with closest hash
 * @param roundNumber - Round number for tracking
 * @param baseReward - Base reward for this round
 * @param rolloverAmount - Accumulated rollover from previous timeouts
 * @param shares - Miner contribution shares
 */
export async function handleTimeoutDiscovery(
  mineId: string,
  closestWallet: string | null,
  roundNumber: number,
  baseReward: number,
  rolloverAmount: number,
  shares?: MinerShareInfo[]
): Promise<{
  success: boolean;
  closestReward: number;
  vaultReward: number;
  rolloverReward: number;
  totalReward: number;
  minerPayouts: Array<{ wallet: string; amount: number; isClosest: boolean }>;
  signature?: string;
  error?: string;
}> {
  const totalReward = baseReward + rolloverAmount;
  
  console.log(
    `[RewardOrchestrator] Processing timeout at ${mineId}: ` +
    `base=${baseReward}, rollover=${rolloverAmount}, total=${totalReward}`
  );
  
  // Calculate reward splits for timeout scenario
  const closestPoolAmount = Math.floor(totalReward * TIMEOUT_REWARDS.TIMEOUT_FINDER_SHARE); // 35%
  const vaultAmount = Math.floor(totalReward * TIMEOUT_REWARDS.VAULT_SHARE); // 30%
  const rolloverReward = Math.floor(totalReward * TIMEOUT_REWARDS.ROLLOVER_SHARE); // 35%
  
  // Add vault share to distribution service
  handleDiscovery(mineId, totalReward);
  state.totalVaultRewards += vaultAmount;
  
  // If no qualified winner, everything except vault rolls over
  if (!closestWallet) {
    console.log('[RewardOrchestrator] No qualified closest-hash winner, full rollover');
    return {
      success: true,
      closestReward: 0,
      vaultReward: vaultAmount,
      rolloverReward: closestPoolAmount + rolloverReward, // 70% rolls over
      totalReward,
      minerPayouts: [],
    };
  }
  
  // Calculate payouts based on shares
  const minerPayouts: Array<{ wallet: string; amount: number; isClosest: boolean }> = [];
  const bonusPercent = TIMEOUT_REWARDS.TIMEOUT_FINDER_BONUS * 100; // 10%
  
  if (shares && shares.length > 0) {
    console.log(`[RewardOrchestrator] Timeout share-based distribution to ${shares.length} miners`);
    
    for (const share of shares) {
      const baseShare = Math.floor(closestPoolAmount * share.sharePercent / 100);
      const isClosest = share.walletAddress === closestWallet;
      
      // Closest hash gets reduced bonus (10% vs 20% for solution)
      const bonus = isClosest ? Math.floor(baseShare * bonusPercent / 100) : 0;
      const totalAmount = baseShare + bonus;
      
      if (totalAmount > 0) {
        minerPayouts.push({
          wallet: share.walletAddress,
          amount: totalAmount,
          isClosest,
        });
        
        if (isClosest) {
          console.log(
            `[RewardOrchestrator] ⏰ Closest hash ${closestWallet.slice(0, 8)}... gets ` +
            `${baseShare} + ${bonus} bonus = ${totalAmount} ${TOKEN_CONFIG.SYMBOL}`
          );
        }
      }
    }
  } else {
    // Fallback: 100% of miner pool to closest
    minerPayouts.push({
      wallet: closestWallet,
      amount: closestPoolAmount,
      isClosest: true,
    });
  }
  
  // Send payouts
  let closestSignature: string | undefined;
  let anyFailed = false;
  
  for (const payout of minerPayouts) {
    const result = await processRewardPayout(
      payout.wallet,
      payout.amount,
      mineId,
      payout.isClosest ? 'discovery_finder' : 'discovery_share'
    );
    
    if (!result.success) {
      console.error(`[RewardOrchestrator] Failed timeout payout to ${payout.wallet.slice(0, 8)}...`);
      queueReward(payout.wallet, payout.amount, roundNumber);
      anyFailed = true;
    } else if (payout.isClosest) {
      closestSignature = result.signature;
    }
    
    state.totalFinderRewards += payout.amount;
  }
  
  const closestPayout = minerPayouts.find(p => p.isClosest);
  
  console.log(
    `[RewardOrchestrator] Timeout round #${roundNumber}: ` +
    `${closestPoolAmount} ${TOKEN_CONFIG.SYMBOL} to ${minerPayouts.length} miners, ` +
    `${vaultAmount} to vault, ${rolloverReward} rolls over`
  );
  
  return {
    success: !anyFailed,
    closestReward: closestPayout?.amount || 0,
    vaultReward: vaultAmount,
    rolloverReward,
    totalReward,
    minerPayouts,
    signature: closestSignature,
    error: anyFailed ? 'Some payouts failed' : undefined,
  };
}

/**
 * Get orchestrator statistics
 */
export function getOrchestratorStats(): OrchestratorState & {
  distributionStats: ReturnType<typeof getDistributionStats> | null;
} {
  return {
    ...state,
    distributionStats: null, // Would need a mineId
  };
}

/**
 * Get mine-specific vault stats
 */
export function getMineVaultStats(mineId: string) {
  return getDistributionStats(mineId);
}

/**
 * Force an hourly distribution (for testing/admin)
 */
export function forceHourlyDistribution() {
  console.log('[RewardOrchestrator] Forcing hourly distribution...');
  return performDistribution();
}

/**
 * Check if orchestrator is ready for production
 */
export function isProductionReady(): {
  ready: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  
  if (TOKEN_CONFIG.MINT_ADDRESS === 'TBD') {
    issues.push('Token mint not configured');
  }
  
  if (state.rewardPoolBalance < 1000) {
    issues.push('Reward pool balance too low');
  }
  
  if (!state.isRunning) {
    issues.push('Orchestrator not running');
  }
  
  return {
    ready: issues.length === 0,
    issues,
  };
}
