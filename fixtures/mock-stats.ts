/**
 * @fileoverview Mock statistics data for development and testing
 * Use ONLY in development mode with NEXT_PUBLIC_USE_MOCKS=true
 */

import { MINES, MineStats } from '../app/lib/mines';

/**
 * Default demo user state
 */
export const DEMO_USER = {
  walletAddress: 'Demo...Wallet',
  homeMineId: 'coal-appalachian',
  walletBalance: 10000,
  loyaltyDays: 3,
  stakes: new Map<string, number>([
    ['coal-appalachian', 250],
  ]),
};

/**
 * Generate random mine stats for all mines
 * @returns Map of mine ID to stats
 */
export function generateMockMineStats(): Map<string, MineStats> {
  const stats = new Map<string, MineStats>();
  const now = Date.now();

  MINES.forEach(mine => {
    stats.set(mine.id, {
      mineId: mine.id,
      minerCount: Math.floor(Math.random() * 50) + 5,
      hashrate: Math.floor(Math.random() * 500000) + 100000,
      totalStake: Math.floor(Math.random() * 100000) + 10000,
      discoveriesFound: Math.floor(Math.random() * 500) + 50,
      difficulty: Math.floor(Math.random() * 1000) + 100,
      lastDiscoveryTime: new Date(now - Math.random() * 600000).toISOString(),
      hasDefenseBuff: Math.random() > 0.8,
      hasAttackDebuff: Math.random() > 0.9,
      activeRaidCount: Math.random() > 0.85 ? 1 : 0,
      vaultBalance: Math.floor(Math.random() * 500) + 50,
    });
  });

  return stats;
}

/**
 * Generate network-wide statistics
 */
export function generateMockNetworkStats() {
  return {
    totalMiners: 847,
    totalHashrate: 125_000_000, // 125 MH/s
    totalDiscoveries: 12_453,
    activeMines: MINES.length,
    totalStaked: 2_500_000,
    activeRaids: 3,
    last24hDiscoveries: 156,
    last24hRewardsDistributed: 45_000,
  };
}

/**
 * Simulated hashrate fluctuation for demo mining
 */
export function simulateHashrate(baseHashrate: number = 150000): number {
  const variance = Math.random() * 20000 - 10000;
  return baseHashrate + variance;
}
