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
import { TOKEN_CONFIG, IS_DEVNET } from '../../config/constants';

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
 */
export const REWARD_CONFIG = {
  /** Percentage of reward that goes to the finder instantly */
  FINDER_SHARE_PERCENT: 70,
  /** Percentage that goes to the mine vault for hourly distribution */
  VAULT_SHARE_PERCENT: 30,
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

/**
 * Handle a new discovery
 * Sends 70% to finder immediately, adds 30% to vault
 * 
 * @param mineId - Mine where discovery was made
 * @param finderWallet - Wallet of the miner who made the discovery
 * @param discoveryNumber - Sequential discovery number
 */
export async function handleNewDiscovery(
  mineId: string,
  finderWallet: string,
  discoveryNumber: number
): Promise<{
  success: boolean;
  finderReward: number;
  vaultReward: number;
  totalReward: number;
  finderSignature?: string;
  error?: string;
}> {
  console.log(`[RewardOrchestrator] Processing discovery #${discoveryNumber} at ${mineId} by ${finderWallet.slice(0, 8)}...`);
  
  state.totalDiscoveries++;
  
  // Calculate total reward
  const totalReward = calculateDiscoveryReward(mineId);
  
  // Split between finder and vault
  const { finderShare, vaultShare } = handleDiscovery(mineId, totalReward);
  
  state.totalFinderRewards += finderShare;
  state.totalVaultRewards += vaultShare;
  
  // Send finder reward immediately
  const finderResult = await processRewardPayout(
    finderWallet, 
    finderShare, 
    mineId, 
    'discovery_finder'
  );
  
  if (!finderResult.success) {
    console.error('[RewardOrchestrator] Failed to send finder reward:', finderResult.error);
    // Queue for retry
    queueReward(finderWallet, finderShare, discoveryNumber);
  }
  
  console.log(
    `[RewardOrchestrator] Discovery #${discoveryNumber}: ` +
    `${finderShare} ${TOKEN_CONFIG.SYMBOL} to finder, ${vaultShare} to vault`
  );
  
  return {
    success: finderResult.success,
    finderReward: finderShare,
    vaultReward: vaultShare,
    totalReward,
    finderSignature: finderResult.signature,
    error: finderResult.error,
  };
}

/**
 * Process a reward payout
 */
async function processRewardPayout(
  wallet: string,
  amount: number,
  mineId: string,
  type: 'discovery_finder' | 'vault_distribution' | 'raid_spoils'
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
