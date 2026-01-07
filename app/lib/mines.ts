/**
 * @fileoverview Client-side mine utilities and types
 */

/** Resource types */
export type ResourceType = 'coal' | 'gold' | 'oil' | 'silver';

/** Mine data for client display */
export interface Mine {
  id: string;
  name: string;
  resource: ResourceType;
  country: string;
  countryName: string;
  lat: number;
  lng: number;
  description: string;
}

/** Mine statistics from server */
export interface MineStats {
  mineId: string;
  minerCount: number;
  hashrate: number;
  totalStake: number;
  discoveriesFound: number;
  difficulty: number;
  lastDiscoveryTime: string | null;
  hasDefenseBuff: boolean;
  hasAttackDebuff: boolean;
  activeRaidCount: number;
  /** Vault balance for hourly distribution */
  vaultBalance: number;
}

/** Resource mechanics for display */
export interface ResourceMechanicsInfo {
  abilityName: string;
  abilityDescription: string;
  discoveryTimeMs: number;
  rewardStyle: string;
  discoveryName: string;
  discoveryVerb: string;
  discoveryEmoji: string;
}

/** Resource mechanics */
export const RESOURCE_MECHANICS: Record<ResourceType, ResourceMechanicsInfo> = {
  coal: {
    abilityName: 'Steady Burn',
    abilityDescription: '+10% loyalty bonus after 7 days',
    discoveryTimeMs: 5 * 60 * 1000,
    rewardStyle: 'Small, consistent',
    discoveryName: 'Seam',
    discoveryVerb: 'struck',
    discoveryEmoji: '⛏️',
  },
  gold: {
    abilityName: 'Gold Rush',
    abilityDescription: '5% chance of 5x jackpot',
    discoveryTimeMs: 20 * 60 * 1000,
    rewardStyle: 'Large, jackpot',
    discoveryName: 'Nugget',
    discoveryVerb: 'found',
    discoveryEmoji: '🥇',
  },
  oil: {
    abilityName: 'Syndicate',
    abilityDescription: 'Up to 3x rewards at 50+ miners',
    discoveryTimeMs: 10 * 60 * 1000,
    rewardStyle: 'Group scaling',
    discoveryName: 'Gusher',
    discoveryVerb: 'hit',
    discoveryEmoji: '🛢️',
  },
  silver: {
    abilityName: 'Speculation',
    abilityDescription: '0.5x - 2x random multiplier',
    discoveryTimeMs: 8 * 60 * 1000,
    rewardStyle: 'Volatile',
    discoveryName: 'Lode',
    discoveryVerb: 'discovered',
    discoveryEmoji: '🥈',
  },
};

/** All mines */
export const MINES: Mine[] = [
  // Coal mines
  { id: 'coal-appalachian', name: 'Appalachian Basin', resource: 'coal', country: 'US', countryName: 'United States', lat: 38.5, lng: -82.5, description: 'Historic coal mining region' },
  { id: 'coal-shanxi', name: 'Shanxi Province', resource: 'coal', country: 'CN', countryName: 'China', lat: 37.5, lng: 112.5, description: "China's largest coal region" },
  { id: 'coal-hunter', name: 'Hunter Valley', resource: 'coal', country: 'AU', countryName: 'Australia', lat: -32.5, lng: 151.0, description: "Australia's premier coal region" },
  { id: 'coal-silesia', name: 'Silesia', resource: 'coal', country: 'PL', countryName: 'Poland', lat: 50.3, lng: 19.0, description: 'European coal heartland' },
  { id: 'coal-kuzbass', name: 'Kuzbass', resource: 'coal', country: 'RU', countryName: 'Russia', lat: 54.0, lng: 87.0, description: "Russia's primary coal basin" },
  
  // Gold mines
  { id: 'gold-witwatersrand', name: 'Witwatersrand', resource: 'gold', country: 'ZA', countryName: 'South Africa', lat: -26.2, lng: 28.0, description: 'Legendary gold region' },
  { id: 'gold-carlin', name: 'Carlin Trend', resource: 'gold', country: 'US', countryName: 'United States', lat: 40.7, lng: -116.2, description: "Nevada's richest deposit" },
  { id: 'gold-superpit', name: 'Super Pit', resource: 'gold', country: 'AU', countryName: 'Australia', lat: -30.8, lng: 121.5, description: "Australia's largest gold mine" },
  { id: 'gold-grasberg', name: 'Grasberg', resource: 'gold', country: 'ID', countryName: 'Indonesia', lat: -4.1, lng: 137.1, description: "World's largest gold mine" },
  { id: 'gold-muruntau', name: 'Muruntau', resource: 'gold', country: 'UZ', countryName: 'Uzbekistan', lat: 41.5, lng: 64.6, description: 'Massive gold deposit' },
  
  // Oil fields
  { id: 'oil-ghawar', name: 'Ghawar Field', resource: 'oil', country: 'SA', countryName: 'Saudi Arabia', lat: 25.4, lng: 49.6, description: "World's largest oil field" },
  { id: 'oil-permian', name: 'Permian Basin', resource: 'oil', country: 'US', countryName: 'United States', lat: 31.8, lng: -102.4, description: "America's most productive" },
  { id: 'oil-orinoco', name: 'Orinoco Belt', resource: 'oil', country: 'VE', countryName: 'Venezuela', lat: 8.5, lng: -64.0, description: "World's largest oil deposit" },
  { id: 'oil-campos', name: 'Campos Basin', resource: 'oil', country: 'BR', countryName: 'Brazil', lat: -22.4, lng: -40.0, description: "Brazil's offshore powerhouse" },
  { id: 'oil-rumaila', name: 'Rumaila', resource: 'oil', country: 'IQ', countryName: 'Iraq', lat: 30.5, lng: 47.3, description: "Iraq's largest oil field" },
  
  // Silver mines
  { id: 'silver-potosi', name: 'Potosí', resource: 'silver', country: 'BO', countryName: 'Bolivia', lat: -19.6, lng: -65.8, description: 'Historic Cerro Rico' },
  { id: 'silver-guanajuato', name: 'Guanajuato', resource: 'silver', country: 'MX', countryName: 'Mexico', lat: 21.0, lng: -101.3, description: "Mexico's silver heartland" },
  { id: 'silver-coeurdalene', name: "Coeur d'Alene", resource: 'silver', country: 'US', countryName: 'United States', lat: 47.7, lng: -116.8, description: 'Idaho silver valley' },
  { id: 'silver-cannington', name: 'Cannington', resource: 'silver', country: 'AU', countryName: 'Australia', lat: -21.9, lng: 140.9, description: "World's largest silver mine" },
  { id: 'silver-dukat', name: 'Dukat', resource: 'silver', country: 'RU', countryName: 'Russia', lat: 62.5, lng: 155.0, description: "Russia's largest silver" },
];

/** Get mine by ID */
export function getMineById(id: string): Mine | undefined {
  return MINES.find(m => m.id === id);
}

/** Get mines by resource */
export function getMinesByResource(resource: ResourceType): Mine[] {
  return MINES.filter(m => m.resource === resource);
}

/** Resource colors */
export const RESOURCE_COLORS: Record<ResourceType, { primary: string; secondary: string; glow: string }> = {
  coal: { primary: '#1a1a1a', secondary: '#4a4a4a', glow: '#ff6b35' },
  gold: { primary: '#ffd700', secondary: '#ffec8b', glow: '#fff59d' },
  oil: { primary: '#1a1a2e', secondary: '#16213e', glow: '#4a69bd' },
  silver: { primary: '#c0c0c0', secondary: '#e8e8e8', glow: '#f0f0f0' },
};

/** Stake tier info */
export interface StakeTier {
  minStake: number;
  name: string;
  hashrateMultiplier: number;
}

export const STAKE_TIERS: StakeTier[] = [
  { minStake: 0, name: 'Base', hashrateMultiplier: 1.0 },
  { minStake: 100, name: 'Bronze', hashrateMultiplier: 1.5 },
  { minStake: 500, name: 'Silver', hashrateMultiplier: 2.0 },
  { minStake: 1000, name: 'Gold', hashrateMultiplier: 2.5 },
  { minStake: 5000, name: 'Diamond', hashrateMultiplier: 3.0 },
];

export function getStakeTier(amount: number): StakeTier {
  for (let i = STAKE_TIERS.length - 1; i >= 0; i--) {
    if (amount >= STAKE_TIERS[i].minStake) {
      return STAKE_TIERS[i];
    }
  }
  return STAKE_TIERS[0];
}

/** Format discovery time */
export function formatDiscoveryTime(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

/** Get discovery message for a resource */
export function getDiscoveryMessage(resource: ResourceType, mineName: string, number: number): string {
  const mechanics = RESOURCE_MECHANICS[resource];
  return `${mechanics.discoveryEmoji} ${resource.charAt(0).toUpperCase() + resource.slice(1)} ${mechanics.discoveryName} #${number} ${mechanics.discoveryVerb} at ${mineName}!`;
}

/** Format reward with dual system info */
export function formatDualReward(totalReward: number): { finder: number; vault: number } {
  return {
    finder: Math.floor(totalReward * 0.7),
    vault: Math.floor(totalReward * 0.3),
  };
}
