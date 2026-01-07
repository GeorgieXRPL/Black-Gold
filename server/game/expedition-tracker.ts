/**
 * @fileoverview Expedition Tracker for Black Gold v2
 * Manages active expeditions (raids) between mines
 */

import { Expedition, ExpeditionStatus, calculateAttackPower } from './types';
import { getMineRegistry } from './mine-registry';
import { getStakeManager } from './stake-manager';
import { getCooldownManager } from './cooldowns';
import { v4 as uuidv4 } from 'uuid';

/** Maximum expedition duration in milliseconds (2 hours) */
const MAX_EXPEDITION_DURATION_MS = 2 * 60 * 60 * 1000;

/**
 * Expedition Tracker class
 * Manages expedition lifecycle from creation to resolution
 */
export class ExpeditionTracker {
  /** Active expeditions by ID */
  private expeditions: Map<string, Expedition> = new Map();
  
  /** Expeditions by attacker wallet for quick lookup */
  private attackerExpeditions: Map<string, string> = new Map();

  /**
   * Create a new expedition
   */
  createExpedition(
    attackerWallet: string,
    sourceMineId: string,
    targetMineId: string,
    attackerHashrate: number,
    betAmount: number = 0
  ): Expedition | null {
    const registry = getMineRegistry();
    const stakeManager = getStakeManager();
    const cooldownManager = getCooldownManager();

    // Validate source mine
    const sourceMine = registry.getMine(sourceMineId);
    if (!sourceMine) {
      console.log(`[ExpeditionTracker] Source mine ${sourceMineId} not found`);
      return null;
    }

    // Validate target mine
    const targetMine = registry.getMine(targetMineId);
    if (!targetMine) {
      console.log(`[ExpeditionTracker] Target mine ${targetMineId} not found`);
      return null;
    }

    // Can't raid your own mine
    if (sourceMineId === targetMineId) {
      console.log(`[ExpeditionTracker] Cannot raid your own mine`);
      return null;
    }

    // Check cooldowns
    const cooldownError = cooldownManager.checkAction(attackerWallet, 'expedition_start');
    if (cooldownError) {
      console.log(`[ExpeditionTracker] ${cooldownError}`);
      return null;
    }

    const recoveryError = cooldownManager.checkAction(attackerWallet, 'expedition_recovery');
    if (recoveryError) {
      console.log(`[ExpeditionTracker] ${recoveryError}`);
      return null;
    }

    // Check if already on expedition
    if (this.attackerExpeditions.has(attackerWallet)) {
      console.log(`[ExpeditionTracker] ${attackerWallet} already on expedition`);
      return null;
    }

    // Check raid immunity
    if (registry.hasRaidImmunity(targetMineId)) {
      console.log(`[ExpeditionTracker] ${targetMine.definition.name} has raid immunity`);
      return null;
    }

    // Process bet if any
    if (betAmount > 0) {
      const betSuccess = stakeManager.processBet(attackerWallet, sourceMineId, betAmount);
      if (!betSuccess) {
        console.log(`[ExpeditionTracker] Bet processing failed for ${attackerWallet}`);
        return null;
      }
    }

    // Calculate attack power
    const stakeAmount = stakeManager.getStakeAtMine(attackerWallet, sourceMineId);
    const attackPower = calculateAttackPower(attackerHashrate, stakeAmount);

    const now = new Date();
    const expedition: Expedition = {
      id: uuidv4(),
      attackers: [attackerWallet],
      sourceMineId,
      targetMineId,
      startedAt: now,
      expiresAt: new Date(now.getTime() + MAX_EXPEDITION_DURATION_MS),
      status: 'active',
      bets: new Map([[attackerWallet, betAmount]]),
      attackPower,
    };

    // Store expedition
    this.expeditions.set(expedition.id, expedition);
    this.attackerExpeditions.set(attackerWallet, expedition.id);

    // Register with target mine
    registry.addIncomingRaid(targetMineId, expedition.id);

    // Apply expedition cooldown
    cooldownManager.applyCooldown(attackerWallet, 'expedition_start');

    // Update miner state
    const minerState = stakeManager.getMinerState(attackerWallet);
    minerState.currentExpeditionId = expedition.id;
    minerState.activeMineId = targetMineId;

    console.log(
      `[ExpeditionTracker] Expedition ${expedition.id} created: ` +
      `${sourceMine.definition.name} -> ${targetMine.definition.name} ` +
      `(Attack Power: ${attackPower.toFixed(2)}, Bet: ${betAmount})`
    );

    return expedition;
  }

  /**
   * Join an existing expedition
   */
  joinExpedition(
    expeditionId: string,
    attackerWallet: string,
    attackerHashrate: number,
    betAmount: number = 0
  ): boolean {
    const expedition = this.expeditions.get(expeditionId);
    if (!expedition || expedition.status !== 'active') {
      console.log(`[ExpeditionTracker] Expedition ${expeditionId} not found or not active`);
      return false;
    }

    if (this.attackerExpeditions.has(attackerWallet)) {
      console.log(`[ExpeditionTracker] ${attackerWallet} already on expedition`);
      return false;
    }

    const stakeManager = getStakeManager();
    const cooldownManager = getCooldownManager();

    // Check cooldowns
    const cooldownError = cooldownManager.checkAction(attackerWallet, 'expedition_start');
    if (cooldownError) {
      console.log(`[ExpeditionTracker] ${cooldownError}`);
      return false;
    }

    // Process bet if any
    if (betAmount > 0) {
      const betSuccess = stakeManager.processBet(attackerWallet, expedition.sourceMineId, betAmount);
      if (!betSuccess) {
        return false;
      }
    }

    // Calculate additional attack power
    const stakeAmount = stakeManager.getStakeAtMine(attackerWallet, expedition.sourceMineId);
    const additionalPower = calculateAttackPower(attackerHashrate, stakeAmount);

    // Add to expedition
    expedition.attackers.push(attackerWallet);
    expedition.bets.set(attackerWallet, betAmount);
    expedition.attackPower += additionalPower;

    // Track attacker
    this.attackerExpeditions.set(attackerWallet, expeditionId);

    // Apply cooldown
    cooldownManager.applyCooldown(attackerWallet, 'expedition_start');

    // Update miner state
    const minerState = stakeManager.getMinerState(attackerWallet);
    minerState.currentExpeditionId = expeditionId;
    minerState.activeMineId = expedition.targetMineId;

    console.log(
      `[ExpeditionTracker] ${attackerWallet} joined expedition ${expeditionId} ` +
      `(+${additionalPower.toFixed(2)} power, total: ${expedition.attackPower.toFixed(2)})`
    );

    return true;
  }

  /**
   * Get an expedition by ID
   */
  getExpedition(expeditionId: string): Expedition | undefined {
    return this.expeditions.get(expeditionId);
  }

  /**
   * Get expedition for an attacker
   */
  getAttackerExpedition(walletAddress: string): Expedition | undefined {
    const expeditionId = this.attackerExpeditions.get(walletAddress);
    if (!expeditionId) return undefined;
    return this.expeditions.get(expeditionId);
  }

  /**
   * Get all active expeditions
   */
  getActiveExpeditions(): Expedition[] {
    return Array.from(this.expeditions.values()).filter(e => e.status === 'active');
  }

  /**
   * Get expeditions targeting a specific mine
   */
  getExpeditionsTargeting(mineId: string): Expedition[] {
    return Array.from(this.expeditions.values()).filter(
      e => e.targetMineId === mineId && e.status === 'active'
    );
  }

  /**
   * Mark expedition as returning (attackers heading back)
   */
  startReturn(expeditionId: string): void {
    const expedition = this.expeditions.get(expeditionId);
    if (!expedition) return;

    expedition.status = 'returning';

    const stakeManager = getStakeManager();
    const registry = getMineRegistry();

    // Return attackers to their source mine
    for (const attacker of expedition.attackers) {
      const minerState = stakeManager.getMinerState(attacker);
      minerState.activeMineId = expedition.sourceMineId;
    }

    console.log(`[ExpeditionTracker] Expedition ${expeditionId} returning to base`);
  }

  /**
   * Complete an expedition
   */
  completeExpedition(expeditionId: string, success: boolean): void {
    const expedition = this.expeditions.get(expeditionId);
    if (!expedition) return;

    expedition.status = success ? 'completed' : 'failed';

    const registry = getMineRegistry();
    const stakeManager = getStakeManager();
    const cooldownManager = getCooldownManager();

    // Remove from target mine's incoming raids
    registry.removeIncomingRaid(expedition.targetMineId, expeditionId);

    // Clean up attacker tracking and apply recovery cooldown
    for (const attacker of expedition.attackers) {
      this.attackerExpeditions.delete(attacker);
      cooldownManager.applyCooldown(attacker, 'expedition_recovery');

      // Reset miner state
      const minerState = stakeManager.getMinerState(attacker);
      minerState.currentExpeditionId = null;
      minerState.activeMineId = minerState.homeBaseMineId;
    }

    console.log(
      `[ExpeditionTracker] Expedition ${expeditionId} ${success ? 'succeeded' : 'failed'}`
    );
  }

  /**
   * Cancel an expedition (attacker leaves early)
   */
  leaveExpedition(walletAddress: string): boolean {
    const expeditionId = this.attackerExpeditions.get(walletAddress);
    if (!expeditionId) return false;

    const expedition = this.expeditions.get(expeditionId);
    if (!expedition) return false;

    // Remove attacker
    const index = expedition.attackers.indexOf(walletAddress);
    if (index >= 0) {
      expedition.attackers.splice(index, 1);
    }

    // Remove bet (forfeited)
    const bet = expedition.bets.get(walletAddress) || 0;
    if (bet > 0) {
      const stakeManager = getStakeManager();
      stakeManager.burnBet(walletAddress, expedition.sourceMineId, bet);
    }
    expedition.bets.delete(walletAddress);

    // Clean up tracking
    this.attackerExpeditions.delete(walletAddress);

    // If no attackers left, cancel expedition
    if (expedition.attackers.length === 0) {
      const registry = getMineRegistry();
      registry.removeIncomingRaid(expedition.targetMineId, expeditionId);
      this.expeditions.delete(expeditionId);
      console.log(`[ExpeditionTracker] Expedition ${expeditionId} cancelled (no attackers)`);
    }

    // Apply recovery cooldown
    const cooldownManager = getCooldownManager();
    cooldownManager.applyCooldown(walletAddress, 'expedition_recovery');

    // Reset miner state
    const stakeManager = getStakeManager();
    const minerState = stakeManager.getMinerState(walletAddress);
    minerState.currentExpeditionId = null;
    minerState.activeMineId = minerState.homeBaseMineId;

    console.log(`[ExpeditionTracker] ${walletAddress} left expedition ${expeditionId}`);
    return true;
  }

  /**
   * Check for expired expeditions
   */
  checkExpiredExpeditions(): Expedition[] {
    const now = new Date();
    const expired: Expedition[] = [];

    for (const expedition of this.expeditions.values()) {
      if (expedition.status === 'active' && now >= expedition.expiresAt) {
        expired.push(expedition);
      }
    }

    return expired;
  }

  /**
   * Get total attack power against a mine
   */
  getTotalAttackPower(mineId: string): number {
    let total = 0;
    for (const expedition of this.getExpeditionsTargeting(mineId)) {
      total += expedition.attackPower;
    }
    return total;
  }

  /**
   * Get expedition statistics
   */
  getStats(): { active: number; completed: number; failed: number } {
    let active = 0;
    let completed = 0;
    let failed = 0;

    for (const expedition of this.expeditions.values()) {
      switch (expedition.status) {
        case 'active':
        case 'returning':
          active++;
          break;
        case 'completed':
          completed++;
          break;
        case 'failed':
          failed++;
          break;
      }
    }

    return { active, completed, failed };
  }

  /**
   * Clean up old completed/failed expeditions
   */
  cleanup(): void {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    let cleaned = 0;

    for (const [id, expedition] of this.expeditions) {
      if (
        (expedition.status === 'completed' || expedition.status === 'failed') &&
        expedition.expiresAt < oneHourAgo
      ) {
        this.expeditions.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[ExpeditionTracker] Cleaned up ${cleaned} old expeditions`);
    }
  }
}

// Singleton instance
let expeditionTrackerInstance: ExpeditionTracker | null = null;

export function getExpeditionTracker(): ExpeditionTracker {
  if (!expeditionTrackerInstance) {
    expeditionTrackerInstance = new ExpeditionTracker();
  }
  return expeditionTrackerInstance;
}

export function resetExpeditionTracker(): void {
  expeditionTrackerInstance = null;
}
