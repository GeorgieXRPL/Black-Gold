/**
 * @fileoverview Dynamic difficulty adjustment for Black Gold mining
 * Calculates per-mine difficulty based on target discovery times
 * Adjusts difficulty dynamically based on network hashrate
 */

import { POOL_CONFIG } from '../../config/constants';

/**
 * Difficulty adjustment state for a mine
 */
export interface DifficultyState {
  /** Current difficulty */
  current: number;
  /** Target hex string for current difficulty */
  target: string;
  /** Target discovery time in ms (from mine definition) */
  targetTimeMs: number;
  /** Last discovery timestamp */
  lastDiscoveryTime: number | null;
  /** Recent discovery times for averaging */
  recentDiscoveryTimes: number[];
  /** Network hashrate estimate at this mine */
  estimatedHashrate: number;
}

/**
 * Create initial difficulty state with default target time
 */
export function createDifficultyState(): DifficultyState {
  return createDifficultyStateForMine(POOL_CONFIG.TARGET_BARREL_TIME_MS);
}

/**
 * Create initial difficulty state for a specific mine
 * @param targetTimeMs - Target discovery time from mine definition (e.g., 5 min for Coal)
 */
export function createDifficultyStateForMine(targetTimeMs: number): DifficultyState {
  // Calculate initial difficulty based on target time and baseline hashrate
  // Formula: difficulty = (targetTimeMs / 1000) * baselineHashrate
  const initialDifficulty = calculateBaseDifficulty(targetTimeMs);
  
  return {
    current: initialDifficulty,
    target: difficultyToTarget(initialDifficulty),
    targetTimeMs,
    lastDiscoveryTime: null,
    recentDiscoveryTimes: [],
    estimatedHashrate: POOL_CONFIG.BASELINE_HASHRATE,
  };
}

/**
 * Calculate base difficulty for a given target time
 * This is the difficulty for a single miner at baseline hashrate
 * @param targetTimeMs - Target discovery time in milliseconds
 * @returns Base difficulty value
 */
export function calculateBaseDifficulty(targetTimeMs: number): number {
  // difficulty = targetTimeSeconds × baselineHashrate
  const targetSeconds = targetTimeMs / 1000;
  const baseDifficulty = Math.round(targetSeconds * POOL_CONFIG.BASELINE_HASHRATE);
  
  // Clamp to min/max
  return Math.max(
    POOL_CONFIG.MIN_DIFFICULTY,
    Math.min(POOL_CONFIG.MAX_DIFFICULTY, baseDifficulty)
  );
}

/**
 * Calculate scaled difficulty based on network hashrate at a mine
 * More miners = higher difficulty to maintain target discovery time
 * @param targetTimeMs - Target discovery time in milliseconds
 * @param networkHashrate - Total hashrate at the mine
 * @returns Scaled difficulty value
 */
export function calculateScaledDifficulty(
  targetTimeMs: number,
  networkHashrate: number
): number {
  // Use baseline hashrate if network hashrate is unknown or zero
  const effectiveHashrate = Math.max(networkHashrate, POOL_CONFIG.BASELINE_HASHRATE);
  
  // difficulty = targetTimeSeconds × networkHashrate
  const targetSeconds = targetTimeMs / 1000;
  const scaledDifficulty = Math.round(targetSeconds * effectiveHashrate);
  
  // Clamp to min/max
  const clampedDifficulty = Math.max(
    POOL_CONFIG.MIN_DIFFICULTY,
    Math.min(POOL_CONFIG.MAX_DIFFICULTY, scaledDifficulty)
  );
  
  console.log(
    `[Difficulty] Scaled: ${targetSeconds}s × ${effectiveHashrate} H/s = ${clampedDifficulty} difficulty`
  );
  
  return clampedDifficulty;
}

/**
 * Convert difficulty to target hash
 * Higher difficulty = lower target = harder to find valid hash
 * 
 * The target is a 256-bit (64 hex char) number.
 * A valid hash must be less than the target.
 * 
 * Difficulty relationship:
 * - difficulty 1,500,000 → ~5 leading hex zeros
 * - difficulty 3,000,000 → ~5-6 leading hex zeros
 * - difficulty 6,000,000 → ~6 leading hex zeros
 * - difficulty 12,000,000 → ~6-7 leading hex zeros
 * 
 * @param difficulty - Difficulty value
 * @returns 64-char hex target string
 */
export function difficultyToTarget(difficulty: number): string {
  // Ensure minimum difficulty
  const safeDifficulty = Math.max(POOL_CONFIG.MIN_DIFFICULTY, difficulty);
  
  // Calculate the maximum value that's valid
  // target = MAX_HASH / difficulty
  // MAX_HASH = 2^256, but we work in hex representation
  
  // For practical calculation, we use:
  // leadingZeros = floor(log16(difficulty))
  // This determines how many hex chars of leading zeros
  const leadingZeros = Math.floor(Math.log(safeDifficulty) / Math.log(16));
  
  // Calculate the significant portion after the leading zeros
  const divisor = Math.pow(16, leadingZeros);
  const remainder = 0xffff / (safeDifficulty / divisor);
  
  // Build target string
  // Format: [leading zeros][significant portion][padding fs]
  const zeros = '0'.repeat(Math.min(leadingZeros, 60));
  const significant = Math.floor(remainder).toString(16).padStart(4, '0');
  const padding = 'f'.repeat(64 - zeros.length - significant.length);
  
  const target = (zeros + significant + padding).substring(0, 64);
  
  // Log for debugging (only occasionally to reduce noise)
  if (Math.random() < 0.1) {
    console.log(
      `[Difficulty] ${safeDifficulty.toLocaleString()} → Target ${target.substring(0, 12)}... ` +
      `(${leadingZeros} leading zeros)`
    );
  }
  
  return target;
}

/**
 * Adjust difficulty based on actual discovery time
 * Uses a moving average and dampening to prevent oscillation
 * 
 * @param state - Current difficulty state
 * @param actualTime - Time taken to find last discovery (ms)
 * @returns Updated difficulty state
 */
export function adjustDifficulty(
  state: DifficultyState,
  actualTime: number
): DifficultyState {
  const targetTime = state.targetTimeMs;
  
  // Add to recent times (keep last 10 for averaging)
  const recentDiscoveryTimes = [...state.recentDiscoveryTimes, actualTime].slice(-10);
  
  // Calculate average discovery time
  const avgTime = recentDiscoveryTimes.reduce((a, b) => a + b, 0) / recentDiscoveryTimes.length;
  
  // Calculate adjustment ratio
  // If discoveries are coming too fast (avgTime < targetTime), increase difficulty
  // If too slow (avgTime > targetTime), decrease difficulty
  const ratio = targetTime / avgTime;
  
  // Apply dampening to prevent oscillation (max 25% change per adjustment)
  // This smooths out variance in discovery times
  const dampedRatio = 1 + (ratio - 1) * 0.25;
  
  // Calculate new difficulty
  let newDifficulty = Math.round(state.current * dampedRatio);
  
  // Clamp to min/max
  newDifficulty = Math.max(POOL_CONFIG.MIN_DIFFICULTY, newDifficulty);
  newDifficulty = Math.min(POOL_CONFIG.MAX_DIFFICULTY, newDifficulty);
  
  // Calculate new target
  const newTarget = difficultyToTarget(newDifficulty);
  
  console.log(
    `[Difficulty] Adjusted: ${state.current.toLocaleString()} → ${newDifficulty.toLocaleString()} ` +
    `(avg: ${Math.round(avgTime / 1000)}s, target: ${targetTime / 1000}s, ratio: ${ratio.toFixed(2)})`
  );
  
  return {
    current: newDifficulty,
    target: newTarget,
    targetTimeMs: state.targetTimeMs,
    lastDiscoveryTime: Date.now(),
    recentDiscoveryTimes,
    estimatedHashrate: state.estimatedHashrate,
  };
}

/**
 * Update hashrate estimate based on miner reports
 * Uses exponential moving average for smoothing
 * 
 * @param state - Current difficulty state
 * @param networkHashrate - Total network hashrate at this mine
 * @returns Updated state with new estimate
 */
export function updateHashrateEstimate(
  state: DifficultyState,
  networkHashrate: number
): DifficultyState {
  // Smooth the estimate (exponential moving average)
  // Alpha of 0.3 gives good responsiveness while smoothing noise
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
 * Recalculate difficulty based on current hashrate estimate
 * Call this when hashrate changes significantly
 * 
 * @param state - Current difficulty state
 * @returns Updated state with recalculated difficulty
 */
export function recalculateDifficultyFromHashrate(state: DifficultyState): DifficultyState {
  const newDifficulty = calculateScaledDifficulty(
    state.targetTimeMs,
    state.estimatedHashrate
  );
  
  return {
    ...state,
    current: newDifficulty,
    target: difficultyToTarget(newDifficulty),
  };
}

/**
 * Estimate time to next discovery based on current difficulty and hashrate
 * @param state - Current difficulty state
 * @returns Estimated time in milliseconds
 */
export function estimateTimeToDiscovery(state: DifficultyState): number {
  if (state.estimatedHashrate === 0) {
    return state.targetTimeMs;
  }
  
  // time = difficulty / hashrate (in seconds)
  const estimatedSeconds = state.current / state.estimatedHashrate;
  return Math.max(1000, estimatedSeconds * 1000); // At least 1 second
}

/**
 * Get human-readable difficulty info for logging/display
 */
export function getDifficultyInfo(state: DifficultyState): {
  difficulty: number;
  difficultyFormatted: string;
  targetTimeMinutes: number;
  estimatedTimeMinutes: number;
  hashrate: number;
  hashrateFormatted: string;
} {
  const estimatedTime = estimateTimeToDiscovery(state);
  
  const formatHashrate = (h: number): string => {
    if (h >= 1_000_000) return `${(h / 1_000_000).toFixed(1)} MH/s`;
    if (h >= 1_000) return `${(h / 1_000).toFixed(1)} KH/s`;
    return `${h} H/s`;
  };
  
  return {
    difficulty: state.current,
    difficultyFormatted: state.current.toLocaleString(),
    targetTimeMinutes: state.targetTimeMs / 60_000,
    estimatedTimeMinutes: estimatedTime / 60_000,
    hashrate: state.estimatedHashrate,
    hashrateFormatted: formatHashrate(state.estimatedHashrate),
  };
}
