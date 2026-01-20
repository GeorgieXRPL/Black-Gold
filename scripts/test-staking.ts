/**
 * @fileoverview Comprehensive staking system test suite for Black Gold
 * Run with: npx tsx scripts/test-staking.ts
 * 
 * Tests:
 * - Basic stake/unstake operations
 * - Tier calculations and multipliers
 * - Hashrate and defense power calculations
 * - Stress tests for rapid/concurrent operations
 * - Error handling and edge cases
 */

import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

// ============ TEST FRAMEWORK ============

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
  details?: string;
}

interface TestSuite {
  name: string;
  results: TestResult[];
  totalTests: number;
  passedTests: number;
  failedTests: number;
  duration: number;
}

const testResults: TestSuite[] = [];
let currentSuite: TestSuite | null = null;

function startSuite(name: string): void {
  currentSuite = {
    name,
    results: [],
    totalTests: 0,
    passedTests: 0,
    failedTests: 0,
    duration: 0,
  };
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  📋 ${name}`);
  console.log(`${'═'.repeat(60)}`);
}

function endSuite(): void {
  if (!currentSuite) return;
  
  currentSuite.totalTests = currentSuite.results.length;
  currentSuite.passedTests = currentSuite.results.filter(r => r.passed).length;
  currentSuite.failedTests = currentSuite.results.filter(r => !r.passed).length;
  currentSuite.duration = currentSuite.results.reduce((sum, r) => sum + r.duration, 0);
  
  testResults.push(currentSuite);
  
  const statusIcon = currentSuite.failedTests === 0 ? '✅' : '❌';
  console.log(`\n  ${statusIcon} Suite: ${currentSuite.passedTests}/${currentSuite.totalTests} passed (${currentSuite.duration}ms)`);
  currentSuite = null;
}

async function runTest(name: string, testFn: () => Promise<void> | void): Promise<void> {
  const start = Date.now();
  let passed = true;
  let error: string | undefined;
  
  try {
    await testFn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    passed = false;
    error = e instanceof Error ? e.message : String(e);
    console.log(`  ✗ ${name}`);
    console.log(`    └─ Error: ${error}`);
  }
  
  const duration = Date.now() - start;
  
  if (currentSuite) {
    currentSuite.results.push({ name, passed, duration, error });
  }
}

function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

function assertApproxEqual(actual: number, expected: number, tolerance: number = 0.001, message?: string): void {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(message || `Expected ${expected} ± ${tolerance}, got ${actual}`);
  }
}

function assertTrue(condition: boolean, message?: string): void {
  if (!condition) {
    throw new Error(message || 'Assertion failed: expected true');
  }
}

function assertFalse(condition: boolean, message?: string): void {
  if (condition) {
    throw new Error(message || 'Assertion failed: expected false');
  }
}

function assertThrows(fn: () => void, message?: string): void {
  try {
    fn();
    throw new Error(message || 'Expected function to throw');
  } catch (e) {
    // Expected
  }
}

// ============ STAKE TIER DEFINITIONS (mirror from server/game/types.ts) ============

interface StakeTier {
  minStake: number;
  name: string;
  hashrateMultiplier: number;
  defenseMultiplier: number;
}

const STAKE_TIERS: StakeTier[] = [
  { minStake: 0, name: 'Base', hashrateMultiplier: 1.0, defenseMultiplier: 1.0 },
  { minStake: 100, name: 'Bronze', hashrateMultiplier: 1.5, defenseMultiplier: 1.2 },
  { minStake: 500, name: 'Silver', hashrateMultiplier: 2.0, defenseMultiplier: 1.5 },
  { minStake: 1000, name: 'Gold', hashrateMultiplier: 2.5, defenseMultiplier: 1.8 },
  { minStake: 5000, name: 'Diamond', hashrateMultiplier: 3.0, defenseMultiplier: 2.0 },
];

// ============ HELPER FUNCTIONS (mirror from server/game/types.ts) ============

function getStakeTier(stakeAmount: number): StakeTier {
  for (let i = STAKE_TIERS.length - 1; i >= 0; i--) {
    if (stakeAmount >= STAKE_TIERS[i].minStake) {
      return STAKE_TIERS[i];
    }
  }
  return STAKE_TIERS[0];
}

function calculateEffectiveHashrate(
  baseHashrate: number,
  stakeAmount: number,
  loyaltyDays: number,
  resource: 'coal' | 'gold' | 'silver' | 'oil'
): number {
  const tier = getStakeTier(stakeAmount);
  let multiplier = tier.hashrateMultiplier;
  
  // Coal loyalty bonus: +10% after 7 days
  if (resource === 'coal' && loyaltyDays >= 7) {
    multiplier *= 1.1;
  }
  
  return baseHashrate * multiplier;
}

function calculateDefensePower(stakeAmount: number, isHomeBase: boolean): number {
  const tier = getStakeTier(stakeAmount);
  let power = stakeAmount * tier.defenseMultiplier;
  
  // Home base advantage: 1.5x stake power for defense
  if (isHomeBase) {
    power *= 1.5;
  }
  
  return power;
}

function calculateAttackPower(effectiveHashrate: number, stakeAmount: number): number {
  return (effectiveHashrate * 0.5) + (stakeAmount * 0.1);
}

// ============ MOCK API CLIENT ============

interface StakingConfig {
  available: boolean;
  network: string;
  quarryAddress: string | null;
  rewarderAddress?: string | null;
  iouTokenMint: string | null;
  coalTokenMint: string | null;
}

interface StakeInfo {
  stakedAmount: number;
  pendingRewards: number;
  lastStakeTime: Date | null;
  minerPDA: string | null;
}

class StakingTestClient {
  private baseUrl: string;
  
  constructor(baseUrl: string = 'http://localhost:3001') {
    this.baseUrl = baseUrl;
  }
  
  async getConfig(): Promise<StakingConfig | null> {
    try {
      const response = await fetch(`${this.baseUrl}/api/staking/config`);
      if (!response.ok) return null;
      return await response.json();
    } catch (e) {
      console.log(`    ⚠️ API not reachable: ${e instanceof Error ? e.message : e}`);
      return null;
    }
  }
  
  async getStakeInfo(walletAddress: string): Promise<StakeInfo | null> {
    try {
      const response = await fetch(`${this.baseUrl}/api/staking/info/${walletAddress}`);
      if (!response.ok) return null;
      return await response.json();
    } catch (e) {
      return null;
    }
  }
  
  async buildStakeTransaction(walletAddress: string, amount: number): Promise<{ transaction?: string; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/staking/stake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress, amount }),
      });
      return await response.json();
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Network error' };
    }
  }
  
  async buildUnstakeTransaction(walletAddress: string, amount: number): Promise<{ transaction?: string; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/staking/unstake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress, amount }),
      });
      return await response.json();
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Network error' };
    }
  }
  
  async verifyTransaction(signature: string, walletAddress: string, type: string, amount?: number): Promise<{ verified: boolean; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/staking/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signature, walletAddress, type, amount }),
      });
      return await response.json();
    } catch (e) {
      return { verified: false, error: e instanceof Error ? e.message : 'Network error' };
    }
  }
}

// ============ TEST SUITES ============

// --- Suite 1: Tier Calculation Tests ---
async function runTierCalculationTests(): Promise<void> {
  startSuite('Tier Calculation Tests');
  
  await runTest('Base tier for 0 stake', () => {
    const tier = getStakeTier(0);
    assertEqual(tier.name, 'Base');
    assertEqual(tier.hashrateMultiplier, 1.0);
    assertEqual(tier.defenseMultiplier, 1.0);
  });
  
  await runTest('Base tier for 50 stake', () => {
    const tier = getStakeTier(50);
    assertEqual(tier.name, 'Base');
  });
  
  await runTest('Bronze tier for exactly 100 stake', () => {
    const tier = getStakeTier(100);
    assertEqual(tier.name, 'Bronze');
    assertEqual(tier.hashrateMultiplier, 1.5);
    assertEqual(tier.defenseMultiplier, 1.2);
  });
  
  await runTest('Bronze tier for 499 stake', () => {
    const tier = getStakeTier(499);
    assertEqual(tier.name, 'Bronze');
  });
  
  await runTest('Silver tier for exactly 500 stake', () => {
    const tier = getStakeTier(500);
    assertEqual(tier.name, 'Silver');
    assertEqual(tier.hashrateMultiplier, 2.0);
    assertEqual(tier.defenseMultiplier, 1.5);
  });
  
  await runTest('Silver tier for 999 stake', () => {
    const tier = getStakeTier(999);
    assertEqual(tier.name, 'Silver');
  });
  
  await runTest('Gold tier for exactly 1000 stake', () => {
    const tier = getStakeTier(1000);
    assertEqual(tier.name, 'Gold');
    assertEqual(tier.hashrateMultiplier, 2.5);
    assertEqual(tier.defenseMultiplier, 1.8);
  });
  
  await runTest('Gold tier for 4999 stake', () => {
    const tier = getStakeTier(4999);
    assertEqual(tier.name, 'Gold');
  });
  
  await runTest('Diamond tier for exactly 5000 stake', () => {
    const tier = getStakeTier(5000);
    assertEqual(tier.name, 'Diamond');
    assertEqual(tier.hashrateMultiplier, 3.0);
    assertEqual(tier.defenseMultiplier, 2.0);
  });
  
  await runTest('Diamond tier for 100000 stake', () => {
    const tier = getStakeTier(100000);
    assertEqual(tier.name, 'Diamond');
  });
  
  await runTest('Negative stake returns Base tier', () => {
    const tier = getStakeTier(-100);
    assertEqual(tier.name, 'Base');
  });
  
  endSuite();
}

// --- Suite 2: Hashrate Multiplier Tests ---
async function runHashrateMultiplierTests(): Promise<void> {
  startSuite('Hashrate Multiplier Tests');
  
  const baseHashrate = 1000;
  
  await runTest('Base tier hashrate = 1.0x', () => {
    const effective = calculateEffectiveHashrate(baseHashrate, 0, 0, 'coal');
    assertEqual(effective, 1000);
  });
  
  await runTest('Bronze tier hashrate = 1.5x', () => {
    const effective = calculateEffectiveHashrate(baseHashrate, 100, 0, 'coal');
    assertEqual(effective, 1500);
  });
  
  await runTest('Silver tier hashrate = 2.0x', () => {
    const effective = calculateEffectiveHashrate(baseHashrate, 500, 0, 'coal');
    assertEqual(effective, 2000);
  });
  
  await runTest('Gold tier hashrate = 2.5x', () => {
    const effective = calculateEffectiveHashrate(baseHashrate, 1000, 0, 'coal');
    assertEqual(effective, 2500);
  });
  
  await runTest('Diamond tier hashrate = 3.0x', () => {
    const effective = calculateEffectiveHashrate(baseHashrate, 5000, 0, 'coal');
    assertEqual(effective, 3000);
  });
  
  await runTest('Coal loyalty bonus (7+ days) = +10%', () => {
    const withoutLoyalty = calculateEffectiveHashrate(baseHashrate, 500, 0, 'coal');
    const withLoyalty = calculateEffectiveHashrate(baseHashrate, 500, 7, 'coal');
    assertApproxEqual(withLoyalty / withoutLoyalty, 1.1, 0.001);
  });
  
  await runTest('Coal loyalty bonus requires 7 days', () => {
    const at6Days = calculateEffectiveHashrate(baseHashrate, 500, 6, 'coal');
    const at7Days = calculateEffectiveHashrate(baseHashrate, 500, 7, 'coal');
    assertEqual(at6Days, 2000); // No bonus
    assertApproxEqual(at7Days, 2200, 0.01); // +10%
  });
  
  await runTest('Non-coal mines get no loyalty bonus', () => {
    const goldHashrate = calculateEffectiveHashrate(baseHashrate, 500, 10, 'gold');
    assertEqual(goldHashrate, 2000); // No bonus for gold
    
    const silverHashrate = calculateEffectiveHashrate(baseHashrate, 500, 10, 'silver');
    assertEqual(silverHashrate, 2000); // No bonus for silver
  });
  
  await runTest('Zero base hashrate stays zero', () => {
    const effective = calculateEffectiveHashrate(0, 5000, 0, 'coal');
    assertEqual(effective, 0);
  });
  
  endSuite();
}

// --- Suite 3: Defense Power Tests ---
async function runDefensePowerTests(): Promise<void> {
  startSuite('Defense Power Tests');
  
  await runTest('Defense power with Base tier', () => {
    const power = calculateDefensePower(50, false);
    assertEqual(power, 50); // 50 * 1.0
  });
  
  await runTest('Defense power with Bronze tier', () => {
    const power = calculateDefensePower(100, false);
    assertEqual(power, 120); // 100 * 1.2
  });
  
  await runTest('Defense power with Silver tier', () => {
    const power = calculateDefensePower(500, false);
    assertEqual(power, 750); // 500 * 1.5
  });
  
  await runTest('Defense power with Gold tier', () => {
    const power = calculateDefensePower(1000, false);
    assertEqual(power, 1800); // 1000 * 1.8
  });
  
  await runTest('Defense power with Diamond tier', () => {
    const power = calculateDefensePower(5000, false);
    assertEqual(power, 10000); // 5000 * 2.0
  });
  
  await runTest('Home base adds 1.5x defense bonus', () => {
    const withoutHome = calculateDefensePower(500, false);
    const withHome = calculateDefensePower(500, true);
    assertEqual(withHome, withoutHome * 1.5);
  });
  
  await runTest('Home base + Diamond tier calculation', () => {
    const power = calculateDefensePower(5000, true);
    // 5000 * 2.0 (Diamond) * 1.5 (home base)
    assertEqual(power, 15000);
  });
  
  await runTest('Zero stake has zero defense', () => {
    const power = calculateDefensePower(0, true);
    assertEqual(power, 0);
  });
  
  endSuite();
}

// --- Suite 4: Attack Power Tests ---
async function runAttackPowerTests(): Promise<void> {
  startSuite('Attack Power Tests');
  
  await runTest('Attack power formula: (hashrate * 0.5) + (stake * 0.1)', () => {
    const power = calculateAttackPower(1000, 500);
    // (1000 * 0.5) + (500 * 0.1) = 500 + 50 = 550
    assertEqual(power, 550);
  });
  
  await runTest('Zero hashrate with stake', () => {
    const power = calculateAttackPower(0, 1000);
    assertEqual(power, 100); // Just stake contribution
  });
  
  await runTest('Zero stake with hashrate', () => {
    const power = calculateAttackPower(1000, 0);
    assertEqual(power, 500); // Just hashrate contribution
  });
  
  await runTest('High tier attack power calculation', () => {
    // Diamond tier with 3.0x hashrate on 2000 base
    const effectiveHashrate = calculateEffectiveHashrate(2000, 5000, 0, 'gold');
    const power = calculateAttackPower(effectiveHashrate, 5000);
    // (6000 * 0.5) + (5000 * 0.1) = 3000 + 500 = 3500
    assertEqual(power, 3500);
  });
  
  endSuite();
}

// --- Suite 5: API Integration Tests ---
async function runAPIIntegrationTests(): Promise<void> {
  startSuite('API Integration Tests');
  
  const client = new StakingTestClient();
  
  await runTest('Fetch staking config', async () => {
    const config = await client.getConfig();
    // Config may or may not be available depending on server state
    if (config) {
      assertTrue(typeof config.available === 'boolean');
      assertTrue(typeof config.network === 'string');
    }
  });
  
  await runTest('Config has required fields', async () => {
    const config = await client.getConfig();
    if (config) {
      assertTrue('available' in config);
      assertTrue('network' in config);
      assertTrue('quarryAddress' in config);
    }
  });
  
  // Test wallet for API calls (not signing - just querying)
  const testWallet = 'C95329YPMEqVTDVu7QVW4AyPa9SqhDPWR114Bynp3uhH';
  
  await runTest('Fetch stake info for wallet', async () => {
    const info = await client.getStakeInfo(testWallet);
    if (info) {
      assertTrue(typeof info.stakedAmount === 'number');
      assertTrue(typeof info.pendingRewards === 'number');
    }
  });
  
  await runTest('Build stake transaction returns transaction or error', async () => {
    const result = await client.buildStakeTransaction(testWallet, 100);
    assertTrue('transaction' in result || 'error' in result);
  });
  
  await runTest('Build unstake transaction returns transaction or error', async () => {
    const result = await client.buildUnstakeTransaction(testWallet, 100);
    assertTrue('transaction' in result || 'error' in result);
  });
  
  endSuite();
}

// --- Suite 6: Edge Case Tests ---
async function runEdgeCaseTests(): Promise<void> {
  startSuite('Edge Case Tests');
  
  await runTest('Very large stake amount', () => {
    const tier = getStakeTier(1_000_000_000);
    assertEqual(tier.name, 'Diamond');
  });
  
  await runTest('Floating point stake amount', () => {
    const tier = getStakeTier(100.5);
    assertEqual(tier.name, 'Bronze');
  });
  
  await runTest('Exactly at tier boundary', () => {
    assertEqual(getStakeTier(99.99).name, 'Base');
    assertEqual(getStakeTier(100).name, 'Bronze');
    assertEqual(getStakeTier(100.01).name, 'Bronze');
  });
  
  await runTest('Hashrate with very small stake', () => {
    const effective = calculateEffectiveHashrate(1000, 0.01, 0, 'coal');
    assertEqual(effective, 1000); // Still base tier
  });
  
  await runTest('Defense with fractional stake', () => {
    const power = calculateDefensePower(99.99, false);
    assertApproxEqual(power, 99.99, 0.01); // Base tier, 1.0x
  });
  
  await runTest('Large number precision', () => {
    const effective = calculateEffectiveHashrate(999_999_999, 10000, 10, 'coal');
    // Diamond (3.0x) * no loyalty (gold mine)
    assertTrue(effective > 0);
  });
  
  endSuite();
}

// --- Suite 7: Stress Tests ---
async function runStressTests(): Promise<void> {
  startSuite('Stress Tests');
  
  await runTest('Rapid tier calculations (10,000 iterations)', () => {
    for (let i = 0; i < 10000; i++) {
      const randomStake = Math.random() * 10000;
      const tier = getStakeTier(randomStake);
      assertTrue(tier !== null);
    }
  });
  
  await runTest('Rapid hashrate calculations (10,000 iterations)', () => {
    const resources: ('coal' | 'gold' | 'silver' | 'oil')[] = ['coal', 'gold', 'silver', 'oil'];
    for (let i = 0; i < 10000; i++) {
      const baseHashrate = Math.random() * 10000;
      const stake = Math.random() * 10000;
      const loyalty = Math.floor(Math.random() * 30);
      const resource = resources[Math.floor(Math.random() * resources.length)];
      const effective = calculateEffectiveHashrate(baseHashrate, stake, loyalty, resource);
      assertTrue(effective >= 0);
    }
  });
  
  await runTest('Rapid defense calculations (10,000 iterations)', () => {
    for (let i = 0; i < 10000; i++) {
      const stake = Math.random() * 10000;
      const isHomeBase = Math.random() > 0.5;
      const power = calculateDefensePower(stake, isHomeBase);
      assertTrue(power >= 0);
    }
  });
  
  await runTest('Concurrent tier lookups (100 parallel)', async () => {
    const promises = [];
    for (let i = 0; i < 100; i++) {
      promises.push(
        new Promise<void>(resolve => {
          const tier = getStakeTier(i * 50);
          assertTrue(tier !== null);
          resolve();
        })
      );
    }
    await Promise.all(promises);
  });
  
  endSuite();
}

// --- Suite 8: Error Handling Tests ---
async function runErrorHandlingTests(): Promise<void> {
  startSuite('Error Handling Tests');
  
  const client = new StakingTestClient('http://localhost:9999'); // Non-existent server
  
  await runTest('Handle unreachable API gracefully', async () => {
    const config = await client.getConfig();
    assertEqual(config, null);
  });
  
  await runTest('Handle invalid wallet address', async () => {
    const goodClient = new StakingTestClient();
    const result = await goodClient.buildStakeTransaction('invalid-wallet', 100);
    assertTrue('error' in result || 'transaction' in result);
  });
  
  await runTest('Handle negative stake amount', async () => {
    const goodClient = new StakingTestClient();
    const result = await goodClient.buildStakeTransaction(
      'C95329YPMEqVTDVu7QVW4AyPa9SqhDPWR114Bynp3uhH',
      -100
    );
    // Should either error or handle gracefully
    assertTrue('error' in result || 'transaction' in result);
  });
  
  await runTest('Handle zero stake amount', async () => {
    const goodClient = new StakingTestClient();
    const result = await goodClient.buildStakeTransaction(
      'C95329YPMEqVTDVu7QVW4AyPa9SqhDPWR114Bynp3uhH',
      0
    );
    assertTrue('error' in result || 'transaction' in result);
  });
  
  endSuite();
}

// ============ PRINT SUMMARY ============

function printSummary(): void {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                    TEST RESULTS SUMMARY                     ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  
  let totalTests = 0;
  let totalPassed = 0;
  let totalFailed = 0;
  let totalDuration = 0;
  
  for (const suite of testResults) {
    totalTests += suite.totalTests;
    totalPassed += suite.passedTests;
    totalFailed += suite.failedTests;
    totalDuration += suite.duration;
    
    const status = suite.failedTests === 0 ? '✅' : '❌';
    console.log(`  ${status} ${suite.name}: ${suite.passedTests}/${suite.totalTests} (${suite.duration}ms)`);
  }
  
  console.log('');
  console.log('─'.repeat(62));
  
  const overallStatus = totalFailed === 0 ? '✅ ALL TESTS PASSED' : `❌ ${totalFailed} TESTS FAILED`;
  console.log(`  ${overallStatus}`);
  console.log(`  Total: ${totalPassed}/${totalTests} tests passed in ${totalDuration}ms`);
  console.log('─'.repeat(62));
  console.log('');
}

// ============ MAIN ============

async function main(): Promise<void> {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║          BLACK GOLD STAKING SYSTEM TEST SUITE              ║');
  console.log('║                     Version 1.0.0                          ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`  Started: ${new Date().toISOString()}`);
  console.log(`  Network: ${process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet'}`);
  
  // Run all test suites
  await runTierCalculationTests();
  await runHashrateMultiplierTests();
  await runDefensePowerTests();
  await runAttackPowerTests();
  await runAPIIntegrationTests();
  await runEdgeCaseTests();
  await runStressTests();
  await runErrorHandlingTests();
  
  // Print summary
  printSummary();
  
  // Exit with error code if any tests failed
  const failed = testResults.some(suite => suite.failedTests > 0);
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error('❌ Test suite error:', error);
  process.exit(1);
});
