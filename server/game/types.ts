/**
 * @fileoverview Game types for Black Gold v2 Interactive Mining Globe
 * Types for staking, raiding, expeditions, and multi-mine support
 */

import { ResourceType, MineDefinition } from '../../config/mines';

// ============ STAKING TYPES ============

/** Stake tier thresholds and multipliers */
export interface StakeTier {
  /** Minimum stake amount to reach this tier */
  minStake: number;
  /** Tier name for display */
  name: string;
  /** Hashrate multiplier */
  hashrateMultiplier: number;
  /** Defense power multiplier */
  defenseMultiplier: number;
}

/** Stake tiers configuration */
export const STAKE_TIERS: StakeTier[] = [
  { minStake: 0, name: 'Base', hashrateMultiplier: 1.0, defenseMultiplier: 1.0 },
  { minStake: 100, name: 'Bronze', hashrateMultiplier: 1.5, defenseMultiplier: 1.2 },
  { minStake: 500, name: 'Silver', hashrateMultiplier: 2.0, defenseMultiplier: 1.5 },
  { minStake: 1000, name: 'Gold', hashrateMultiplier: 2.5, defenseMultiplier: 1.8 },
  { minStake: 5000, name: 'Diamond', hashrateMultiplier: 3.0, defenseMultiplier: 2.0 },
];

/** Individual stake record */
export interface StakeRecord {
  /** Wallet address of staker */
  walletAddress: string;
  /** Mine ID where staked */
  mineId: string;
  /** Amount staked */
  amount: number;
  /** When stake was created */
  stakedAt: Date;
  /** Is this the user's home base? */
  isHomeBase: boolean;
  /** Loyalty bonus (days at same mine) */
  loyaltyDays: number;
}

// ============ EXPEDITION TYPES ============

/** Expedition status */
export type ExpeditionStatus = 'active' | 'returning' | 'completed' | 'failed';

/** Active expedition (raid) */
export interface Expedition {
  /** Unique expedition ID */
  id: string;
  /** Wallet addresses of attackers */
  attackers: string[];
  /** Source mine (attackers' home) */
  sourceMineId: string;
  /** Target mine being raided */
  targetMineId: string;
  /** When expedition started */
  startedAt: Date;
  /** When expedition ends (max 2 hours) */
  expiresAt: Date;
  /** Current status */
  status: ExpeditionStatus;
  /** Optional bet amounts by wallet */
  bets: Map<string, number>;
  /** Total attack power at start */
  attackPower: number;
}

// ============ DISCOVERY TYPES ============

/** Discovery result (found resource) */
export interface DiscoveryResult {
  /** Discovery ID */
  id: string;
  /** Discovery number at this mine */
  number: number;
  /** Mine where discovery was made */
  mineId: string;
  /** Resource type */
  resource: ResourceType;
  /** Resource-specific name (Seam/Nugget/Gusher/Lode) */
  discoveryName: string;
  /** Finder wallet address */
  finderWallet: string;
  /** Total reward amount */
  totalReward: number;
  /** Finder's instant share (70%) */
  finderShare: number;
  /** Vault share (30%) */
  vaultShare: number;
  /** Was jackpot triggered (gold mines) */
  isJackpot: boolean;
  /** Jackpot multiplier if applicable */
  jackpotMultiplier: number;
  /** When discovered */
  foundAt: Date;
  /** Proof hash */
  proofHash: string;
}

// ============ VAULT TYPES ============

/** Miner contribution tracking for hourly distribution */
export interface MinerContribution {
  /** Wallet address */
  walletAddress: string;
  /** Hashrate × seconds online this hour */
  hashrateSeconds: number;
  /** Current stake tier multiplier */
  stakeTierMultiplier: number;
  /** Loyalty bonus (0.1 for 7+ days at coal mine) */
  loyaltyBonus: number;
  /** Time active this hour in seconds */
  timeActiveSeconds: number;
}

/** Mine vault for accumulating pool rewards */
export interface MineVault {
  /** Mine ID */
  mineId: string;
  /** Current vault balance */
  balance: number;
  /** Pending distribution amount */
  pendingDistribution: number;
  /** Last distribution time */
  lastDistributionTime: Date;
  /** Hourly contributions by wallet */
  hourlyContributions: Map<string, MinerContribution>;
  /** Total distributions made */
  totalDistributed: number;
  /** Distribution count */
  distributionCount: number;
}

/** Hourly distribution result */
export interface VaultDistributionResult {
  /** Mine ID */
  mineId: string;
  /** Total amount distributed */
  totalDistributed: number;
  /** Number of miners who received */
  minerCount: number;
  /** Individual payouts by wallet */
  payouts: Map<string, number>;
  /** When distribution happened */
  distributedAt: Date;
}

// ============ SYNDICATE TYPES ============

/** Syndicate settings */
export interface SyndicateSettings {
  /** Percentage of member earnings to treasury (0-30) */
  rewardSplit: number;
  /** Enable coordinated raids */
  raidCoordination: boolean;
  /** Enable defense alerts */
  defenseAlerts: boolean;
}

/** Syndicate member role */
export type SyndicateRole = 'leader' | 'officer' | 'member';

/** Syndicate member info */
export interface SyndicateMember {
  /** Wallet address */
  walletAddress: string;
  /** Role in syndicate */
  role: SyndicateRole;
  /** When joined */
  joinedAt: Date;
  /** Total contributed to treasury */
  totalContributed: number;
}

/** Syndicate definition */
export interface Syndicate {
  /** Unique syndicate ID */
  id: string;
  /** Syndicate name */
  name: string;
  /** Short tag (3-4 chars) */
  tag: string;
  /** Leader wallet address */
  leaderId: string;
  /** All members with roles */
  members: Map<string, SyndicateMember>;
  /** When created */
  createdAt: Date;
  /** Treasury balance */
  treasury: number;
  /** Syndicate settings */
  settings: SyndicateSettings;
  /** Active wars (syndicate IDs) */
  activeWars: string[];
  /** Total wins in syndicate wars */
  warWins: number;
  /** Total losses in syndicate wars */
  warLosses: number;
}

/** Syndicate creation cost */
export const SYNDICATE_CREATION_COST = 1000;

/** Coordinated syndicate raid */
export interface SyndicateRaid {
  /** Raid ID */
  id: string;
  /** Syndicate launching raid */
  syndicateId: string;
  /** Target mine */
  targetMineId: string;
  /** Participating member wallets */
  participants: string[];
  /** Pooled attack power */
  pooledAttackPower: number;
  /** Total bet amounts */
  totalBets: number;
  /** Individual bets */
  bets: Map<string, number>;
  /** When raid started */
  startedAt: Date;
  /** When raid resolves */
  expiresAt: Date;
  /** Status */
  status: ExpeditionStatus;
}

// ============ DEFENDER SPOILS TYPES ============

/** Defender spoils from failed raid */
export interface DefenderSpoils {
  /** Raid ID */
  raidId: string;
  /** Total spoils amount (10% of attacker bets) */
  totalSpoils: number;
  /** Amount burned (90% of attacker bets) */
  amountBurned: number;
  /** Individual defender payouts */
  defenderPayouts: Map<string, number>;
  /** When distributed */
  distributedAt: Date;
}

// ============ RAID TYPES ============

/** Raid result */
export interface RaidResult {
  /** Expedition ID */
  expeditionId: string;
  /** Whether attackers won */
  attackersWon: boolean;
  /** Total rewards stolen (if won) */
  stolenRewards: number;
  /** Defense power at resolution */
  defensePower: number;
  /** Attack power at resolution */
  attackPower: number;
  /** Bets returned (winners) */
  betsReturned: Map<string, number>;
  /** Bets burned (losers) */
  betsBurned: Map<string, number>;
  /** When resolved */
  resolvedAt: Date;
}

/** Defense buff applied after successful defense */
export interface DefenseBuff {
  /** Mine that has the buff */
  mineId: string;
  /** Immunity from raids until this time */
  immuneUntil: Date;
  /** Hashrate boost multiplier */
  hashrateBoost: number;
  /** When boost expires */
  boostExpiresAt: Date;
}

/** Attack debuff applied after successful raid */
export interface AttackDebuff {
  /** Mine that has the debuff */
  mineId: string;
  /** Hashrate reduction multiplier (e.g., 0.8 = 20% reduction) */
  hashrateReduction: number;
  /** When debuff expires */
  expiresAt: Date;
}

// ============ COOLDOWN TYPES ============

/** Cooldown types in the game */
export type CooldownType = 
  | 'home_base_switch'    // 24 hours between home base changes
  | 'expedition_start'    // 1 hour between expeditions
  | 'expedition_recovery' // 30 min after expedition ends
  | 'rally_defense';      // 1 hour between rally uses

/** Cooldown record */
export interface Cooldown {
  /** Wallet address */
  walletAddress: string;
  /** Type of cooldown */
  type: CooldownType;
  /** When cooldown expires */
  expiresAt: Date;
}

/** Cooldown durations in milliseconds */
export const COOLDOWN_DURATIONS: Record<CooldownType, number> = {
  home_base_switch: 24 * 60 * 60 * 1000,    // 24 hours
  expedition_start: 60 * 60 * 1000,          // 1 hour
  expedition_recovery: 30 * 60 * 1000,       // 30 minutes
  rally_defense: 60 * 60 * 1000,             // 1 hour
};

// ============ MINE STATE TYPES ============

/** Live state of a mine */
export interface MineState {
  /** Mine definition reference */
  definition: MineDefinition;
  /** Active miners at this mine */
  activeMiners: Set<string>;
  /** Total hashrate at this mine */
  totalHashrate: number;
  /** Total stake at this mine */
  totalStake: number;
  /** Current discovery number */
  currentDiscovery: number;
  /** Total discoveries found at this mine */
  totalDiscoveries: number;
  /** Last discovery found timestamp */
  lastDiscoveryTime: Date | null;
  /** Current difficulty */
  difficulty: number;
  /** Current difficulty target (hex) */
  target: string;
  /** Active expeditions against this mine */
  incomingRaids: string[];
  /** Defense buffs active */
  defenseBuff: DefenseBuff | null;
  /** Attack debuffs active */
  attackDebuff: AttackDebuff | null;
  /** Current discovery header */
  discoveryHeader: string;
  /** Is currently in "gold rush" jackpot mode (for gold mines) */
  isJackpotActive: boolean;
  /** Syndicate multiplier based on miners (for oil mines) */
  syndicateMultiplier: number;
  /** Current silver surge multiplier (for silver mines) */
  silverSurgeMultiplier: number;
}

/** Miner's game state */
export interface MinerGameState {
  /** Wallet address */
  walletAddress: string;
  /** Home base mine ID */
  homeBaseMineId: string | null;
  /** Current active mine ID (could be on expedition) */
  activeMineId: string | null;
  /** Current expedition ID if on one */
  currentExpeditionId: string | null;
  /** Total stake across all mines */
  totalStake: number;
  /** Active cooldowns */
  cooldowns: Cooldown[];
  /** Loyalty days at home base */
  loyaltyDays: number;
  /** When they joined their home base */
  homeBaseJoinedAt: Date | null;
}

// ============ EVENT TYPES ============

/** Game events broadcast to clients */
export type GameEventType =
  | 'mine_update'
  | 'raid_started'
  | 'raid_resolved'
  | 'stake_changed'
  | 'discovery_found'
  | 'jackpot_triggered'
  | 'silver_surge'
  | 'syndicate_bonus'
  | 'spoils_distributed'
  | 'vault_distribution';

/** Game event payload */
export interface GameEvent<T = unknown> {
  type: GameEventType;
  mineId: string;
  payload: T;
  timestamp: Date;
}

// ============ NETWORK STATS (EXTENDED) ============

/** Extended network stats per mine */
export interface MineNetworkStats {
  mineId: string;
  mineName: string;
  resource: ResourceType;
  minerCount: number;
  hashrate: number;
  totalStake: number;
  discoveriesFound: number;
  difficulty: number;
  lastDiscoveryTime: Date | null;
  hasDefenseBuff: boolean;
  hasAttackDebuff: boolean;
  activeRaidCount: number;
}

/** Global network stats */
export interface GlobalNetworkStats {
  totalMiners: number;
  totalHashrate: number;
  totalStake: number;
  totalDiscoveries: number;
  mineStats: MineNetworkStats[];
  activeExpeditions: number;
  activeRaids: number;
}

// ============ HELPER FUNCTIONS ============

/** Get stake tier for a given stake amount */
export function getStakeTier(stakeAmount: number): StakeTier {
  // Find highest tier the stake qualifies for
  for (let i = STAKE_TIERS.length - 1; i >= 0; i--) {
    if (stakeAmount >= STAKE_TIERS[i].minStake) {
      return STAKE_TIERS[i];
    }
  }
  return STAKE_TIERS[0];
}

/** Calculate effective hashrate with stake multiplier */
export function calculateEffectiveHashrate(
  baseHashrate: number,
  stakeAmount: number,
  loyaltyDays: number,
  resource: ResourceType
): number {
  const tier = getStakeTier(stakeAmount);
  let multiplier = tier.hashrateMultiplier;
  
  // Coal loyalty bonus: +10% after 7 days
  if (resource === 'coal' && loyaltyDays >= 7) {
    multiplier *= 1.1;
  }
  
  return baseHashrate * multiplier;
}

/** Calculate defense power for a wallet */
export function calculateDefensePower(
  stakeAmount: number,
  isHomeBase: boolean
): number {
  const tier = getStakeTier(stakeAmount);
  let power = stakeAmount * tier.defenseMultiplier;
  
  // Home base advantage: 1.5x stake power for defense
  if (isHomeBase) {
    power *= 1.5;
  }
  
  return power;
}

/** Calculate attack power (50% of normal when on expedition) */
export function calculateAttackPower(
  effectiveHashrate: number,
  stakeAmount: number
): number {
  // Attack power = half hashrate + stake weight
  return (effectiveHashrate * 0.5) + (stakeAmount * 0.1);
}

/** Calculate syndicate multiplier for oil mines */
export function calculateSyndicateMultiplier(minerCount: number): number {
  // Scales from 1x at 1 miner to 3x at 50+ miners
  if (minerCount <= 1) return 1.0;
  if (minerCount >= 50) return 3.0;
  return 1.0 + (minerCount - 1) * (2.0 / 49);
}

/** Calculate silver surge multiplier (random) */
export function rollSilverSurgeMultiplier(): number {
  // Random between 0.5 and 2.0
  return 0.5 + Math.random() * 1.5;
}

/** Check if gold rush jackpot triggers */
export function rollGoldRushJackpot(): boolean {
  // 5% chance of 5x jackpot
  return Math.random() < 0.05;
}
