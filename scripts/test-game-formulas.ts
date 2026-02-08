/**
 * @fileoverview Unit tests for Black Gold game formulas and staking mechanics
 * Run with: npx tsx scripts/test-game-formulas.ts
 * 
 * Covers:
 * - Stake tier calculations
 * - Hashrate multiplier accuracy
 * - Defense power calculations
 * - Attack power calculations
 * - Vault distribution fairness
 * - Edge cases (zero values, overflows, boundary conditions)
 * - Reward split calculations
 */

import {
  getStakeTier,
  calculateEffectiveHashrate,
  calculateDefensePower,
  calculateAttackPower,
  calculateSyndicateMultiplier,
  rollSilverSurgeMultiplier,
  rollGoldRushJackpot,
  STAKE_TIERS,
} from '../server/game/types';

import {
  calculateRewardSplit,
  calculateMinerScore,
} from '../server/game/vault-manager';

// ============ TEST FRAMEWORK ============

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, message: string): void {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ ${message}`);
  } else {
    failedTests++;
    console.log(`  ✗ FAIL: ${message}`);
  }
}

function assertApprox(actual: number, expected: number, tolerance: number, message: string): void {
  const diff = Math.abs(actual - expected);
  assert(diff <= tolerance, `${message} (expected ~${expected}, got ${actual}, diff=${diff.toFixed(4)})`);
}

function section(name: string): void {
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`  ${name}`);
  console.log(`${'─'.repeat(50)}`);
}

// ============ STAKE TIER TESTS ============

section('Stake Tier Calculations');

// Test tier boundaries
assert(getStakeTier(0).name === 'Base', 'Tier at 0 stake = Base');
assert(getStakeTier(1).name === 'Base', 'Tier at 1 stake = Base');
assert(getStakeTier(99).name === 'Base', 'Tier at 99 stake = Base');
assert(getStakeTier(100).name === 'Bronze', 'Tier at 100 stake = Bronze');
assert(getStakeTier(499).name === 'Bronze', 'Tier at 499 stake = Bronze');
assert(getStakeTier(500).name === 'Silver', 'Tier at 500 stake = Silver');
assert(getStakeTier(999).name === 'Silver', 'Tier at 999 stake = Silver');
assert(getStakeTier(1000).name === 'Gold', 'Tier at 1000 stake = Gold');
assert(getStakeTier(4999).name === 'Gold', 'Tier at 4999 stake = Gold');
assert(getStakeTier(5000).name === 'Diamond', 'Tier at 5000 stake = Diamond');
assert(getStakeTier(1_000_000).name === 'Diamond', 'Tier at 1M stake = Diamond');

// Test multipliers
assert(getStakeTier(0).hashrateMultiplier === 1.0, 'Base hashrate multiplier = 1.0x');
assert(getStakeTier(100).hashrateMultiplier === 1.5, 'Bronze hashrate multiplier = 1.5x');
assert(getStakeTier(500).hashrateMultiplier === 2.0, 'Silver hashrate multiplier = 2.0x');
assert(getStakeTier(1000).hashrateMultiplier === 2.5, 'Gold hashrate multiplier = 2.5x');
assert(getStakeTier(5000).hashrateMultiplier === 3.0, 'Diamond hashrate multiplier = 3.0x');

// Defense multipliers
assert(getStakeTier(0).defenseMultiplier === 1.0, 'Base defense multiplier = 1.0x');
assert(getStakeTier(100).defenseMultiplier === 1.2, 'Bronze defense multiplier = 1.2x');
assert(getStakeTier(5000).defenseMultiplier === 2.0, 'Diamond defense multiplier = 2.0x');

// Edge case: negative stake
assert(getStakeTier(-1).name === 'Base', 'Negative stake returns Base tier');
assert(getStakeTier(-1000).name === 'Base', 'Large negative stake returns Base tier');

// ============ EFFECTIVE HASHRATE TESTS ============

section('Effective Hashrate Calculations');

// Base hashrate with no stake (coal mine)
assertApprox(
  calculateEffectiveHashrate(10000, 0, 0, 'coal'),
  10000, 0,
  'No stake = base hashrate (coal)'
);

// Bronze tier at coal mine
assertApprox(
  calculateEffectiveHashrate(10000, 100, 0, 'coal'),
  15000, 0,
  'Bronze stake = 1.5x hashrate (coal)'
);

// Diamond tier at coal mine
assertApprox(
  calculateEffectiveHashrate(10000, 5000, 0, 'coal'),
  30000, 0,
  'Diamond stake = 3.0x hashrate (coal)'
);

// Coal loyalty bonus (7+ days)
assertApprox(
  calculateEffectiveHashrate(10000, 100, 7, 'coal'),
  16500, 0,
  'Bronze + coal loyalty = 1.5 * 1.1 = 1.65x'
);

// No coal loyalty at gold mine
assertApprox(
  calculateEffectiveHashrate(10000, 100, 7, 'gold'),
  15000, 0,
  'Bronze + gold mine = 1.5x (no loyalty bonus for gold)'
);

// Coal loyalty under 7 days (no bonus)
assertApprox(
  calculateEffectiveHashrate(10000, 100, 6, 'coal'),
  15000, 0,
  'Bronze + 6 day loyalty = 1.5x (no bonus yet)'
);

// Zero hashrate edge case
assertApprox(
  calculateEffectiveHashrate(0, 5000, 10, 'coal'),
  0, 0,
  'Zero base hashrate stays zero regardless of multiplier'
);

// ============ DEFENSE POWER TESTS ============

section('Defense Power Calculations');

// Basic defense power
assertApprox(
  calculateDefensePower(100, false),
  120, 0,
  'Bronze 100 stake, no home base = 100 * 1.2 = 120'
);

// Home base bonus
assertApprox(
  calculateDefensePower(100, true),
  180, 0,
  'Bronze 100 stake, home base = 100 * 1.2 * 1.5 = 180'
);

// Silver tier defense
assertApprox(
  calculateDefensePower(500, false),
  750, 0,
  'Silver 500 stake, no home = 500 * 1.5 = 750'
);

assertApprox(
  calculateDefensePower(500, true),
  1125, 0,
  'Silver 500 stake, home = 500 * 1.5 * 1.5 = 1125'
);

// Gold tier defense
assertApprox(
  calculateDefensePower(1000, true),
  2700, 0,
  'Gold 1000 stake, home = 1000 * 1.8 * 1.5 = 2700'
);

// Diamond tier defense
assertApprox(
  calculateDefensePower(5000, true),
  15000, 0,
  'Diamond 5000 stake, home = 5000 * 2.0 * 1.5 = 15000'
);

// Zero stake
assertApprox(
  calculateDefensePower(0, true),
  0, 0,
  'Zero stake = zero defense power'
);

// ============ ATTACK POWER TESTS ============

section('Attack Power Calculations');

assertApprox(
  calculateAttackPower(10000, 100),
  5010, 0,
  'Attack = (10000 * 0.5) + (100 * 0.1) = 5010'
);

assertApprox(
  calculateAttackPower(0, 1000),
  100, 0,
  'Zero hashrate attack = only stake component (1000 * 0.1 = 100)'
);

assertApprox(
  calculateAttackPower(50000, 0),
  25000, 0,
  'Zero stake attack = only hashrate component (50000 * 0.5 = 25000)'
);

assertApprox(
  calculateAttackPower(0, 0),
  0, 0,
  'Zero everything = zero attack power'
);

// ============ SYNDICATE MULTIPLIER TESTS ============

section('Syndicate Multiplier Calculations');

assertApprox(calculateSyndicateMultiplier(1), 1.0, 0.001, '1 miner = 1.0x');
assertApprox(calculateSyndicateMultiplier(0), 1.0, 0.001, '0 miners = 1.0x');
assertApprox(calculateSyndicateMultiplier(50), 3.0, 0.001, '50 miners = 3.0x');
assertApprox(calculateSyndicateMultiplier(100), 3.0, 0.001, '100 miners = 3.0x (capped)');
assertApprox(calculateSyndicateMultiplier(25), 1.0 + (24 * (2.0 / 49)), 0.01, '25 miners = ~1.98x');

// ============ VAULT REWARD SPLIT TESTS ============

section('Vault Reward Split');

const split100 = calculateRewardSplit(100);
assert(split100.finderShare === 70, 'Finder share of 100 = 70');
assert(split100.vaultShare === 30, 'Vault share of 100 = 30');
assert(split100.finderShare + split100.vaultShare <= 100, 'Shares dont exceed total');

const split1 = calculateRewardSplit(1);
assert(split1.finderShare === 0, 'Finder share of 1 = 0 (floor)');
assert(split1.vaultShare === 0, 'Vault share of 1 = 0 (floor)');

const split0 = calculateRewardSplit(0);
assert(split0.finderShare === 0, 'Finder share of 0 = 0');
assert(split0.vaultShare === 0, 'Vault share of 0 = 0');

// Large numbers
const splitLarge = calculateRewardSplit(1_000_000);
assert(splitLarge.finderShare === 700_000, 'Finder share of 1M = 700K');
assert(splitLarge.vaultShare === 300_000, 'Vault share of 1M = 300K');

// ============ MINER SCORE TESTS ============

section('Miner Score Calculations');

const score1 = calculateMinerScore(
  { walletAddress: 'test', hashrateSeconds: 1000, stakeTierMultiplier: 1.0, loyaltyBonus: 0, timeActiveSeconds: 3600 },
  1000
);
assertApprox(score1, 1.0, 0.001, 'Solo miner with 100% hashrate = 1.0');

const score2 = calculateMinerScore(
  { walletAddress: 'test', hashrateSeconds: 500, stakeTierMultiplier: 2.0, loyaltyBonus: 0, timeActiveSeconds: 3600 },
  1000
);
assertApprox(score2, 1.0, 0.001, '50% hashrate with 2x stake = 1.0');

const scorePartTime = calculateMinerScore(
  { walletAddress: 'test', hashrateSeconds: 1000, stakeTierMultiplier: 1.0, loyaltyBonus: 0, timeActiveSeconds: 1800 },
  1000
);
assertApprox(scorePartTime, 0.5, 0.001, 'Full hashrate but only 30min = 0.5 time factor');

// Zero total hashrate
const scoreZero = calculateMinerScore(
  { walletAddress: 'test', hashrateSeconds: 1000, stakeTierMultiplier: 1.0, loyaltyBonus: 0, timeActiveSeconds: 3600 },
  0
);
assert(scoreZero === 0, 'Zero total hashrate = zero score');

// With loyalty bonus
const scoreLoyal = calculateMinerScore(
  { walletAddress: 'test', hashrateSeconds: 1000, stakeTierMultiplier: 1.0, loyaltyBonus: 0.1, timeActiveSeconds: 3600 },
  1000
);
assertApprox(scoreLoyal, 1.1, 0.001, '10% loyalty bonus = 1.1');

// ============ RANDOM MECHANIC TESTS ============

section('Random Mechanics (Statistical)');

// Silver surge - should be in range [0.5, 2.0]
let silverMin = Infinity;
let silverMax = -Infinity;
for (let i = 0; i < 10000; i++) {
  const val = rollSilverSurgeMultiplier();
  if (val < silverMin) silverMin = val;
  if (val > silverMax) silverMax = val;
}
assert(silverMin >= 0.5, `Silver surge min >= 0.5 (got ${silverMin.toFixed(4)})`);
assert(silverMax <= 2.0, `Silver surge max <= 2.0 (got ${silverMax.toFixed(4)})`);
assert(silverMax > 1.5, `Silver surge reaches high values (max was ${silverMax.toFixed(4)})`);
assert(silverMin < 0.6, `Silver surge reaches low values (min was ${silverMin.toFixed(4)})`);

// Gold rush jackpot - should be ~5% chance
let jackpotCount = 0;
const jackpotTrials = 100_000;
for (let i = 0; i < jackpotTrials; i++) {
  if (rollGoldRushJackpot()) jackpotCount++;
}
const jackpotRate = jackpotCount / jackpotTrials;
assertApprox(jackpotRate, 0.05, 0.005, `Gold rush jackpot rate ~5% (got ${(jackpotRate * 100).toFixed(2)}%)`);

// ============ OVERFLOW / PRECISION TESTS ============

section('Overflow and Precision Edge Cases');

// Very large stake amount
const largeTier = getStakeTier(Number.MAX_SAFE_INTEGER);
assert(largeTier.name === 'Diamond', 'MAX_SAFE_INTEGER stake = Diamond tier');

// Very large hashrate
const largeHashrate = calculateEffectiveHashrate(Number.MAX_SAFE_INTEGER, 5000, 0, 'coal');
assert(isFinite(largeHashrate), 'MAX_SAFE_INTEGER hashrate produces finite result');

// Very small amounts
assertApprox(
  calculateDefensePower(0.001, true),
  0.001 * 1.0 * 1.5, 0.0001,
  'Tiny stake defense power is non-zero'
);

// Negative amounts (edge case)
assert(calculateDefensePower(-100, false) <= 0, 'Negative stake gives non-positive defense');

// ============ TIER CONSISTENCY TESTS ============

section('Tier Array Consistency');

// Tiers should be in ascending order of minStake
for (let i = 1; i < STAKE_TIERS.length; i++) {
  assert(
    STAKE_TIERS[i].minStake > STAKE_TIERS[i - 1].minStake,
    `Tier ${STAKE_TIERS[i].name} minStake (${STAKE_TIERS[i].minStake}) > ${STAKE_TIERS[i - 1].name} (${STAKE_TIERS[i - 1].minStake})`
  );
}

// Hashrate multipliers should be ascending
for (let i = 1; i < STAKE_TIERS.length; i++) {
  assert(
    STAKE_TIERS[i].hashrateMultiplier >= STAKE_TIERS[i - 1].hashrateMultiplier,
    `Tier ${STAKE_TIERS[i].name} hashrate mult (${STAKE_TIERS[i].hashrateMultiplier}) >= ${STAKE_TIERS[i - 1].name} (${STAKE_TIERS[i - 1].hashrateMultiplier})`
  );
}

// Defense multipliers should be ascending
for (let i = 1; i < STAKE_TIERS.length; i++) {
  assert(
    STAKE_TIERS[i].defenseMultiplier >= STAKE_TIERS[i - 1].defenseMultiplier,
    `Tier ${STAKE_TIERS[i].name} defense mult (${STAKE_TIERS[i].defenseMultiplier}) >= ${STAKE_TIERS[i - 1].name} (${STAKE_TIERS[i - 1].defenseMultiplier})`
  );
}

// ============ SUMMARY ============

console.log(`\n${'═'.repeat(50)}`);
console.log(`  RESULTS: ${passedTests}/${totalTests} passed, ${failedTests} failed`);
console.log(`${'═'.repeat(50)}`);

if (failedTests > 0) {
  process.exit(1);
} else {
  console.log('\n  All tests passed!\n');
}
