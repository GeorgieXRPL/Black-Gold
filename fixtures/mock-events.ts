/**
 * @fileoverview Mock event data for development and testing
 * Use ONLY in development mode with NEXT_PUBLIC_USE_MOCKS=true
 */

import { ResourceType } from '../app/lib/mines';

export interface RaidEvent {
  id: string;
  type: 'discovery_found' | 'raid_started' | 'raid_won' | 'raid_lost' | 'jackpot' | 'vault_payout' | 'spoils_distributed';
  sourceMine?: string;
  targetMine?: string;
  sourceResource?: ResourceType;
  targetResource?: ResourceType;
  winner?: string;
  discoveryName?: string;
  finderShare?: number;
  vaultShare?: number;
  spoilsAmount?: number;
  burnedAmount?: number;
  reward?: number;
  timestamp: Date;
}

/**
 * Generate mock raid events for demo purposes
 * @returns Array of mock raid events
 */
export function generateMockEvents(): RaidEvent[] {
  const now = Date.now();
  return [
    {
      id: '1',
      type: 'discovery_found',
      targetMine: 'Appalachian Basin',
      targetResource: 'coal',
      winner: 'Abc1...xyz9',
      discoveryName: 'Seam',
      finderShare: 70,
      vaultShare: 30,
      timestamp: new Date(now - 120000),
    },
    {
      id: '2',
      type: 'raid_started',
      sourceMine: 'Witwatersrand',
      targetMine: 'Grasberg',
      sourceResource: 'gold',
      targetResource: 'gold',
      timestamp: new Date(now - 300000),
    },
    {
      id: '3',
      type: 'raid_lost',
      sourceMine: 'Permian Basin',
      targetMine: 'Ghawar Field',
      sourceResource: 'oil',
      targetResource: 'oil',
      spoilsAmount: 45,
      burnedAmount: 405,
      timestamp: new Date(now - 600000),
    },
    {
      id: '4',
      type: 'jackpot',
      targetMine: 'Super Pit',
      targetResource: 'gold',
      timestamp: new Date(now - 900000),
    },
    {
      id: '5',
      type: 'vault_payout',
      targetMine: 'Appalachian Basin',
      targetResource: 'coal',
      reward: 150,
      timestamp: new Date(now - 1200000),
    },
    {
      id: '6',
      type: 'raid_won',
      sourceMine: 'Kuzbass',
      targetMine: 'Hunter Valley',
      sourceResource: 'coal',
      targetResource: 'coal',
      spoilsAmount: 120,
      timestamp: new Date(now - 1500000),
    },
    {
      id: '7',
      type: 'spoils_distributed',
      sourceMine: 'Kuzbass',
      targetMine: 'Hunter Valley',
      sourceResource: 'coal',
      targetResource: 'coal',
      spoilsAmount: 85,
      burnedAmount: 765,
      timestamp: new Date(now - 1800000),
    },
  ];
}

export const MOCK_EVENTS = generateMockEvents();
