/**
 * @fileoverview Raid Engine for Black Gold v2
 * Resolves raids between attackers and defenders with betting system
 * 
 * Defender Spoils System:
 * - When attackers fail, 10% of total bets go to defenders (stake-weighted)
 * - Remaining 90% is burned
 * - Creates deflationary pressure on token supply
 */

import { RaidResult, Expedition, calculateDefensePower, DefenderSpoils } from './types';
import { getMineRegistry } from './mine-registry';
import { getStakeManager } from './stake-manager';
import { getExpeditionTracker } from './expedition-tracker';

/** Defense advantage multiplier (defenders need 20% less power to win) */
const DEFENSE_ADVANTAGE = 1.2;

/** Percentage of barrel stolen on successful raid (10-30% based on power differential) */
const MIN_STEAL_PERCENT = 0.1;
const MAX_STEAL_PERCENT = 0.3;

/** Hashrate debuff duration after successful raid (30 minutes) */
const HASHRATE_DEBUFF_DURATION_MS = 30 * 60 * 1000;

/** Defender spoils percentage (10% to defenders, 90% burned) */
const DEFENDER_SPOILS_PERCENT = 0.10;
const BURN_PERCENT = 0.90;

/**
 * Raid Engine class
 * Handles raid resolution, betting, and outcomes
 */
export class RaidEngine {
  /** Recent raid results for history */
  private raidHistory: RaidResult[] = [];

  /** Recent defender spoils distributions */
  private spoilsHistory: DefenderSpoils[] = [];

  /** Pending barrel rewards that can be stolen (mineId -> reward) */
  private pendingBarrelRewards: Map<string, number> = new Map();

  /** Total burned from failed raids */
  private totalBurned: number = 0;

  /** Total spoils distributed to defenders */
  private totalSpoilsDistributed: number = 0;

  /**
   * Set pending barrel reward for a mine
   */
  setPendingReward(mineId: string, reward: number): void {
    this.pendingBarrelRewards.set(mineId, reward);
  }

  /**
   * Get pending barrel reward for a mine
   */
  getPendingReward(mineId: string): number {
    return this.pendingBarrelRewards.get(mineId) || 0;
  }

  /**
   * Clear pending reward after distribution
   */
  clearPendingReward(mineId: string): void {
    this.pendingBarrelRewards.delete(mineId);
  }

  /**
   * Calculate total defense power for a mine
   */
  calculateMineDefensePower(mineId: string): number {
    const registry = getMineRegistry();
    const stakeManager = getStakeManager();
    const mine = registry.getMine(mineId);

    if (!mine) return 0;

    let totalPower = 0;

    // Sum defense power from all miners at this mine
    for (const walletAddress of mine.activeMiners) {
      const minerState = stakeManager.getMinerState(walletAddress);
      
      // Skip miners who are on expedition (only 50% of their power defends)
      if (minerState.currentExpeditionId) {
        totalPower += stakeManager.getDefensePower(walletAddress, mineId) * 0.5;
      } else {
        totalPower += stakeManager.getDefensePower(walletAddress, mineId);
      }
    }

    // Add hashrate-based defense
    totalPower += mine.totalHashrate * 0.1;

    // Apply defense buff if active
    if (mine.defenseBuff) {
      const now = new Date();
      if (now < mine.defenseBuff.boostExpiresAt) {
        totalPower *= mine.defenseBuff.hashrateBoost;
      }
    }

    return totalPower;
  }

  /**
   * Resolve a raid when barrel is found at target mine
   */
  resolveRaid(expeditionId: string): RaidResult | null {
    const tracker = getExpeditionTracker();
    const expedition = tracker.getExpedition(expeditionId);

    if (!expedition || expedition.status !== 'active') {
      console.log(`[RaidEngine] Expedition ${expeditionId} not found or not active`);
      return null;
    }

    const registry = getMineRegistry();
    const stakeManager = getStakeManager();

    // Calculate powers
    const attackPower = expedition.attackPower;
    const defensePower = this.calculateMineDefensePower(expedition.targetMineId);

    // Apply defense advantage: attackers need 1.2x defense power to win
    const effectiveDefensePower = defensePower * DEFENSE_ADVANTAGE;
    const attackersWon = attackPower > effectiveDefensePower;

    console.log(
      `[RaidEngine] Resolving raid ${expeditionId}: ` +
      `Attack ${attackPower.toFixed(2)} vs Defense ${defensePower.toFixed(2)} ` +
      `(effective: ${effectiveDefensePower.toFixed(2)}) -> ${attackersWon ? 'ATTACKERS WIN' : 'DEFENDERS WIN'}`
    );

    const betsReturned = new Map<string, number>();
    const betsBurned = new Map<string, number>();
    let stolenRewards = 0;

    if (attackersWon) {
      // Calculate stolen amount based on power differential
      const powerRatio = Math.min(attackPower / effectiveDefensePower, 2.0);
      const stealPercent = MIN_STEAL_PERCENT + 
        (powerRatio - 1) * (MAX_STEAL_PERCENT - MIN_STEAL_PERCENT);
      
      const pendingReward = this.getPendingReward(expedition.targetMineId);
      stolenRewards = pendingReward * Math.min(stealPercent, MAX_STEAL_PERCENT);

      // Reduce pending reward
      this.pendingBarrelRewards.set(
        expedition.targetMineId,
        pendingReward - stolenRewards
      );

      // Return bets with winnings to attackers
      for (const [wallet, bet] of expedition.bets) {
        if (bet > 0) {
          // Return bet + equal amount from raid pool (if available)
          const winnings = Math.min(bet, stolenRewards / expedition.attackers.length);
          stakeManager.returnBetWithWinnings(wallet, expedition.sourceMineId, bet, winnings);
          betsReturned.set(wallet, bet + winnings);
        }
      }

      // Apply debuff to target mine
      registry.applyAttackDebuff(expedition.targetMineId);

      console.log(
        `[RaidEngine] Attackers stole ${stolenRewards.toFixed(4)} rewards ` +
        `(${(stealPercent * 100).toFixed(1)}%)`
      );

    } else {
      // Defense wins - distribute spoils to defenders, burn the rest
      const totalBets = Array.from(expedition.bets.values()).reduce((a, b) => a + b, 0);
      
      for (const [wallet, bet] of expedition.bets) {
        if (bet > 0) {
          stakeManager.burnBet(wallet, expedition.sourceMineId, bet);
          betsBurned.set(wallet, bet);
        }
      }

      // Calculate and distribute defender spoils (10% of total bets)
      if (totalBets > 0) {
        const spoilsResult = this.distributeDefenderSpoils(
          expeditionId,
          expedition.targetMineId,
          totalBets
        );
        
        console.log(
          `[RaidEngine] Defenders won! ` +
          `Spoils: ${spoilsResult.totalSpoils.toFixed(2)} COAL to ${spoilsResult.defenderPayouts.size} defenders, ` +
          `Burned: ${spoilsResult.amountBurned.toFixed(2)} COAL 🔥`
        );
      }

      // Apply defense buff (2hr immunity + 10% hashrate boost for 1hr)
      registry.applyDefenseBuff(expedition.targetMineId);
    }

    // Complete the expedition
    tracker.completeExpedition(expeditionId, attackersWon);

    // Create result
    const result: RaidResult = {
      expeditionId,
      attackersWon,
      stolenRewards,
      defensePower,
      attackPower,
      betsReturned,
      betsBurned,
      resolvedAt: new Date(),
    };

    // Add to history
    this.raidHistory.push(result);
    if (this.raidHistory.length > 100) {
      this.raidHistory.shift();
    }

    return result;
  }

  /**
   * Resolve all active raids against a mine (called when barrel is found)
   */
  resolveAllRaids(mineId: string): RaidResult[] {
    const tracker = getExpeditionTracker();
    const expeditions = tracker.getExpeditionsTargeting(mineId);
    
    const results: RaidResult[] = [];
    for (const expedition of expeditions) {
      const result = this.resolveRaid(expedition.id);
      if (result) {
        results.push(result);
      }
    }

    return results;
  }

  /**
   * Check if a mine can be raided (not immune)
   */
  canBeRaided(mineId: string): boolean {
    const registry = getMineRegistry();
    return !registry.hasRaidImmunity(mineId);
  }

  /**
   * Get current raid status for a mine
   */
  getRaidStatus(mineId: string): {
    isUnderAttack: boolean;
    incomingAttackPower: number;
    defensePower: number;
    raidCount: number;
    hasImmunity: boolean;
  } {
    const registry = getMineRegistry();
    const tracker = getExpeditionTracker();
    
    const incomingPower = tracker.getTotalAttackPower(mineId);
    const defensePower = this.calculateMineDefensePower(mineId);
    const expeditions = tracker.getExpeditionsTargeting(mineId);

    return {
      isUnderAttack: expeditions.length > 0,
      incomingAttackPower: incomingPower,
      defensePower,
      raidCount: expeditions.length,
      hasImmunity: registry.hasRaidImmunity(mineId),
    };
  }

  /**
   * Rally defense for a mine (costs tokens, temporary boost)
   */
  rallyDefense(mineId: string, callerWallet: string, tokenCost: number): boolean {
    const registry = getMineRegistry();
    const stakeManager = getStakeManager();
    const mine = registry.getMine(mineId);

    if (!mine) return false;

    // Check if caller has enough stake
    const stake = stakeManager.getStakeAtMine(callerWallet, mineId);
    if (stake < tokenCost) {
      console.log(`[RaidEngine] Not enough stake for rally: ${stake} < ${tokenCost}`);
      return false;
    }

    // Burn tokens for rally
    stakeManager.unstake(callerWallet, mineId, tokenCost);

    // Apply temporary 50% defense boost (stacks with defense buff)
    // This is handled by applying a special defense buff
    const now = new Date();
    if (!mine.defenseBuff) {
      mine.defenseBuff = {
        mineId,
        immuneUntil: now, // No immunity from rally
        hashrateBoost: 1.5,
        boostExpiresAt: new Date(now.getTime() + 30 * 60 * 1000), // 30 min
      };
    } else {
      // Stack with existing buff
      mine.defenseBuff.hashrateBoost = Math.min(
        mine.defenseBuff.hashrateBoost * 1.5,
        2.0 // Cap at 2x
      );
    }

    console.log(
      `[RaidEngine] ${callerWallet} rallied defense at ${mine.definition.name} ` +
      `(cost: ${tokenCost}, boost: ${mine.defenseBuff.hashrateBoost}x)`
    );

    return true;
  }

  /**
   * Get recent raid history
   */
  getRecentRaids(limit: number = 20): RaidResult[] {
    return this.raidHistory.slice(-limit).reverse();
  }

  /**
   * Get raid statistics
   */
  getStats(): {
    totalRaids: number;
    attackerWins: number;
    defenderWins: number;
    totalStolen: number;
    totalBurned: number;
    totalSpoilsDistributed: number;
    defenderWinRate: number;
  } {
    let attackerWins = 0;
    let defenderWins = 0;
    let totalStolen = 0;

    for (const result of this.raidHistory) {
      if (result.attackersWon) {
        attackerWins++;
        totalStolen += result.stolenRewards;
      } else {
        defenderWins++;
      }
    }

    const totalRaids = this.raidHistory.length;
    const defenderWinRate = totalRaids > 0 ? (defenderWins / totalRaids) * 100 : 0;

    return {
      totalRaids,
      attackerWins,
      defenderWins,
      totalStolen,
      totalBurned: this.totalBurned,
      totalSpoilsDistributed: this.totalSpoilsDistributed,
      defenderWinRate,
    };
  }

  /**
   * Distribute defender spoils when raid fails
   * 10% of attacker bets go to defenders (stake-weighted), 90% burned
   */
  distributeDefenderSpoils(
    raidId: string,
    mineId: string,
    totalAttackerBets: number
  ): DefenderSpoils {
    const registry = getMineRegistry();
    const stakeManager = getStakeManager();
    const mine = registry.getMine(mineId);

    // Calculate spoils and burn amounts
    const spoilsAmount = Math.floor(totalAttackerBets * DEFENDER_SPOILS_PERCENT);
    const burnAmount = totalAttackerBets - spoilsAmount;
    
    const defenderPayouts = new Map<string, number>();

    if (!mine || spoilsAmount <= 0) {
      this.totalBurned += totalAttackerBets;
      return {
        raidId,
        totalSpoils: 0,
        amountBurned: totalAttackerBets,
        defenderPayouts,
        distributedAt: new Date(),
      };
    }

    // Get all active defenders at the mine (not on expedition)
    const defenders: Array<{ wallet: string; defensePower: number }> = [];
    let totalDefensePower = 0;

    for (const walletAddress of mine.activeMiners) {
      const minerState = stakeManager.getMinerState(walletAddress);
      
      // Only include miners not on expedition
      if (!minerState.currentExpeditionId) {
        const power = stakeManager.getDefensePower(walletAddress, mineId);
        if (power > 0) {
          defenders.push({ wallet: walletAddress, defensePower: power });
          totalDefensePower += power;
        }
      }
    }

    // Distribute spoils proportionally based on defense power
    if (totalDefensePower > 0 && defenders.length > 0) {
      let distributed = 0;
      
      for (const defender of defenders) {
        const share = (defender.defensePower / totalDefensePower) * spoilsAmount;
        const payout = Math.floor(share);
        
        if (payout > 0) {
          defenderPayouts.set(defender.wallet, payout);
          distributed += payout;
          
          // Add to defender's pending rewards (will be distributed with next vault payout)
          stakeManager.addPendingReward(defender.wallet, mineId, payout);
        }
      }
      
      this.totalSpoilsDistributed += distributed;
      this.totalBurned += burnAmount + (spoilsAmount - distributed); // Any remainder also burned
      
    } else {
      // No active defenders - burn everything
      this.totalBurned += totalAttackerBets;
    }

    const result: DefenderSpoils = {
      raidId,
      totalSpoils: spoilsAmount,
      amountBurned: burnAmount,
      defenderPayouts,
      distributedAt: new Date(),
    };

    // Store in history
    this.spoilsHistory.push(result);
    if (this.spoilsHistory.length > 100) {
      this.spoilsHistory.shift();
    }

    return result;
  }

  /**
   * Get recent defender spoils distributions
   */
  getRecentSpoils(limit: number = 20): DefenderSpoils[] {
    return this.spoilsHistory.slice(-limit).reverse();
  }

  /**
   * Distribute stolen rewards to attackers
   */
  distributeRaidRewards(result: RaidResult): Map<string, number> {
    const tracker = getExpeditionTracker();
    const expedition = tracker.getExpedition(result.expeditionId);
    
    if (!expedition || result.stolenRewards <= 0) {
      return new Map();
    }

    // Distribute based on bet size + base share
    const rewards = new Map<string, number>();
    const totalBets = Array.from(expedition.bets.values()).reduce((a, b) => a + b, 0);

    for (const attacker of expedition.attackers) {
      const bet = expedition.bets.get(attacker) || 0;
      
      // Base share (equal split) + bet-weighted bonus
      let share = result.stolenRewards / expedition.attackers.length;
      
      if (totalBets > 0 && bet > 0) {
        // Extra share based on bet proportion
        share += (bet / totalBets) * result.stolenRewards * 0.5;
      }

      rewards.set(attacker, share);
    }

    return rewards;
  }
}

// Singleton instance
let raidEngineInstance: RaidEngine | null = null;

export function getRaidEngine(): RaidEngine {
  if (!raidEngineInstance) {
    raidEngineInstance = new RaidEngine();
  }
  return raidEngineInstance;
}

export function resetRaidEngine(): void {
  raidEngineInstance = null;
}
