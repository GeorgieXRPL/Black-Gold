/**
 * @fileoverview Pool module exports for Black Gold mining pool
 * Re-exports all pool-related functionality
 */

// Work unit management
export type { WorkTracker } from './work';
export {
  createWorkTracker,
  generateBarrelHeader,
  generateWork,
  validateWork,
  invalidateWork,
  startNewBarrel,
  cleanupExpiredWork,
} from './work';

// Difficulty adjustment
export type { DifficultyState } from './difficulty';
export {
  createDifficultyState,
  difficultyToTarget,
  adjustDifficulty,
  updateHashrateEstimate,
  estimateTimeToBarrel,
} from './difficulty';

// Pool manager
export { PoolManager } from './manager';
export type { PoolState } from './manager';
