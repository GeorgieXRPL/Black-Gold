/**
 * @fileoverview Game module exports for Black Gold v2
 */

// Types
export * from './types';

// Mine Registry
export { 
  MineRegistry, 
  getMineRegistry, 
  resetMineRegistry,
  createMineState,
} from './mine-registry';

// Stake Manager
export { 
  StakeManager, 
  getStakeManager, 
  resetStakeManager,
} from './stake-manager';
export type { UnstakeRequest, UnstakeResult } from './stake-manager';

// Cooldown Manager
export { 
  CooldownManager, 
  getCooldownManager, 
  resetCooldownManager,
} from './cooldowns';

// Expedition Tracker
export { 
  ExpeditionTracker, 
  getExpeditionTracker, 
  resetExpeditionTracker,
} from './expedition-tracker';

// Raid Engine
export { 
  RaidEngine, 
  getRaidEngine, 
  resetRaidEngine,
} from './raid-engine';

// Vault Manager
export {
  createVaultManager,
  initializeVault,
  getOrCreateVault,
  calculateRewardSplit,
  addToVault,
  updateMinerContribution,
  calculateMinerScore,
  distributeVault,
  distributeAllVaults,
  shouldDistribute,
  getVaultStats,
  getAllVaultBalances,
  getTotalVaultBalance,
  getMinerPendingShare,
} from './vault-manager';

// Distribution Service
export {
  initDistributionService,
  startDistributionService,
  stopDistributionService,
  registerActiveMiner,
  unregisterActiveMiner,
  updateMinerStats,
  performDistribution,
  handleDiscovery,
  getDistributionStats,
  getMinerPendingReward,
  getActiveMinerCount,
  getActiveMiner,
  forceDistribution,
  resetDistributionService,
} from './distribution-service';

// Syndicate Manager
export {
  SyndicateManager,
  getSyndicateManager,
  resetSyndicateManager,
} from './syndicate-manager';

// Syndicate Raids
export {
  SyndicateRaidsManager,
  getSyndicateRaidsManager,
  resetSyndicateRaidsManager,
} from './syndicate-raids';

// Reward Orchestrator
export {
  initRewardOrchestrator,
  handleNewDiscovery,
  handleDefenderSpoils,
  getOrchestratorStats,
  getMineVaultStats,
  forceHourlyDistribution,
  isProductionReady,
  REWARD_CONFIG,
} from './reward-orchestrator';
