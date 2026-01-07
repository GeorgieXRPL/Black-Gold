/**
 * @fileoverview Syndicate Raids System
 * Enables coordinated raids where syndicate members pool their attack power
 * 
 * Features:
 * - Launch syndicate-wide raids
 * - Pool attack power from all participants
 * - Share raid rewards proportionally
 * - Syndicate bet pooling
 */

import { 
  SyndicateRaid, 
  ExpeditionStatus,
  RaidResult,
  DefenderSpoils,
} from './types';
import { getSyndicateManager } from './syndicate-manager';
import { getStakeManager } from './stake-manager';
import { getMineRegistry } from './mine-registry';
import { getRaidEngine } from './raid-engine';

/** Maximum raid duration in ms (2 hours) */
const MAX_RAID_DURATION_MS = 2 * 60 * 60 * 1000;

/** Minimum participants to start a syndicate raid */
const MIN_PARTICIPANTS = 3;

/** Syndicate attack power bonus (10% extra for coordination) */
const SYNDICATE_POWER_BONUS = 1.1;

/**
 * Syndicate Raids Manager
 */
export class SyndicateRaidsManager {
  /** Active syndicate raids by ID */
  private activeRaids: Map<string, SyndicateRaid> = new Map();

  /** Raid history */
  private raidHistory: Array<SyndicateRaid & { result?: RaidResult }> = [];

  /** Pending raid invites (syndicateId -> raid details) */
  private pendingRaids: Map<string, SyndicateRaid> = new Map();

  /**
   * Generate unique raid ID
   */
  private generateId(): string {
    return `synraid_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Propose a syndicate raid (starts gathering phase)
   * Only leaders and officers can propose
   */
  proposeRaid(
    proposerWallet: string,
    targetMineId: string,
    initialBet: number = 0
  ): { success: boolean; raidId?: string; error?: string } {
    const syndicateManager = getSyndicateManager();
    const syndicate = syndicateManager.getMemberSyndicate(proposerWallet);
    
    if (!syndicate) {
      return { success: false, error: 'You are not in a syndicate' };
    }

    if (!syndicate.settings.raidCoordination) {
      return { success: false, error: 'Raid coordination is disabled for this syndicate' };
    }

    if (!syndicateManager.canManageMembers(proposerWallet)) {
      return { success: false, error: 'Only leaders and officers can propose raids' };
    }

    // Check if there's already a pending raid
    if (this.pendingRaids.has(syndicate.id)) {
      return { success: false, error: 'A raid is already being organized' };
    }

    // Check target mine
    const registry = getMineRegistry();
    const raidEngine = getRaidEngine();
    
    if (!registry.getMine(targetMineId)) {
      return { success: false, error: 'Target mine does not exist' };
    }

    if (!raidEngine.canBeRaided(targetMineId)) {
      return { success: false, error: 'Target mine has raid immunity' };
    }

    // Validate initial bet
    const stakeManager = getStakeManager();
    const proposerState = stakeManager.getMinerState(proposerWallet);
    if (proposerState.homeBaseMineId) {
      const stake = stakeManager.getStakeAtMine(proposerWallet, proposerState.homeBaseMineId);
      const maxBet = stake * 0.2;
      if (initialBet > maxBet) {
        return { success: false, error: `Max bet is ${maxBet} COAL (20% of stake)` };
      }
    }

    const id = this.generateId();
    const now = new Date();

    const raid: SyndicateRaid = {
      id,
      syndicateId: syndicate.id,
      targetMineId,
      participants: [proposerWallet],
      pooledAttackPower: this.calculateMemberAttackPower(proposerWallet),
      totalBets: initialBet,
      bets: new Map([[proposerWallet, initialBet]]),
      startedAt: now,
      expiresAt: new Date(now.getTime() + MAX_RAID_DURATION_MS),
      status: 'active',
    };

    this.pendingRaids.set(syndicate.id, raid);

    console.log(
      `[SyndicateRaids] [${syndicate.tag}] proposed raid on ${targetMineId} ` +
      `by ${proposerWallet} (bet: ${initialBet})`
    );

    return { success: true, raidId: id };
  }

  /**
   * Calculate a member's attack power contribution
   */
  private calculateMemberAttackPower(walletAddress: string): number {
    const stakeManager = getStakeManager();
    const state = stakeManager.getMinerState(walletAddress);
    
    if (!state.homeBaseMineId) return 0;

    const stake = stakeManager.getStakeAtMine(walletAddress, state.homeBaseMineId);
    // Base attack power calculation
    return stake * 0.1;
  }

  /**
   * Join a pending syndicate raid
   */
  joinRaid(
    walletAddress: string,
    betAmount: number = 0
  ): { success: boolean; error?: string } {
    const syndicateManager = getSyndicateManager();
    const syndicate = syndicateManager.getMemberSyndicate(walletAddress);
    
    if (!syndicate) {
      return { success: false, error: 'You are not in a syndicate' };
    }

    const raid = this.pendingRaids.get(syndicate.id);
    if (!raid) {
      return { success: false, error: 'No active raid to join' };
    }

    if (raid.participants.includes(walletAddress)) {
      return { success: false, error: 'You are already in this raid' };
    }

    // Validate bet
    const stakeManager = getStakeManager();
    const state = stakeManager.getMinerState(walletAddress);
    if (state.homeBaseMineId && betAmount > 0) {
      const stake = stakeManager.getStakeAtMine(walletAddress, state.homeBaseMineId);
      const maxBet = stake * 0.2;
      if (betAmount > maxBet) {
        return { success: false, error: `Max bet is ${maxBet} COAL (20% of stake)` };
      }
    }

    // Add to raid
    raid.participants.push(walletAddress);
    raid.pooledAttackPower += this.calculateMemberAttackPower(walletAddress) * SYNDICATE_POWER_BONUS;
    raid.totalBets += betAmount;
    raid.bets.set(walletAddress, betAmount);

    console.log(
      `[SyndicateRaids] ${walletAddress} joined raid on ${raid.targetMineId} ` +
      `(bet: ${betAmount}, total power: ${raid.pooledAttackPower.toFixed(0)})`
    );

    return { success: true };
  }

  /**
   * Leave a pending raid
   */
  leaveRaid(walletAddress: string): { success: boolean; error?: string } {
    const syndicateManager = getSyndicateManager();
    const syndicate = syndicateManager.getMemberSyndicate(walletAddress);
    
    if (!syndicate) {
      return { success: false, error: 'You are not in a syndicate' };
    }

    const raid = this.pendingRaids.get(syndicate.id);
    if (!raid) {
      return { success: false, error: 'No active raid' };
    }

    const index = raid.participants.indexOf(walletAddress);
    if (index < 0) {
      return { success: false, error: 'You are not in this raid' };
    }

    // Remove from raid
    raid.participants.splice(index, 1);
    raid.pooledAttackPower -= this.calculateMemberAttackPower(walletAddress) * SYNDICATE_POWER_BONUS;
    
    const bet = raid.bets.get(walletAddress) || 0;
    raid.totalBets -= bet;
    raid.bets.delete(walletAddress);

    // If no participants left, cancel raid
    if (raid.participants.length === 0) {
      this.pendingRaids.delete(syndicate.id);
      console.log(`[SyndicateRaids] Raid on ${raid.targetMineId} cancelled (no participants)`);
    }

    return { success: true };
  }

  /**
   * Launch the raid (move from pending to active)
   * Requires minimum participants
   */
  launchRaid(
    leaderWallet: string
  ): { success: boolean; error?: string } {
    const syndicateManager = getSyndicateManager();
    const syndicate = syndicateManager.getMemberSyndicate(leaderWallet);
    
    if (!syndicate) {
      return { success: false, error: 'You are not in a syndicate' };
    }

    if (!syndicateManager.canManageMembers(leaderWallet)) {
      return { success: false, error: 'Only leaders and officers can launch raids' };
    }

    const raid = this.pendingRaids.get(syndicate.id);
    if (!raid) {
      return { success: false, error: 'No pending raid to launch' };
    }

    if (raid.participants.length < MIN_PARTICIPANTS) {
      return { 
        success: false, 
        error: `Need at least ${MIN_PARTICIPANTS} participants to launch` 
      };
    }

    // Move to active
    this.pendingRaids.delete(syndicate.id);
    this.activeRaids.set(raid.id, raid);

    console.log(
      `[SyndicateRaids] [${syndicate.tag}] launched raid on ${raid.targetMineId} ` +
      `with ${raid.participants.length} members (power: ${raid.pooledAttackPower.toFixed(0)})`
    );

    return { success: true };
  }

  /**
   * Cancel a pending raid
   */
  cancelRaid(walletAddress: string): { success: boolean; error?: string } {
    const syndicateManager = getSyndicateManager();
    const syndicate = syndicateManager.getMemberSyndicate(walletAddress);
    
    if (!syndicate) {
      return { success: false, error: 'You are not in a syndicate' };
    }

    if (!syndicateManager.canManageMembers(walletAddress)) {
      return { success: false, error: 'Only leaders and officers can cancel raids' };
    }

    if (!this.pendingRaids.has(syndicate.id)) {
      return { success: false, error: 'No pending raid to cancel' };
    }

    this.pendingRaids.delete(syndicate.id);
    console.log(`[SyndicateRaids] [${syndicate.tag}] raid cancelled by ${walletAddress}`);

    return { success: true };
  }

  /**
   * Resolve syndicate raid (called when target mine finds a discovery)
   */
  resolveRaid(raidId: string): RaidResult | null {
    const raid = this.activeRaids.get(raidId);
    if (!raid) {
      console.log(`[SyndicateRaids] Raid ${raidId} not found`);
      return null;
    }

    const raidEngine = getRaidEngine();
    const syndicateManager = getSyndicateManager();
    const syndicate = syndicateManager.getSyndicate(raid.syndicateId);

    // Calculate defense power
    const defensePower = raidEngine.calculateMineDefensePower(raid.targetMineId);
    const effectiveDefensePower = defensePower * 1.2; // Defense advantage

    // Syndicate gets coordination bonus
    const attackPower = raid.pooledAttackPower;
    const attackersWon = attackPower > effectiveDefensePower;

    console.log(
      `[SyndicateRaids] Resolving ${syndicate?.tag || 'Unknown'} raid: ` +
      `Attack ${attackPower.toFixed(0)} vs Defense ${defensePower.toFixed(0)} ` +
      `-> ${attackersWon ? 'WIN' : 'LOSE'}`
    );

    const betsReturned = new Map<string, number>();
    const betsBurned = new Map<string, number>();
    let stolenRewards = 0;

    if (attackersWon) {
      // Calculate stolen amount
      const pendingReward = raidEngine.getPendingReward(raid.targetMineId);
      const powerRatio = Math.min(attackPower / effectiveDefensePower, 2.0);
      const stealPercent = 0.1 + (powerRatio - 1) * 0.2;
      stolenRewards = pendingReward * Math.min(stealPercent, 0.3);

      // Return bets with winnings
      for (const [wallet, bet] of raid.bets) {
        if (bet > 0) {
          const share = (bet / raid.totalBets) * stolenRewards * 0.5;
          betsReturned.set(wallet, bet + share);
        }
      }

      // Apply debuff
      getMineRegistry().applyAttackDebuff(raid.targetMineId);

    } else {
      // Burn bets and distribute spoils
      for (const [wallet, bet] of raid.bets) {
        if (bet > 0) {
          const stakeManager = getStakeManager();
          const state = stakeManager.getMinerState(wallet);
          if (state.homeBaseMineId) {
            stakeManager.burnBet(wallet, state.homeBaseMineId, bet);
          }
          betsBurned.set(wallet, bet);
        }
      }

      // Distribute defender spoils (10% to defenders, 90% burned)
      if (raid.totalBets > 0) {
        raidEngine.distributeDefenderSpoils(raidId, raid.targetMineId, raid.totalBets);
      }

      // Apply defense buff
      getMineRegistry().applyDefenseBuff(raid.targetMineId);
    }

    // Mark raid as completed
    raid.status = 'completed';
    this.activeRaids.delete(raidId);

    const result: RaidResult = {
      expeditionId: raidId,
      attackersWon,
      stolenRewards,
      defensePower,
      attackPower,
      betsReturned,
      betsBurned,
      resolvedAt: new Date(),
    };

    // Store in history
    this.raidHistory.push({ ...raid, result });
    if (this.raidHistory.length > 100) {
      this.raidHistory.shift();
    }

    return result;
  }

  /**
   * Resolve all active syndicate raids against a mine
   */
  resolveAllRaids(mineId: string): RaidResult[] {
    const results: RaidResult[] = [];
    
    for (const [raidId, raid] of this.activeRaids) {
      if (raid.targetMineId === mineId) {
        const result = this.resolveRaid(raidId);
        if (result) {
          results.push(result);
        }
      }
    }

    return results;
  }

  /**
   * Distribute raid rewards to syndicate participants
   */
  distributeRewards(
    raidId: string,
    result: RaidResult
  ): Map<string, number> {
    const raid = this.raidHistory.find(r => r.id === raidId);
    if (!raid || !result.attackersWon || result.stolenRewards <= 0) {
      return new Map();
    }

    const syndicateManager = getSyndicateManager();
    const syndicate = syndicateManager.getSyndicate(raid.syndicateId);
    if (!syndicate) {
      return new Map();
    }

    const rewards = new Map<string, number>();
    const treasuryShare = result.stolenRewards * (syndicate.settings.rewardSplit / 100);
    const participantPool = result.stolenRewards - treasuryShare;

    // Base equal share
    const baseShare = participantPool * 0.5 / raid.participants.length;
    
    // Bet-weighted share
    const betPool = participantPool * 0.5;
    
    for (const wallet of raid.participants) {
      let share = baseShare;
      
      if (raid.totalBets > 0) {
        const bet = raid.bets.get(wallet) || 0;
        share += (bet / raid.totalBets) * betPool;
      }
      
      rewards.set(wallet, share);
    }

    // Add to syndicate treasury
    if (treasuryShare > 0) {
      syndicate.treasury += treasuryShare;
    }

    return rewards;
  }

  /**
   * Get pending raid for a syndicate
   */
  getPendingRaid(syndicateId: string): SyndicateRaid | undefined {
    return this.pendingRaids.get(syndicateId);
  }

  /**
   * Get active raids for a syndicate
   */
  getActiveRaids(syndicateId: string): SyndicateRaid[] {
    const raids: SyndicateRaid[] = [];
    for (const raid of this.activeRaids.values()) {
      if (raid.syndicateId === syndicateId) {
        raids.push(raid);
      }
    }
    return raids;
  }

  /**
   * Get all active raids targeting a mine
   */
  getRaidsTargeting(mineId: string): SyndicateRaid[] {
    const raids: SyndicateRaid[] = [];
    for (const raid of this.activeRaids.values()) {
      if (raid.targetMineId === mineId) {
        raids.push(raid);
      }
    }
    return raids;
  }

  /**
   * Clean up expired raids
   */
  cleanupExpiredRaids(): void {
    const now = Date.now();

    for (const [syndicateId, raid] of this.pendingRaids) {
      if (raid.expiresAt.getTime() < now) {
        this.pendingRaids.delete(syndicateId);
        console.log(`[SyndicateRaids] Pending raid expired for syndicate ${syndicateId}`);
      }
    }

    for (const [raidId, raid] of this.activeRaids) {
      if (raid.expiresAt.getTime() < now) {
        raid.status = 'failed';
        this.activeRaids.delete(raidId);
        this.raidHistory.push(raid);
        console.log(`[SyndicateRaids] Active raid ${raidId} expired`);
      }
    }
  }

  /**
   * Get statistics
   */
  getStats(): {
    pendingRaids: number;
    activeRaids: number;
    totalRaids: number;
    winRate: number;
  } {
    let wins = 0;
    let total = 0;
    
    for (const raid of this.raidHistory) {
      if (raid.result) {
        total++;
        if (raid.result.attackersWon) wins++;
      }
    }

    return {
      pendingRaids: this.pendingRaids.size,
      activeRaids: this.activeRaids.size,
      totalRaids: total,
      winRate: total > 0 ? (wins / total) * 100 : 0,
    };
  }
}

// Singleton instance
let syndicateRaidsInstance: SyndicateRaidsManager | null = null;

export function getSyndicateRaidsManager(): SyndicateRaidsManager {
  if (!syndicateRaidsInstance) {
    syndicateRaidsInstance = new SyndicateRaidsManager();
  }
  return syndicateRaidsInstance;
}

export function resetSyndicateRaidsManager(): void {
  syndicateRaidsInstance = null;
}
