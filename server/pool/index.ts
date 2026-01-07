/**
 * @fileoverview Pool module exports for Black Gold mining pool
 * Re-exports all pool-related functionality
 */

// Work unit management
export type { WorkTracker } from './work';
export {
  createWorkTracker,
  generateDiscoveryHeader,
  generateDiscoveryHeader as generateBarrelHeader, // Legacy alias
  generateWork,
  validateWork,
  invalidateWork,
  startNewDiscovery,
  startNewBarrel, // Legacy alias
  cleanupExpiredWork,
} from './work';

// Difficulty adjustment
export type { DifficultyState } from './difficulty';
export {
  createDifficultyState,
  difficultyToTarget,
  adjustDifficulty,
  updateHashrateEstimate,
  estimateTimeToDiscovery,
  estimateTimeToDiscovery as estimateTimeToBarrel, // Legacy alias
} from './difficulty';

// Pool manager
export { PoolManager } from './manager';
export type { PoolState } from './manager';
