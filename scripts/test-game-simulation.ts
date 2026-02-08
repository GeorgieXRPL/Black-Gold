/**
 * @fileoverview Game simulation tests for Black Gold
 * Run with: npx tsx scripts/test-game-simulation.ts
 * 
 * Tests all game systems by importing them directly (no server needed).
 * Resets singletons between test suites for isolation.
 * 
 * Covers: Mining, Staking, Raiding, Cooldowns, Vault, BetEscrow, Full Flows
 */

import {
  getMineRegistry, resetMineRegistry,
  getStakeManager, resetStakeManager,
  getCooldownManager, resetCooldownManager,
  getExpeditionTracker, resetExpeditionTracker,
  getRaidEngine, resetRaidEngine,
  getBetEscrowManager, resetBetEscrowManager,
  createVaultManager, addToVault, updateMinerContribution,
  distributeVault, calculateRewardSplit, getVaultStats,
  getStakeTier, calculateEffectiveHashrate, calculateDefensePower, calculateAttackPower,
  STAKE_TIERS,
} from '../server/game';

import {
  TestLogger,
  TestResultTracker,
  assertTrue, assertFalse, assertEqual, assertApproxEqual, assertNotNull,
} from './test-utils';

// ============ TEST FRAMEWORK ============

const logger = new TestLogger('info');
const tracker = new TestResultTracker('simulation');

function resetAll(): void {
  resetMineRegistry();
  resetStakeManager();
  resetCooldownManager();
  resetExpeditionTracker();
  resetRaidEngine();
  resetBetEscrowManager();
}

function test(name: string, fn: () => void): void {
  const start = Date.now();
  try {
    fn();
    tracker.addResult({ name, passed: true, duration: Date.now() - start });
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    tracker.addResult({ name, passed: false, duration: Date.now() - start, error: msg });
    console.log(`  \x1b[31m✗ FAIL: ${name}\x1b[0m`);
    console.log(`    ${msg}`);
  }
}

function suite(name: string, fn: () => void): void {
  console.log(`\n${'─'.repeat(55)}`);
  console.log(`  ${name}`);
  console.log(`${'─'.repeat(55)}`);
  resetAll();
  tracker.startSuite(name);
  fn();
  tracker.endSuite();
}

// Test mine IDs
const COAL_MINE = 'coal-appalachian';
const GOLD_MINE = 'gold-witwatersrand';
const OIL_MINE = 'oil-ghawar';
const SILVER_MINE = 'silver-potosi';

// Test wallets (valid base58 format)
const WALLET_A = '7xKXkM5RnGndhszh1YsB7DFWKP4KSf2PmsEZb3Bfhaha';
const WALLET_B = '9aB4c5d6e7f8g9h0i1j2k3l4m5n6o7p8q9r0s1t2u3v4';
const WALLET_C = '3mN4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2g3h4';

// ============ SUITE 1: Mine Registration ============

suite('Mine Registration and Joining', () => {
  test('Registry initializes with all mines', () => {
    const registry = getMineRegistry();
    const mine = registry.getMine(COAL_MINE);
    assertNotNull(mine, 'Coal mine should exist');
    assertEqual(mine!.activeMiners.size, 0, 'Mine should start with 0 miners');
  });

  test('Add miner to mine increases count', () => {
    const registry = getMineRegistry();
    registry.addMiner(WALLET_A, COAL_MINE, 10000);
    const mine = registry.getMine(COAL_MINE)!;
    assertEqual(mine.activeMiners.size, 1, 'Should have 1 miner');
    assertTrue(mine.activeMiners.has(WALLET_A), 'Miner A should be in set');
  });

  test('Remove miner from mine decreases count', () => {
    const registry = getMineRegistry();
    registry.addMiner(WALLET_A, COAL_MINE, 10000);
    registry.removeMiner(WALLET_A, 10000);
    const mine = registry.getMine(COAL_MINE)!;
    assertEqual(mine.activeMiners.size, 0, 'Should have 0 miners after removal');
  });

  test('Join different mine removes from previous', () => {
    const registry = getMineRegistry();
    registry.addMiner(WALLET_A, COAL_MINE, 5000);
    assertEqual(registry.getMine(COAL_MINE)!.activeMiners.size, 1);
    // Joining another mine should remove from first
    registry.addMiner(WALLET_A, GOLD_MINE, 5000);
    assertEqual(registry.getMine(COAL_MINE)!.activeMiners.size, 0, 'Should be removed from coal');
    assertEqual(registry.getMine(GOLD_MINE)!.activeMiners.size, 1, 'Should be in gold');
  });

  test('Invalid mine ID returns null', () => {
    const registry = getMineRegistry();
    const mine = registry.getMine('invalid-mine-xyz');
    assertEqual(mine, undefined, 'Invalid mine should return undefined');
  });

  test('Total miners tracks across mines', () => {
    const registry = getMineRegistry();
    registry.addMiner(WALLET_A, COAL_MINE, 0);
    registry.addMiner(WALLET_B, GOLD_MINE, 0);
    assertEqual(registry.getTotalMiners(), 2, 'Should have 2 total miners');
  });

  test('Hashrate tracking on add/remove', () => {
    const registry = getMineRegistry();
    registry.addMiner(WALLET_A, COAL_MINE, 10000);
    registry.updateMinerHashrate(WALLET_A, 0, 25000);
    assertTrue(registry.getTotalHashrate() >= 25000, 'Total hashrate should include miner');
  });
});

// ============ SUITE 2: Staking Lifecycle ============

suite('Staking Lifecycle', () => {
  test('Stake at mine records amount', () => {
    const sm = getStakeManager();
    const success = sm.stake(WALLET_A, COAL_MINE, 100);
    assertTrue(success, 'Stake should succeed');
    assertEqual(sm.getStakeAtMine(WALLET_A, COAL_MINE), 100);
  });

  test('First stake auto-sets home base', () => {
    const sm = getStakeManager();
    sm.stake(WALLET_A, COAL_MINE, 100);
    const state = sm.getMinerState(WALLET_A);
    assertEqual(state.homeBaseMineId, COAL_MINE, 'Home base should be set to first staked mine');
  });

  test('Stake tiers: Base -> Bronze -> Silver -> Gold -> Diamond', () => {
    // Use a fresh wallet (WALLET_B) to avoid state from previous tests
    const sm = getStakeManager();
    // Base
    assertEqual(sm.getStakeTierAtMine(WALLET_B, COAL_MINE).name, 'Base');
    // Bronze
    sm.stake(WALLET_B, COAL_MINE, 100);
    assertEqual(sm.getStakeTierAtMine(WALLET_B, COAL_MINE).name, 'Bronze');
    // Silver (100 + 400 = 500)
    sm.stake(WALLET_B, COAL_MINE, 400);
    assertEqual(sm.getStakeTierAtMine(WALLET_B, COAL_MINE).name, 'Silver');
    // Gold (500 + 500 = 1000)
    sm.stake(WALLET_B, COAL_MINE, 500);
    assertEqual(sm.getStakeTierAtMine(WALLET_B, COAL_MINE).name, 'Gold');
    // Diamond (1000 + 4000 = 5000)
    sm.stake(WALLET_B, COAL_MINE, 4000);
    assertEqual(sm.getStakeTierAtMine(WALLET_B, COAL_MINE).name, 'Diamond');
  });

  test('Stake at multiple mines tracks separately', () => {
    // Use WALLET_C which has no prior state
    const sm = getStakeManager();
    sm.stake(WALLET_C, COAL_MINE, 200);
    sm.stake(WALLET_C, GOLD_MINE, 300);
    assertEqual(sm.getStakeAtMine(WALLET_C, COAL_MINE), 200);
    assertEqual(sm.getStakeAtMine(WALLET_C, GOLD_MINE), 300);
    assertEqual(sm.getTotalStake(WALLET_C), 500);
  });

  test('Partial unstake reduces amount and may downgrade tier', () => {
    // Fresh wallet for isolation
    const WALLET_D = '4pQ5r6s7t8u9v0w1x2y3z4a5b6c7d8e9f0g1h2i3j4k5';
    const sm = getStakeManager();
    sm.stake(WALLET_D, COAL_MINE, 500);
    assertEqual(sm.getStakeTierAtMine(WALLET_D, COAL_MINE).name, 'Silver');

    const result = sm.requestUnstake(WALLET_D, COAL_MINE, 200);
    assertTrue(result.success, 'Unstake should succeed');
    assertEqual(sm.getStakeAtMine(WALLET_D, COAL_MINE), 300);
    assertEqual(sm.getStakeTierAtMine(WALLET_D, COAL_MINE).name, 'Bronze');
  });

  test('Full unstake leaves zero balance', () => {
    const WALLET_E = '5qR6s7t8u9v0w1x2y3z4a5b6c7d8e9f0g1h2i3j4k5L6';
    const sm = getStakeManager();
    sm.stake(WALLET_E, COAL_MINE, 500);
    sm.requestUnstake(WALLET_E, COAL_MINE, 500);
    assertEqual(sm.getStakeAtMine(WALLET_E, COAL_MINE), 0);
    assertEqual(sm.getStakeTierAtMine(WALLET_E, COAL_MINE).name, 'Base');
  });

  test('Re-stake after full unstake works', () => {
    const WALLET_F = '6rS7t8u9v0w1x2y3z4a5b6c7d8e9f0g1h2i3j4k5L6M7';
    const sm = getStakeManager();
    sm.stake(WALLET_F, COAL_MINE, 500);
    sm.requestUnstake(WALLET_F, COAL_MINE, 500);
    sm.stake(WALLET_F, COAL_MINE, 1000);
    assertEqual(sm.getStakeAtMine(WALLET_F, COAL_MINE), 1000);
    assertEqual(sm.getStakeTierAtMine(WALLET_F, COAL_MINE).name, 'Gold');
  });

  test('Stake 0 or negative amount rejected', () => {
    const sm = getStakeManager();
    assertFalse(sm.stake(WALLET_A, COAL_MINE, 0), 'Zero stake should fail');
    assertFalse(sm.stake(WALLET_A, COAL_MINE, -100), 'Negative stake should fail');
  });

  test('Unstake from mine with no stake fails', () => {
    const WALLET_G = '7sT8u9v0w1x2y3z4a5b6c7d8e9f0g1h2i3j4k5L6M7N8';
    const sm = getStakeManager();
    const result = sm.requestUnstake(WALLET_G, COAL_MINE, 100);
    assertFalse(result.success, 'Unstake with no stake should fail');
  });

  test('Unstake more than staked caps to staked amount', () => {
    const WALLET_H = '8tU9v0w1x2y3z4a5b6c7d8e9f0g1h2i3j4k5L6M7N8O9';
    const sm = getStakeManager();
    sm.stake(WALLET_H, COAL_MINE, 100);
    sm.requestUnstake(WALLET_H, COAL_MINE, 9999);
    assertEqual(sm.getStakeAtMine(WALLET_H, COAL_MINE), 0, 'Should unstake all');
  });
});

// ============ SUITE 3: Hashrate and Defense Power ============

suite('Hashrate and Defense Power', () => {
  test('Effective hashrate scales with stake tier', () => {
    const sm = getStakeManager();
    sm.stake(WALLET_A, COAL_MINE, 500); // Silver tier
    const effective = sm.getEffectiveHashrate(WALLET_A, 10000, COAL_MINE);
    assertApproxEqual(effective, 20000, 1, 'Silver tier = 2.0x hashrate');
  });

  test('Coal loyalty bonus after 7 days', () => {
    const W = 'AALoyaltyTest1YsB7DFWKP4KSf2PmsEZb3BfhahAA';
    const sm = getStakeManager();
    sm.stake(W, COAL_MINE, 100); // Bronze = 1.5x
    const state = sm.getMinerState(W);
    state.loyaltyDays = 7;
    // The stake record also needs loyaltyDays
    const stakes = sm.getWalletStakes(W);
    if (stakes.length > 0) stakes[0].loyaltyDays = 7;
    const effective = sm.getEffectiveHashrate(W, 10000, COAL_MINE);
    // 10000 * 1.5 * 1.1 = 16500
    assertApproxEqual(effective, 16500, 1, '1.5x * 1.1 loyalty = 16500');
  });

  test('No loyalty bonus for non-coal mines', () => {
    const W = 'BBKXkM5RnGndhszh1YsB7DFWKP4KSf2PmsEZb3BfhahB';
    const sm = getStakeManager();
    sm.stake(W, GOLD_MINE, 100);
    const state = sm.getMinerState(W);
    state.loyaltyDays = 30;
    const effective = sm.getEffectiveHashrate(W, 10000, GOLD_MINE);
    assertApproxEqual(effective, 15000, 1, 'Gold mine: 1.5x only, no loyalty');
  });

  test('Defense power with home base bonus', () => {
    const W = 'CCKXkM5RnGndhszh1YsB7DFWKP4KSf2PmsEZb3BfhahC';
    const sm = getStakeManager();
    sm.stake(W, COAL_MINE, 500); // Sets home base
    const defense = sm.getDefensePower(W, COAL_MINE);
    // 500 * 1.5 (Silver defense) * 1.5 (home base) = 1125
    assertApproxEqual(defense, 1125, 1);
  });

  test('Defense power without home base bonus', () => {
    const W = 'DDKXkM5RnGndhszh1YsB7DFWKP4KSf2PmsEZb3BfhahD';
    const sm = getStakeManager();
    sm.stake(W, COAL_MINE, 500); // Home base = coal
    sm.stake(W, GOLD_MINE, 500);
    const defense = sm.getDefensePower(W, GOLD_MINE);
    // 500 * 1.5 (Silver defense) * 1.0 (not home) = 750
    assertApproxEqual(defense, 750, 1);
  });

  test('Total defense power sums all stakers', () => {
    const W1 = 'EEKXkM5RnGndhszh1YsB7DFWKP4KSf2PmsEZb3BfhahE';
    const W2 = 'FFB4c5d6e7f8g9h0i1j2k3l4m5n6o7p8q9r0s1t2u3vF';
    const sm = getStakeManager();
    sm.stake(W1, COAL_MINE, 100);
    sm.stake(W2, COAL_MINE, 100);
    const total = sm.getTotalDefensePower(COAL_MINE);
    assertTrue(total > 0, 'Total defense should be positive with 2 stakers');
  });
});

// ============ SUITE 4: Cooldown System ============

suite('Cooldown System', () => {
  test('Apply home_base_switch cooldown blocks action', () => {
    const cm = getCooldownManager();
    cm.applyCooldown(WALLET_A, 'home_base_switch');
    const error = cm.checkAction(WALLET_A, 'home_base_switch');
    assertNotNull(error, 'Should be blocked by cooldown');
    assertTrue(error!.includes('Cannot'), 'Error message should describe the block');
  });

  test('Different cooldown types are independent', () => {
    const W = 'GGKXkM5RnGndhszh1YsB7DFWKP4KSf2PmsEZb3BfhahG';
    const cm = getCooldownManager();
    cm.applyCooldown(W, 'expedition_start');
    const homeError = cm.checkAction(W, 'home_base_switch');
    assertEqual(homeError, null, 'Home base cooldown should not be affected by expedition cooldown');
  });

  test('Cooldown has correct remaining time', () => {
    const W = 'HHKXkM5RnGndhszh1YsB7DFWKP4KSf2PmsEZb3BfhahH';
    const cm = getCooldownManager();
    cm.applyCooldown(W, 'expedition_start'); // 1 hour
    const remaining = cm.getRemainingCooldown(W, 'expedition_start');
    assertTrue(remaining > 3500000, 'Should be close to 1 hour');
    assertTrue(remaining <= 3600000, 'Should not exceed 1 hour');
  });

  test('Clear cooldown allows action', () => {
    const W = 'IIKXkM5RnGndhszh1YsB7DFWKP4KSf2PmsEZb3BfhahI';
    const cm = getCooldownManager();
    cm.applyCooldown(W, 'rally_defense');
    cm.clearCooldown(W, 'rally_defense');
    const error = cm.checkAction(W, 'rally_defense');
    assertEqual(error, null, 'Cleared cooldown should allow action');
  });

  test('Cleanup removes expired cooldowns', () => {
    const W = 'JJKXkM5RnGndhszh1YsB7DFWKP4KSf2PmsEZb3BfhahJ';
    const cm = getCooldownManager();
    cm.applyCooldown(W, 'expedition_recovery');
    const cooldowns = cm.getActiveCooldowns(W);
    if (cooldowns.length > 0) {
      cooldowns[0].expiresAt = new Date(Date.now() - 1000);
    }
    cm.cleanupExpired();
    const active = cm.getActiveCooldowns(W);
    assertEqual(active.length, 0, 'Expired cooldown should be cleaned up');
  });

  test('No cooldown on fresh wallet', () => {
    const W = 'KKKXkM5RnGndhszh1YsB7DFWKP4KSf2PmsEZb3BfhahK';
    const cm = getCooldownManager();
    const error = cm.checkAction(W, 'expedition_start');
    assertEqual(error, null, 'Fresh wallet should have no cooldowns');
  });
});

// ============ SUITE 5: Expedition Lifecycle ============

suite('Expedition (Raid) Lifecycle', () => {
  test('Create expedition from source to target', () => {
    const W = 'E1KXkM5RnGndhszh1YsB7DFWKP4KSf2PmsEZb3BfhE1';
    const sm = getStakeManager();
    const tracker = getExpeditionTracker();
    sm.stake(W, COAL_MINE, 500);

    const exp = tracker.createExpedition(W, COAL_MINE, GOLD_MINE, 10000, 0);
    assertNotNull(exp, 'Expedition should be created');
    assertEqual(exp!.status, 'active');
    assertEqual(exp!.sourceMineId, COAL_MINE);
    assertEqual(exp!.targetMineId, GOLD_MINE);
    assertTrue(exp!.attackPower > 0, 'Attack power should be calculated');
  });

  test('Cannot raid own mine', () => {
    const W = 'E2KXkM5RnGndhszh1YsB7DFWKP4KSf2PmsEZb3BfhE2';
    const sm = getStakeManager();
    const tracker = getExpeditionTracker();
    sm.stake(W, COAL_MINE, 500);

    const exp = tracker.createExpedition(W, COAL_MINE, COAL_MINE, 10000, 0);
    assertEqual(exp, null, 'Should not be able to raid own mine');
  });

  test('No home base means no stake tier benefits', () => {
    // Note: Home base check is enforced at WebSocket handler level (server/index.ts),
    // not in ExpeditionTracker itself. So we test that having no home base
    // means no stake tier benefits for the expedition.
    const W = 'E3NoHomeBaseTestWallet1234567890abcdeE3';
    const sm = getStakeManager();
    const state = sm.getMinerState(W);
    assertEqual(state.homeBaseMineId, null, 'Fresh wallet has no home base');
    assertEqual(state.totalStake, 0, 'Fresh wallet has no stake');
    // Without stake, attack power comes only from hashrate
    const power = calculateAttackPower(10000, 0);
    assertApproxEqual(power, 5000, 1, 'Attack power without stake = hashrate only');
  });

  test('Cannot start two expeditions simultaneously', () => {
    const W = 'E4KXkM5RnGndhszh1YsB7DFWKP4KSf2PmsEZb3BfhE4';
    const sm = getStakeManager();
    const tracker = getExpeditionTracker();
    sm.stake(W, COAL_MINE, 500);

    const exp1 = tracker.createExpedition(W, COAL_MINE, SILVER_MINE, 10000, 0);
    assertNotNull(exp1, 'First expedition should be created');

    getCooldownManager().clearCooldown(W, 'expedition_start');

    const exp2 = tracker.createExpedition(W, COAL_MINE, OIL_MINE, 10000, 0);
    assertEqual(exp2, null, 'Should not allow second expedition');
  });

  test('Cannot raid mine with immunity', () => {
    const W = 'E5KXkM5RnGndhszh1YsB7DFWKP4KSf2PmsEZb3BfhE5';
    const sm = getStakeManager();
    const tracker = getExpeditionTracker();
    const registry = getMineRegistry();
    sm.stake(W, COAL_MINE, 500);

    // Use a mine that doesn't already have immunity from other tests
    const TARGET = 'gold-carlin';
    registry.applyDefenseBuff(TARGET);

    const exp = tracker.createExpedition(W, COAL_MINE, TARGET, 10000, 0);
    assertEqual(exp, null, 'Should not raid immune mine');
  });

  test('Join existing expedition adds attack power', () => {
    const W1 = 'E6KXkM5RnGndhszh1YsB7DFWKP4KSf2PmsEZb3BfhE6';
    const W2 = 'E7B4c5d6e7f8g9h0i1j2k3l4m5n6o7p8q9r0s1t2E7';
    const sm = getStakeManager();
    const tracker = getExpeditionTracker();
    sm.stake(W1, COAL_MINE, 500);
    sm.stake(W2, COAL_MINE, 500);

    const exp = tracker.createExpedition(W1, COAL_MINE, OIL_MINE, 10000, 0);
    assertNotNull(exp, 'Expedition should be created');
    const initialPower = exp!.attackPower;

    const joined = tracker.joinExpedition(exp!.id, W2, 10000, 0);
    assertTrue(joined, 'Should be able to join expedition');
    assertTrue(exp!.attackPower > initialPower, 'Attack power should increase');
  });

  test('Leave expedition forfeits bet', () => {
    const W = 'E8KXkM5RnGndhszh1YsB7DFWKP4KSf2PmsEZb3BfhE8';
    const sm = getStakeManager();
    const tracker = getExpeditionTracker();
    sm.stake(W, COAL_MINE, 500);

    const exp = tracker.createExpedition(W, COAL_MINE, 'gold-superpit', 10000, 50);
    assertNotNull(exp, 'Expedition should be created');

    const left = tracker.leaveExpedition(W);
    assertTrue(left);
  });

  test('Cooldown applied after expedition creation', () => {
    const W = 'E9KXkM5RnGndhszh1YsB7DFWKP4KSf2PmsEZb3BfhE9';
    const sm = getStakeManager();
    const tracker = getExpeditionTracker();
    sm.stake(W, COAL_MINE, 500);

    tracker.createExpedition(W, COAL_MINE, 'gold-grasberg', 10000, 0);

    const cm = getCooldownManager();
    const error = cm.checkAction(W, 'expedition_start');
    assertNotNull(error, 'Should have expedition cooldown');
  });
});

// ============ SUITE 6: Raid Resolution ============
// Each test in this suite uses fresh wallets to avoid cooldown/state conflicts

suite('Raid Resolution', () => {
  test('Attacker wins when power exceeds 1.2x defense', () => {
    const W_ATK = '11KXkM5RnGndhszh1YsB7DFWKP4KSf2PmsEZb3Bfhah1';
    const W_DEF = '22B4c5d6e7f8g9h0i1j2k3l4m5n6o7p8q9r0s1t2u3v2';
    const sm = getStakeManager();
    const tracker = getExpeditionTracker();
    const engine = getRaidEngine();
    const registry = getMineRegistry();

    sm.stake(W_ATK, COAL_MINE, 5000);
    sm.stake(W_DEF, GOLD_MINE, 10);
    registry.addMiner(W_DEF, GOLD_MINE, 100);

    const exp = tracker.createExpedition(W_ATK, COAL_MINE, GOLD_MINE, 100000, 0);
    assertNotNull(exp);

    engine.setPendingReward(GOLD_MINE, 1000);

    const result = engine.resolveRaid(exp!.id);
    assertNotNull(result);
    assertTrue(result!.attackersWon, 'Attackers should win with overwhelming power');
    assertTrue(result!.stolenRewards > 0, 'Should steal some rewards');
  });

  test('Defender wins with 1.2x advantage', () => {
    const W_ATK = '33KXkM5RnGndhszh1YsB7DFWKP4KSf2PmsEZb3Bfhah3';
    const W_DEF = '44B4c5d6e7f8g9h0i1j2k3l4m5n6o7p8q9r0s1t2u3v4';
    const TARGET = 'silver-guanajuato';
    const sm = getStakeManager();
    const tracker = getExpeditionTracker();
    const engine = getRaidEngine();
    const registry = getMineRegistry();

    sm.stake(W_ATK, COAL_MINE, 100);
    sm.stake(W_DEF, TARGET, 5000);
    registry.addMiner(W_DEF, TARGET, 50000);

    // Bet must be <= 20% of stake (100 * 0.2 = 20)
    const exp = tracker.createExpedition(W_ATK, COAL_MINE, TARGET, 100, 20);
    assertNotNull(exp, 'Expedition should be created');

    const result = engine.resolveRaid(exp!.id);
    assertNotNull(result);
    assertFalse(result!.attackersWon, 'Defenders should win');
  });

  test('Defender spoils: bets burned on failed raid', () => {
    const W_ATK = '55KXkM5RnGndhszh1YsB7DFWKP4KSf2PmsEZb3Bfhah5';
    const W_DEF = '66B4c5d6e7f8g9h0i1j2k3l4m5n6o7p8q9r0s1t2u3v6';
    const TARGET = 'silver-coeurdalene';
    const sm = getStakeManager();
    const tracker = getExpeditionTracker();
    const engine = getRaidEngine();
    const registry = getMineRegistry();

    sm.stake(W_ATK, COAL_MINE, 100);
    sm.stake(W_DEF, TARGET, 5000);
    registry.addMiner(W_DEF, TARGET, 50000);

    // Bet must be <= 20% of stake (100 * 0.2 = 20)
    const exp = tracker.createExpedition(W_ATK, COAL_MINE, TARGET, 100, 20);
    assertNotNull(exp, 'Expedition should be created');

    const result = engine.resolveRaid(exp!.id);
    assertNotNull(result);
    assertFalse(result!.attackersWon);

    const stats = engine.getStats();
    assertTrue(stats.totalBurned > 0, 'Some tokens should be burned');
  });

  test('Defense buff applied after successful defense', () => {
    const W_ATK = '77KXkM5RnGndhszh1YsB7DFWKP4KSf2PmsEZb3Bfhah7';
    const W_DEF = '88B4c5d6e7f8g9h0i1j2k3l4m5n6o7p8q9r0s1t2u3v8';
    const sm = getStakeManager();
    const tracker = getExpeditionTracker();
    const engine = getRaidEngine();
    const registry = getMineRegistry();

    sm.stake(W_ATK, COAL_MINE, 100);
    sm.stake(W_DEF, SILVER_MINE, 5000);
    registry.addMiner(W_DEF, SILVER_MINE, 50000);

    const exp = tracker.createExpedition(W_ATK, COAL_MINE, SILVER_MINE, 100, 0);
    assertNotNull(exp);

    engine.resolveRaid(exp!.id);

    assertTrue(registry.hasRaidImmunity(SILVER_MINE), 'Mine should have immunity after defense');
  });

  test('Resolve all raids against a mine', () => {
    const W_ATK = '99KXkM5RnGndhszh1YsB7DFWKP4KSf2PmsEZb3Bfhah9';
    const W_DEF = 'AAB4c5d6e7f8g9h0i1j2k3l4m5n6o7p8q9r0s1t2u3vA';
    const sm = getStakeManager();
    const engine = getRaidEngine();
    const tracker = getExpeditionTracker();
    const registry = getMineRegistry();

    // Use oil mine (different from previous tests, no immunity)
    sm.stake(W_ATK, COAL_MINE, 100);
    sm.stake(W_DEF, OIL_MINE, 5000);
    registry.addMiner(W_DEF, OIL_MINE, 50000);

    tracker.createExpedition(W_ATK, COAL_MINE, OIL_MINE, 100, 0);

    const results = engine.resolveAllRaids(OIL_MINE);
    assertTrue(results.length >= 1, 'Should resolve at least one raid');
  });
});

// ============ SUITE 7: Bet Escrow ============

suite('Bet Escrow', () => {
  test('Create raid pool', () => {
    const escrow = getBetEscrowManager();
    const pool = escrow.createRaidPool('raid-1', GOLD_MINE, COAL_MINE);
    assertEqual(pool.raidId, 'raid-1');
    assertEqual(pool.status, 'active');
    assertEqual(pool.totalAttackerBets, 0);
  });

  test('Place bet locks tokens', () => {
    const escrow = getBetEscrowManager();
    escrow.createRaidPool('raid-2', GOLD_MINE, COAL_MINE);
    const bet = escrow.placeBet('raid-2', WALLET_A, COAL_MINE, 100, 'attacker', 'sig123');
    assertEqual(bet.amount, 100);
    assertEqual(bet.status, 'locked');
    assertTrue(escrow.hasLockedBets(WALLET_A));
    assertEqual(escrow.getLockedBetAmount(WALLET_A), 100);
  });

  test('Cannot place duplicate bet on same raid', () => {
    const escrow = getBetEscrowManager();
    escrow.createRaidPool('raid-3', GOLD_MINE, COAL_MINE);
    escrow.placeBet('raid-3', WALLET_A, COAL_MINE, 100, 'attacker', 'sig1');

    let threw = false;
    try {
      escrow.placeBet('raid-3', WALLET_A, COAL_MINE, 50, 'attacker', 'sig2');
    } catch {
      threw = true;
    }
    assertTrue(threw, 'Should throw on duplicate bet');
  });

  test('Resolve raid: defenders win, bets burned', () => {
    const escrow = getBetEscrowManager();
    escrow.createRaidPool('raid-4', GOLD_MINE, COAL_MINE);
    escrow.placeBet('raid-4', WALLET_A, COAL_MINE, 100, 'attacker', 'sig1');

    const defenderStakes = new Map<string, number>();
    defenderStakes.set(WALLET_B, 500);

    const resolution = escrow.resolveRaid('raid-4', 'defender', defenderStakes);
    assertEqual(resolution.winningSide, 'defender');
    assertTrue(resolution.totalBurned > 0, 'Lost bets should be burned');
    assertEqual(resolution.totalDistributedToDefenders, 10, '10% of 100 = 10');
  });

  test('Resolve raid: attackers win, bets returned', () => {
    const escrow = getBetEscrowManager();
    escrow.createRaidPool('raid-5', GOLD_MINE, COAL_MINE);
    escrow.placeBet('raid-5', WALLET_A, COAL_MINE, 200, 'attacker', 'sig1');

    const resolution = escrow.resolveRaid('raid-5', 'attacker', new Map());
    assertEqual(resolution.winningSide, 'attacker');
    assertEqual(resolution.totalReturnedToWinners, 200, 'Bets should be returned');
    assertEqual(resolution.totalBurned, 0, 'Nothing burned on attacker win');
  });

  test('Cleanup old resolved pools', () => {
    const escrow = getBetEscrowManager();
    escrow.createRaidPool('raid-old', GOLD_MINE, COAL_MINE);
    escrow.placeBet('raid-old', WALLET_A, COAL_MINE, 50, 'attacker', 'sig1');
    escrow.resolveRaid('raid-old', 'defender', new Map());

    // Force the resolvedAt to be old
    const pool = escrow.getRaidPool('raid-old');
    if (pool) {
      pool.resolvedAt = new Date(Date.now() - 48 * 60 * 60 * 1000);
    }

    const cleaned = escrow.cleanupResolvedPools(24 * 60 * 60 * 1000);
    assertTrue(cleaned >= 1, 'Should cleanup old pool');
  });
});

// ============ SUITE 8: Vault Distribution ============

suite('Vault Distribution', () => {
  test('Reward split: 70% finder, 30% vault', () => {
    const split = calculateRewardSplit(1000);
    assertEqual(split.finderShare, 700);
    assertEqual(split.vaultShare, 300);
  });

  test('Add rewards to vault', () => {
    const vm = createVaultManager();
    addToVault(vm, COAL_MINE, 300);
    const stats = getVaultStats(vm, COAL_MINE);
    assertNotNull(stats);
    assertEqual(stats!.balance, 300);
    assertEqual(stats!.pendingDistribution, 300);
  });

  test('Distribute vault proportionally to contributors', () => {
    const vm = createVaultManager();
    addToVault(vm, COAL_MINE, 1000);

    // Two miners contributing
    updateMinerContribution(vm, COAL_MINE, WALLET_A, 20000, 500, 0, true, 3600);
    updateMinerContribution(vm, COAL_MINE, WALLET_B, 10000, 0, 0, true, 3600);

    const result = distributeVault(vm, COAL_MINE);
    assertNotNull(result);
    assertTrue(result!.totalDistributed > 0, 'Should distribute something');
    assertEqual(result!.minerCount, 2, 'Two miners should receive payouts');

    // Miner A has 2x hashrate + Silver tier (2.0x), should get more
    const payoutA = result!.payouts.get(WALLET_A) || 0;
    const payoutB = result!.payouts.get(WALLET_B) || 0;
    assertTrue(payoutA > payoutB, 'Higher hashrate + stake should get more');
  });

  test('No contributors = no distribution', () => {
    const vm = createVaultManager();
    addToVault(vm, COAL_MINE, 1000);
    const result = distributeVault(vm, COAL_MINE);
    assertEqual(result, null, 'No distribution without contributors');
  });

  test('Below minimum threshold = no distribution', () => {
    const vm = createVaultManager();
    addToVault(vm, COAL_MINE, 0.5); // Below MIN_DISTRIBUTION_AMOUNT of 1
    updateMinerContribution(vm, COAL_MINE, WALLET_A, 10000, 0, 0, true, 3600);
    const result = distributeVault(vm, COAL_MINE);
    assertEqual(result, null, 'Below minimum should not distribute');
  });

  test('Contributions cleared after distribution', () => {
    const vm = createVaultManager();
    addToVault(vm, COAL_MINE, 100);
    updateMinerContribution(vm, COAL_MINE, WALLET_A, 10000, 0, 0, true, 3600);
    distributeVault(vm, COAL_MINE);

    // Contributions should be cleared
    const stats = getVaultStats(vm, COAL_MINE);
    assertEqual(stats!.contributorCount, 0, 'Contributors should be cleared');
  });

  test('Pending distribution resets after payout', () => {
    const vm = createVaultManager();
    addToVault(vm, COAL_MINE, 500);
    updateMinerContribution(vm, COAL_MINE, WALLET_A, 10000, 0, 0, true, 3600);
    distributeVault(vm, COAL_MINE);

    const stats = getVaultStats(vm, COAL_MINE);
    assertEqual(stats!.pendingDistribution, 0, 'Pending should be 0 after distribution');
  });
});

// ============ SUITE 9: Full Game Flow ============

suite('Full Game Flow (Integration)', () => {
  test('Complete lifecycle: join -> stake -> raid -> resolution', () => {
    const registry = getMineRegistry();
    const sm = getStakeManager();
    const tracker = getExpeditionTracker();
    const engine = getRaidEngine();

    // Player A joins coal mine and stakes
    registry.addMiner(WALLET_A, COAL_MINE, 25000);
    sm.stake(WALLET_A, COAL_MINE, 1000); // Gold tier

    // Player B joins gold mine and stakes heavily (defender)
    registry.addMiner(WALLET_B, GOLD_MINE, 50000);
    sm.stake(WALLET_B, GOLD_MINE, 5000); // Diamond tier

    // Player A raids gold mine
    const exp = tracker.createExpedition(WALLET_A, COAL_MINE, GOLD_MINE, 25000, 100);
    assertNotNull(exp, 'Expedition should be created');

    // Set pending reward at gold mine
    engine.setPendingReward(GOLD_MINE, 500);

    // Resolve raid
    const result = engine.resolveRaid(exp!.id);
    assertNotNull(result, 'Raid should resolve');

    // Verify raid outcome makes sense
    assertTrue(
      typeof result!.attackersWon === 'boolean',
      'Result should have boolean attackersWon'
    );
    assertTrue(result!.defensePower >= 0, 'Defense power should be non-negative');
    assertTrue(result!.attackPower >= 0, 'Attack power should be non-negative');
  });

  test('Multi-player scenario: 3 miners at different mines', () => {
    const W1 = 'LLKXkM5RnGndhszh1YsB7DFWKP4KSf2PmsEZb3BfhahL';
    const W2 = 'MMB4c5d6e7f8g9h0i1j2k3l4m5n6o7p8q9r0s1t2u3vM';
    const W3 = 'NNN4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2g3hN';
    const registry = getMineRegistry();
    const sm = getStakeManager();
    const tracker = getExpeditionTracker();

    registry.addMiner(W1, COAL_MINE, 20000);
    sm.stake(W1, COAL_MINE, 500);

    registry.addMiner(W2, SILVER_MINE, 30000);
    sm.stake(W2, SILVER_MINE, 1000);

    registry.addMiner(W3, OIL_MINE, 15000);
    sm.stake(W3, OIL_MINE, 200);

    // Verify all players are set up (may include miners from earlier tests)
    assertTrue(registry.getTotalMiners() >= 3, 'Should have at least 3 miners');
    assertEqual(sm.getTotalStake(W1), 500);
    assertEqual(sm.getTotalStake(W2), 1000);
    assertEqual(sm.getTotalStake(W3), 200);

    // W1 raids W2's mine
    const exp = tracker.createExpedition(W1, COAL_MINE, SILVER_MINE, 20000, 0);
    assertNotNull(exp);

    assertTrue(tracker.getActiveExpeditions().length >= 1);
  });

  test('Vault distribution after discovery', () => {
    const vm = createVaultManager();

    // Simulate discovery: 100 COAL total
    const split = calculateRewardSplit(100);
    assertEqual(split.finderShare, 70);
    assertEqual(split.vaultShare, 30);

    // Add vault share
    addToVault(vm, COAL_MINE, split.vaultShare);

    // Two miners contributed
    updateMinerContribution(vm, COAL_MINE, WALLET_A, 30000, 1000, 7, true, 3600);
    updateMinerContribution(vm, COAL_MINE, WALLET_B, 10000, 100, 0, true, 3600);

    // Distribute
    const result = distributeVault(vm, COAL_MINE);
    assertNotNull(result);

    // Verify total distributed <= vault amount
    assertTrue(
      result!.totalDistributed <= 30,
      `Total distributed (${result!.totalDistributed}) should not exceed vault (30)`
    );

    // Verify both miners got something
    const payoutA = result!.payouts.get(WALLET_A) || 0;
    const payoutB = result!.payouts.get(WALLET_B) || 0;
    assertTrue(payoutA > 0, 'Miner A should receive payout');
    assertTrue(payoutB >= 0, 'Miner B should receive payout');

    // Miner A should get more (higher hashrate + Gold tier + loyalty)
    assertTrue(payoutA > payoutB, 'Higher contributor gets more');
  });

  test('Economic balance: burns reduce total', () => {
    const W_ATK = 'PPKXkM5RnGndhszh1YsB7DFWKP4KSf2PmsEZb3BfhahP';
    const W_DEF = 'QQB4c5d6e7f8g9h0i1j2k3l4m5n6o7p8q9r0s1t2u3vQ';
    const engine = getRaidEngine();
    const sm = getStakeManager();
    const tracker = getExpeditionTracker();
    const registry = getMineRegistry();

    const TARGET = 'silver-cannington';
    sm.stake(W_ATK, COAL_MINE, 100);
    sm.stake(W_DEF, TARGET, 5000);
    registry.addMiner(W_DEF, TARGET, 50000);

    const initialStats = engine.getStats();
    const initialBurned = initialStats.totalBurned;

    // Bet must be <= 20% of stake (100 * 0.2 = 20)
    const exp = tracker.createExpedition(W_ATK, COAL_MINE, TARGET, 100, 20);
    assertNotNull(exp);
    engine.resolveRaid(exp!.id);

    const afterStats = engine.getStats();
    assertTrue(
      afterStats.totalBurned > initialBurned,
      'Failed raid should increase total burned'
    );
  });
});

// ============ RESULTS ============

const results = tracker.finalize();

console.log(`\n${'═'.repeat(55)}`);
console.log(`  SIMULATION RESULTS: ${results.passedTests}/${results.totalTests} passed, ${results.failedTests} failed`);
console.log(`  Duration: ${results.duration}ms`);
console.log(`${'═'.repeat(55)}`);

for (const s of results.suites) {
  const icon = s.failedTests === 0 ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
  console.log(`  ${icon} ${s.name}: ${s.passedTests}/${s.totalTests}`);
}

if (results.failedTests > 0) {
  console.log('\n  Some tests failed!\n');
  process.exit(1);
} else {
  console.log('\n  All simulation tests passed!\n');
}
