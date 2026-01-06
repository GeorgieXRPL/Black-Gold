/**
 * @fileoverview Dynamic difficulty adjustment for Black Gold mining
 * Adjusts difficulty to maintain target barrel time based on network hashrate
 */

import { POOL_CONFIG } from '../../config/constants';

/**
 * Difficulty adjustment state
 */
export interface DifficultyState {
  /** Current difficulty */
  current: number;
  /** Target for current difficulty */
  target: string;
  /** Last barrel timestamp */
  lastBarrelTime: number | null;
  /** Recent barrel times for averaging */
  recentBarrelTimes: number[];
  /** Network hashrate estimate */
  estimatedHashrate: number;
}

/**
 * Create initial difficulty state
 */
export function createDifficultyState(): DifficultyState {
  return {
    current: POOL_CONFIG.MIN_DIFFICULTY,
    target: difficultyToTarget(POOL_CONFIG.MIN_DIFFICULTY),
    lastBarrelTime: null,
    recentBarrelTimes: [],
    estimatedHashrate: 0,
  };
}

/**
 * Convert difficulty to target hash
 * Lower difficulty = higher target = easier to find
 * @param difficulty - Difficulty value (1+)
 * @returns 64-char hex target string
 */
export function difficultyToTarget(difficulty: number): string {
  // Ensure minimum difficulty
  const safeDifficulty = Math.max(POOL_CONFIG.MIN_DIFFICULTY, difficulty);
  
  // Calculate number of leading zeros based on difficulty
  // Each 16x increase in difficulty adds one leading zero hex digit
  const leadingZeros = Math.floor(Math.log(safeDifficulty) / Math.log(16));
  
  // Calculate the significant portion
  const divisor = Math.pow(16, leadingZeros);
  const remainder = 0xffff / (safeDifficulty / divisor);
  
  // Build target string
  const zeros = '0'.repeat(Math.min(leadingZeros, 60));
  const significant = Math.floor(remainder).toString(16).padStart(4, '0');
  const padding = 'f'.repeat(64 - zeros.length - significant.length);
  
  return (zeros + significant + padding).substring(0, 64);
}

/**
 * Calculate new difficulty based on recent barrel times
 * Uses a moving average of recent times to smooth adjustments
 * @param state - Current difficulty state
 * @param actualTime - Time taken to find last barrel (ms)
 * @returns Updated difficulty state
 */
export function adjustDifficulty(
  state: DifficultyState,
  actualTime: number
): DifficultyState {
  const targetTime = POOL_CONFIG.TARGET_BARREL_TIME_MS;
  
  // Add to recent times (keep last 10)
  const recentBarrelTimes = [...state.recentBarrelTimes, actualTime].slice(-10);
  
  // Calculate average barrel time
  const avgTime = recentBarrelTimes.reduce((a, b) => a + b, 0) / recentBarrelTimes.length;
  
  // Calculate adjustment ratio
  // If barrels are coming too fast, increase difficulty
  // If too slow, decrease difficulty
  const ratio = targetTime / avgTime;
  
  // Apply dampening to prevent oscillation (max 25% change per adjustment)
  const dampedRatio = 1 + (ratio - 1) * 0.25;
  
  // Calculate new difficulty
  let newDifficulty = Math.round(state.current * dampedRatio);
  
  // Clamp to min/max
  newDifficulty = Math.max(POOL_CONFIG.MIN_DIFFICULTY, newDifficulty);
  newDifficulty = Math.min(POOL_CONFIG.MAX_DIFFICULTY, newDifficulty);
  
  // Calculate new target
  const newTarget = difficultyToTarget(newDifficulty);
  
  console.log(
    `[Difficulty] Adjusted: ${state.current} -> ${newDifficulty} ` +
    `(avg time: ${Math.round(avgTime / 1000)}s, target: ${targetTime / 1000}s)`
  );
  
  return {
    current: newDifficulty,
    target: newTarget,
    lastBarrelTime: Date.now(),
    recentBarrelTimes,
    estimatedHashrate: state.estimatedHashrate,
  };
}

/**
 * Update hashrate estimate based on miner reports
 * @param state - Current difficulty state
 * @param networkHashrate - Total network hashrate
 * @returns Updated state with new estimate
 */
export function updateHashrateEstimate(
  state: DifficultyState,
  networkHashrate: number
): DifficultyState {
  // Smooth the estimate (exponential moving average)
  const alpha = 0.3;
  const smoothedHashrate = state.estimatedHashrate === 0
    ? networkHashrate
    : alpha * networkHashrate + (1 - alpha) * state.estimatedHashrate;
  
  return {
    ...state,
    estimatedHashrate: smoothedHashrate,
  };
}

/**
 * Estimate time to next barrel based on current difficulty and hashrate
 * @param state - Current difficulty state
 * @returns Estimated time in milliseconds
 */
export function estimateTimeToBarrel(state: DifficultyState): number {
  if (state.estimatedHashrate === 0) {
    return POOL_CONFIG.TARGET_BARREL_TIME_MS;
  }
  
  // Simplified estimation: hashrate * time = difficulty (roughly)
  const estimatedTime = (state.current * 1000) / state.estimatedHashrate;
  return Math.max(1000, estimatedTime * 1000); // At least 1 second
}
