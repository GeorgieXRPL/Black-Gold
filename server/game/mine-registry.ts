/**
 * @fileoverview Mine Registry for Black Gold v2
 * Manages all mine states and their individual pool operations
 */

import { MINES, MineDefinition, ResourceType, RESOURCE_MECHANICS } from '../../config/mines';
import {
  MineState,
  MineNetworkStats,
  DefenseBuff,
  AttackDebuff,
  calculateSyndicateMultiplier,
  rollSilverSurgeMultiplier,
  rollGoldRushJackpot,
} from './types';
import { createDifficultyState, difficultyToTarget } from '../pool/difficulty';

/**
 * Creates initial discovery header for a mine
 */
function createInitialDiscoveryHeader(mineId: string): string {
  const timestamp = Date.now().toString(16);
  const randomBytes = Math.random().toString(16).slice(2, 18);
  return `${mineId}:${timestamp}:${randomBytes}`;
}

/**
 * Creates the initial state for a mine
 */
export function createMineState(definition: MineDefinition): MineState {
  const diffState = createDifficultyState();
  
  return {
    definition,
    activeMiners: new Set(),
    totalHashrate: 0,
    totalStake: 0,
    currentDiscovery: 1,
    totalDiscoveries: 0,
    lastDiscoveryTime: null,
    difficulty: diffState.current,
    target: diffState.target,
    incomingRaids: [],
    defenseBuff: null,
    attackDebuff: null,
    discoveryHeader: createInitialDiscoveryHeader(definition.id),
    isJackpotActive: false,
    syndicateMultiplier: 1.0,
    silverSurgeMultiplier: 1.0,
  };
}

/**
 * Mine Registry class
 * Manages all mines and their states
 */
export class MineRegistry {
  private mines: Map<string, MineState> = new Map();
  private minerLocations: Map<string, string> = new Map(); // wallet -> mineId

  constructor() {
    // Initialize all mines
    for (const definition of MINES) {
      this.mines.set(definition.id, createMineState(definition));
    }
    console.log(`[MineRegistry] Initialized ${this.mines.size} mines`);
  }

  /**
   * Get a mine state by ID
   */
  getMine(mineId: string): MineState | undefined {
    return this.mines.get(mineId);
  }

  /**
   * Get all mines
   */
  getAllMines(): MineState[] {
    return Array.from(this.mines.values());
  }

  /**
   * Get mines by resource type
   */
  getMinesByResource(resource: ResourceType): MineState[] {
    return this.getAllMines().filter(m => m.definition.resource === resource);
  }

  /**
   * Get the mine a miner is currently at
   */
  getMinerLocation(walletAddress: string): string | undefined {
    return this.minerLocations.get(walletAddress);
  }

  /**
   * Add a miner to a mine
   */
  addMiner(walletAddress: string, mineId: string, hashrate: number = 0): boolean {
    const mine = this.mines.get(mineId);
    if (!mine) {
      console.log(`[MineRegistry] Mine ${mineId} not found`);
      return false;
    }

    // Remove from previous mine if any
    const previousMineId = this.minerLocations.get(walletAddress);
    if (previousMineId && previousMineId !== mineId) {
      this.removeMiner(walletAddress);
    }

    mine.activeMiners.add(walletAddress);
    mine.totalHashrate += hashrate;
    this.minerLocations.set(walletAddress, mineId);

    // Update resource-specific mechanics
    this.updateResourceMechanics(mine);

    console.log(
      `[MineRegistry] Miner ${walletAddress} joined ${mine.definition.name} ` +
      `(${mine.activeMiners.size} miners, ${mine.totalHashrate} H/s)`
    );

    return true;
  }

  /**
   * Remove a miner from their current mine
   */
  removeMiner(walletAddress: string, hashrate: number = 0): boolean {
    const mineId = this.minerLocations.get(walletAddress);
    if (!mineId) return false;

    const mine = this.mines.get(mineId);
    if (!mine) return false;

    mine.activeMiners.delete(walletAddress);
    mine.totalHashrate = Math.max(0, mine.totalHashrate - hashrate);
    this.minerLocations.delete(walletAddress);

    // Update resource-specific mechanics
    this.updateResourceMechanics(mine);

    console.log(
      `[MineRegistry] Miner ${walletAddress} left ${mine.definition.name} ` +
      `(${mine.activeMiners.size} miners remaining)`
    );

    return true;
  }

  /**
   * Update a miner's hashrate at their current mine
   */
  updateMinerHashrate(walletAddress: string, oldHashrate: number, newHashrate: number): void {
    const mineId = this.minerLocations.get(walletAddress);
    if (!mineId) return;

    const mine = this.mines.get(mineId);
    if (!mine) return;

    mine.totalHashrate = Math.max(0, mine.totalHashrate - oldHashrate + newHashrate);
  }

  /**
   * Update stake total for a mine
   */
  updateMineStake(mineId: string, stakeDelta: number): void {
    const mine = this.mines.get(mineId);
    if (!mine) return;

    mine.totalStake = Math.max(0, mine.totalStake + stakeDelta);
  }

  /**
   * Record a discovery found at a mine
   */
  recordDiscoveryFound(mineId: string, previousHash: string): void {
    const mine = this.mines.get(mineId);
    if (!mine) return;

    mine.totalDiscoveries++;
    mine.currentDiscovery++;
    mine.lastDiscoveryTime = new Date();
    
    // Generate new discovery header
    mine.discoveryHeader = this.generateDiscoveryHeader(mineId, previousHash);

    // Resource-specific post-discovery updates
    this.updatePostDiscoveryMechanics(mine);
  }

  /**
   * Generate a new discovery header
   */
  private generateDiscoveryHeader(mineId: string, previousHash: string): string {
    const timestamp = Date.now().toString(16);
    const prevHashTrunc = previousHash.slice(0, 16);
    const randomBytes = Math.random().toString(16).slice(2, 10);
    return `${mineId}:${timestamp}:${prevHashTrunc}:${randomBytes}`;
  }

  /**
   * Update resource-specific mechanics (called when miner count changes)
   */
  private updateResourceMechanics(mine: MineState): void {
    const { resource } = mine.definition;

    switch (resource) {
      case 'oil':
        // Syndicate: multiplier based on miner count
        mine.syndicateMultiplier = calculateSyndicateMultiplier(mine.activeMiners.size);
        break;
      // Other resources don't update on miner change
    }
  }

  /**
   * Update mechanics after discovery is found
   */
  private updatePostDiscoveryMechanics(mine: MineState): void {
    const { resource } = mine.definition;

    switch (resource) {
      case 'gold':
        // Gold Rush: check for jackpot
        mine.isJackpotActive = rollGoldRushJackpot();
        if (mine.isJackpotActive) {
          console.log(`[MineRegistry] 🎰 GOLD RUSH! Jackpot at ${mine.definition.name}!`);
        }
        break;
      case 'silver':
        // Speculation: roll new surge multiplier
        mine.silverSurgeMultiplier = rollSilverSurgeMultiplier();
        break;
      default:
        break;
    }
  }

  /**
   * Apply defense buff to a mine
   */
  applyDefenseBuff(mineId: string): void {
    const mine = this.mines.get(mineId);
    if (!mine) return;

    const now = new Date();
    mine.defenseBuff = {
      mineId,
      immuneUntil: new Date(now.getTime() + 2 * 60 * 60 * 1000), // 2 hours immunity
      hashrateBoost: 1.1, // 10% boost
      boostExpiresAt: new Date(now.getTime() + 60 * 60 * 1000), // 1 hour boost
    };

    console.log(`[MineRegistry] Defense buff applied to ${mine.definition.name}`);
  }

  /**
   * Apply attack debuff to a mine (after successful raid against it)
   */
  applyAttackDebuff(mineId: string): void {
    const mine = this.mines.get(mineId);
    if (!mine) return;

    mine.attackDebuff = {
      mineId,
      hashrateReduction: 0.8, // 20% reduction
      expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
    };

    console.log(`[MineRegistry] Attack debuff applied to ${mine.definition.name}`);
  }

  /**
   * Check and clear expired buffs/debuffs
   */
  clearExpiredEffects(): void {
    const now = new Date();

    for (const mine of this.mines.values()) {
      // Clear expired defense buff
      if (mine.defenseBuff) {
        if (now >= mine.defenseBuff.immuneUntil && now >= mine.defenseBuff.boostExpiresAt) {
          mine.defenseBuff = null;
        } else if (now >= mine.defenseBuff.boostExpiresAt) {
          // Keep immunity but remove boost
          mine.defenseBuff.hashrateBoost = 1.0;
        }
      }

      // Clear expired attack debuff
      if (mine.attackDebuff && now >= mine.attackDebuff.expiresAt) {
        mine.attackDebuff = null;
      }
    }
  }

  /**
   * Add incoming raid to a mine
   */
  addIncomingRaid(mineId: string, expeditionId: string): void {
    const mine = this.mines.get(mineId);
    if (!mine) return;

    if (!mine.incomingRaids.includes(expeditionId)) {
      mine.incomingRaids.push(expeditionId);
    }
  }

  /**
   * Remove incoming raid from a mine
   */
  removeIncomingRaid(mineId: string, expeditionId: string): void {
    const mine = this.mines.get(mineId);
    if (!mine) return;

    mine.incomingRaids = mine.incomingRaids.filter(id => id !== expeditionId);
  }

  /**
   * Check if a mine has raid immunity
   */
  hasRaidImmunity(mineId: string): boolean {
    const mine = this.mines.get(mineId);
    if (!mine || !mine.defenseBuff) return false;

    return new Date() < mine.defenseBuff.immuneUntil;
  }

  /**
   * Get current hashrate multiplier for a mine (includes buffs/debuffs)
   */
  getHashrateMultiplier(mineId: string): number {
    const mine = this.mines.get(mineId);
    if (!mine) return 1.0;

    let multiplier = 1.0;

    // Defense buff boost
    if (mine.defenseBuff && new Date() < mine.defenseBuff.boostExpiresAt) {
      multiplier *= mine.defenseBuff.hashrateBoost;
    }

    // Attack debuff reduction
    if (mine.attackDebuff && new Date() < mine.attackDebuff.expiresAt) {
      multiplier *= mine.attackDebuff.hashrateReduction;
    }

    // Resource-specific multipliers
    if (mine.definition.resource === 'oil') {
      multiplier *= mine.syndicateMultiplier;
    }

    return multiplier;
  }

  /**
   * Get current reward multiplier for a mine
   */
  getRewardMultiplier(mineId: string): number {
    const mine = this.mines.get(mineId);
    if (!mine) return 1.0;

    let multiplier = mine.definition.baseRewardMultiplier;

    // Gold Rush jackpot
    if (mine.definition.resource === 'gold' && mine.isJackpotActive) {
      multiplier *= 5.0;
    }

    // Silver surge
    if (mine.definition.resource === 'silver') {
      multiplier *= mine.silverSurgeMultiplier;
    }

    // Oil syndicate
    if (mine.definition.resource === 'oil') {
      multiplier *= mine.syndicateMultiplier;
    }

    return multiplier;
  }

  /**
   * Update mine difficulty and target
   */
  updateMineDifficulty(mineId: string, difficulty: number, target: string): void {
    const mine = this.mines.get(mineId);
    if (!mine) return;

    mine.difficulty = difficulty;
    mine.target = target;
  }

  /**
   * Get network stats for all mines
   */
  getNetworkStats(): MineNetworkStats[] {
    return this.getAllMines().map(mine => ({
      mineId: mine.definition.id,
      mineName: mine.definition.name,
      resource: mine.definition.resource,
      minerCount: mine.activeMiners.size,
      hashrate: mine.totalHashrate,
      totalStake: mine.totalStake,
      discoveriesFound: mine.totalDiscoveries,
      difficulty: mine.difficulty,
      lastDiscoveryTime: mine.lastDiscoveryTime,
      hasDefenseBuff: mine.defenseBuff !== null,
      hasAttackDebuff: mine.attackDebuff !== null,
      activeRaidCount: mine.incomingRaids.length,
    }));
  }

  /**
   * Get total miners across all mines
   */
  getTotalMiners(): number {
    return this.minerLocations.size;
  }

  /**
   * Get total hashrate across all mines
   */
  getTotalHashrate(): number {
    let total = 0;
    for (const mine of this.mines.values()) {
      total += mine.totalHashrate;
    }
    return total;
  }

  /**
   * Get total stake across all mines
   */
  getTotalStake(): number {
    let total = 0;
    for (const mine of this.mines.values()) {
      total += mine.totalStake;
    }
    return total;
  }

  /**
   * Get total discoveries across all mines
   */
  getTotalDiscoveries(): number {
    let total = 0;
    for (const mine of this.mines.values()) {
      total += mine.totalDiscoveries;
    }
    return total;
  }
}

// Singleton instance
let registryInstance: MineRegistry | null = null;

export function getMineRegistry(): MineRegistry {
  if (!registryInstance) {
    registryInstance = new MineRegistry();
  }
  return registryInstance;
}

export function resetMineRegistry(): void {
  registryInstance = null;
}
