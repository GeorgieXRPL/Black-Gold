/**
 * @fileoverview Mine definitions for Black Gold v2
 * Contains all 20+ mine locations with coordinates and resource types
 */

/** Resource types available in the game */
export type ResourceType = 'coal' | 'gold' | 'oil' | 'silver';

/** Mine definition with location and properties */
export interface MineDefinition {
  /** Unique mine identifier */
  id: string;
  /** Display name */
  name: string;
  /** Resource type */
  resource: ResourceType;
  /** Country code (ISO 3166-1 alpha-2) */
  country: string;
  /** Country name for display */
  countryName: string;
  /** Latitude for globe positioning */
  lat: number;
  /** Longitude for globe positioning */
  lng: number;
  /** Base discovery time in milliseconds */
  baseDiscoveryTimeMs: number;
  /** Base reward multiplier */
  baseRewardMultiplier: number;
  /** Description for UI */
  description: string;
}

/** Resource-specific mechanics configuration */
export interface ResourceMechanics {
  /** Special ability name */
  abilityName: string;
  /** Ability description */
  abilityDescription: string;
  /** Discovery time in ms (formerly barrel time) */
  discoveryTimeMs: number;
  /** Reward style description */
  rewardStyle: string;
  /** Resource-specific discovery name */
  discoveryName: string;
  /** Discovery verb */
  discoveryVerb: string;
  /** Discovery emoji */
  discoveryEmoji: string;
}

/** Resource mechanics by type */
export const RESOURCE_MECHANICS: Record<ResourceType, ResourceMechanics> = {
  coal: {
    abilityName: 'Steady Burn',
    abilityDescription: 'No raid immunity, but +10% loyalty bonus after 7 days at same mine',
    discoveryTimeMs: 5 * 60 * 1000, // 5 minutes
    rewardStyle: 'Small, consistent rewards',
    discoveryName: 'Seam',
    discoveryVerb: 'struck',
    discoveryEmoji: '⛏️',
  },
  gold: {
    abilityName: 'Gold Rush',
    abilityDescription: 'Random 5x jackpot chance per discovery, attracts raiders',
    discoveryTimeMs: 20 * 60 * 1000, // 20 minutes
    rewardStyle: 'Large, jackpot-style rewards',
    discoveryName: 'Nugget',
    discoveryVerb: 'found',
    discoveryEmoji: '🥇',
  },
  oil: {
    abilityName: 'Syndicate',
    abilityDescription: 'Rewards multiply with miner count (up to 3x at 50+ miners)',
    discoveryTimeMs: 10 * 60 * 1000, // 10 minutes
    rewardStyle: 'Scales with group size',
    discoveryName: 'Gusher',
    discoveryVerb: 'hit',
    discoveryEmoji: '🛢️',
  },
  silver: {
    abilityName: 'Speculation',
    abilityDescription: 'High variance rewards (0.5x - 2x random), extra stake rewards during silver surges',
    discoveryTimeMs: 8 * 60 * 1000, // 8 minutes
    rewardStyle: 'Volatile rewards',
    discoveryName: 'Lode',
    discoveryVerb: 'discovered',
    discoveryEmoji: '🥈',
  },
};

/** All mine definitions */
export const MINES: MineDefinition[] = [
  // ============ COAL MINES (5) ============
  {
    id: 'coal-appalachian',
    name: 'Appalachian Basin',
    resource: 'coal',
    country: 'US',
    countryName: 'United States',
    lat: 38.5,
    lng: -82.5,
    baseDiscoveryTimeMs: RESOURCE_MECHANICS.coal.discoveryTimeMs,
    baseRewardMultiplier: 1.0,
    description: 'Historic coal mining region spanning multiple US states',
  },
  {
    id: 'coal-shanxi',
    name: 'Shanxi Province',
    resource: 'coal',
    country: 'CN',
    countryName: 'China',
    lat: 37.5,
    lng: 112.5,
    baseDiscoveryTimeMs: RESOURCE_MECHANICS.coal.discoveryTimeMs,
    baseRewardMultiplier: 1.1,
    description: "China's largest coal producing region",
  },
  {
    id: 'coal-hunter',
    name: 'Hunter Valley',
    resource: 'coal',
    country: 'AU',
    countryName: 'Australia',
    lat: -32.5,
    lng: 151.0,
    baseDiscoveryTimeMs: RESOURCE_MECHANICS.coal.discoveryTimeMs,
    baseRewardMultiplier: 1.0,
    description: "Australia's premier coal mining region",
  },
  {
    id: 'coal-silesia',
    name: 'Silesia',
    resource: 'coal',
    country: 'PL',
    countryName: 'Poland',
    lat: 50.3,
    lng: 19.0,
    baseDiscoveryTimeMs: RESOURCE_MECHANICS.coal.discoveryTimeMs,
    baseRewardMultiplier: 0.95,
    description: 'Historic European coal mining heartland',
  },
  {
    id: 'coal-kuzbass',
    name: 'Kuzbass',
    resource: 'coal',
    country: 'RU',
    countryName: 'Russia',
    lat: 54.0,
    lng: 87.0,
    baseDiscoveryTimeMs: RESOURCE_MECHANICS.coal.discoveryTimeMs,
    baseRewardMultiplier: 1.05,
    description: "Russia's primary coal mining basin",
  },

  // ============ GOLD MINES (5) ============
  {
    id: 'gold-witwatersrand',
    name: 'Witwatersrand',
    resource: 'gold',
    country: 'ZA',
    countryName: 'South Africa',
    lat: -26.2,
    lng: 28.0,
    baseDiscoveryTimeMs: RESOURCE_MECHANICS.gold.discoveryTimeMs,
    baseRewardMultiplier: 2.0,
    description: 'Legendary gold mining region, once produced 40% of world gold',
  },
  {
    id: 'gold-carlin',
    name: 'Carlin Trend',
    resource: 'gold',
    country: 'US',
    countryName: 'United States',
    lat: 40.7,
    lng: -116.2,
    baseDiscoveryTimeMs: RESOURCE_MECHANICS.gold.discoveryTimeMs,
    baseRewardMultiplier: 1.8,
    description: "Nevada's richest gold deposit",
  },
  {
    id: 'gold-superpit',
    name: 'Super Pit',
    resource: 'gold',
    country: 'AU',
    countryName: 'Australia',
    lat: -30.8,
    lng: 121.5,
    baseDiscoveryTimeMs: RESOURCE_MECHANICS.gold.discoveryTimeMs,
    baseRewardMultiplier: 1.9,
    description: "Australia's largest open-pit gold mine in Kalgoorlie",
  },
  {
    id: 'gold-grasberg',
    name: 'Grasberg',
    resource: 'gold',
    country: 'ID',
    countryName: 'Indonesia',
    lat: -4.1,
    lng: 137.1,
    baseDiscoveryTimeMs: RESOURCE_MECHANICS.gold.discoveryTimeMs,
    baseRewardMultiplier: 2.2,
    description: "World's largest gold mine in Papua",
  },
  {
    id: 'gold-muruntau',
    name: 'Muruntau',
    resource: 'gold',
    country: 'UZ',
    countryName: 'Uzbekistan',
    lat: 41.5,
    lng: 64.6,
    baseDiscoveryTimeMs: RESOURCE_MECHANICS.gold.discoveryTimeMs,
    baseRewardMultiplier: 2.1,
    description: 'One of the largest gold deposits in the world',
  },

  // ============ OIL FIELDS (5) ============
  {
    id: 'oil-ghawar',
    name: 'Ghawar Field',
    resource: 'oil',
    country: 'SA',
    countryName: 'Saudi Arabia',
    lat: 25.4,
    lng: 49.6,
    baseDiscoveryTimeMs: RESOURCE_MECHANICS.oil.discoveryTimeMs,
    baseRewardMultiplier: 1.5,
    description: "World's largest conventional oil field",
  },
  {
    id: 'oil-permian',
    name: 'Permian Basin',
    resource: 'oil',
    country: 'US',
    countryName: 'United States',
    lat: 31.8,
    lng: -102.4,
    baseDiscoveryTimeMs: RESOURCE_MECHANICS.oil.discoveryTimeMs,
    baseRewardMultiplier: 1.4,
    description: "America's most productive oil region in Texas",
  },
  {
    id: 'oil-orinoco',
    name: 'Orinoco Belt',
    resource: 'oil',
    country: 'VE',
    countryName: 'Venezuela',
    lat: 8.5,
    lng: -64.0,
    baseDiscoveryTimeMs: RESOURCE_MECHANICS.oil.discoveryTimeMs,
    baseRewardMultiplier: 1.6,
    description: "World's largest oil deposit, heavy crude reserves",
  },
  {
    id: 'oil-campos',
    name: 'Campos Basin',
    resource: 'oil',
    country: 'BR',
    countryName: 'Brazil',
    lat: -22.4,
    lng: -40.0,
    baseDiscoveryTimeMs: RESOURCE_MECHANICS.oil.discoveryTimeMs,
    baseRewardMultiplier: 1.45,
    description: "Brazil's offshore oil powerhouse",
  },
  {
    id: 'oil-rumaila',
    name: 'Rumaila',
    resource: 'oil',
    country: 'IQ',
    countryName: 'Iraq',
    lat: 30.5,
    lng: 47.3,
    baseDiscoveryTimeMs: RESOURCE_MECHANICS.oil.discoveryTimeMs,
    baseRewardMultiplier: 1.55,
    description: "Iraq's largest oil field",
  },

  // ============ SILVER MINES (5) ============
  {
    id: 'silver-potosi',
    name: 'Potosí',
    resource: 'silver',
    country: 'BO',
    countryName: 'Bolivia',
    lat: -19.6,
    lng: -65.8,
    baseDiscoveryTimeMs: RESOURCE_MECHANICS.silver.discoveryTimeMs,
    baseRewardMultiplier: 1.3,
    description: 'Historic Cerro Rico, once the richest silver deposit',
  },
  {
    id: 'silver-guanajuato',
    name: 'Guanajuato',
    resource: 'silver',
    country: 'MX',
    countryName: 'Mexico',
    lat: 21.0,
    lng: -101.3,
    baseDiscoveryTimeMs: RESOURCE_MECHANICS.silver.discoveryTimeMs,
    baseRewardMultiplier: 1.25,
    description: "Mexico's silver heartland",
  },
  {
    id: 'silver-coeurdalene',
    name: "Coeur d'Alene",
    resource: 'silver',
    country: 'US',
    countryName: 'United States',
    lat: 47.7,
    lng: -116.8,
    baseDiscoveryTimeMs: RESOURCE_MECHANICS.silver.discoveryTimeMs,
    baseRewardMultiplier: 1.2,
    description: 'Idaho silver valley',
  },
  {
    id: 'silver-cannington',
    name: 'Cannington',
    resource: 'silver',
    country: 'AU',
    countryName: 'Australia',
    lat: -21.9,
    lng: 140.9,
    baseDiscoveryTimeMs: RESOURCE_MECHANICS.silver.discoveryTimeMs,
    baseRewardMultiplier: 1.35,
    description: "World's largest silver mine by reserves",
  },
  {
    id: 'silver-dukat',
    name: 'Dukat',
    resource: 'silver',
    country: 'RU',
    countryName: 'Russia',
    lat: 62.5,
    lng: 155.0,
    baseDiscoveryTimeMs: RESOURCE_MECHANICS.silver.discoveryTimeMs,
    baseRewardMultiplier: 1.28,
    description: "Russia's largest silver deposit in the Far East",
  },
];

/** Get all mines of a specific resource type */
export function getMinesByResource(resource: ResourceType): MineDefinition[] {
  return MINES.filter((mine) => mine.resource === resource);
}

/** Get a mine by its ID */
export function getMineById(id: string): MineDefinition | undefined {
  return MINES.find((mine) => mine.id === id);
}

/** Get resource mechanics by type */
export function getResourceMechanics(resource: ResourceType): ResourceMechanics {
  return RESOURCE_MECHANICS[resource];
}

/** Resource colors for UI theming */
export const RESOURCE_COLORS: Record<ResourceType, { primary: string; secondary: string; glow: string }> = {
  coal: {
    primary: '#1a1a1a',
    secondary: '#4a4a4a',
    glow: '#ff6b35',
  },
  gold: {
    primary: '#ffd700',
    secondary: '#ffec8b',
    glow: '#fff59d',
  },
  oil: {
    primary: '#1a1a2e',
    secondary: '#16213e',
    glow: '#4a69bd',
  },
  silver: {
    primary: '#c0c0c0',
    secondary: '#e8e8e8',
    glow: '#f0f0f0',
  },
};
