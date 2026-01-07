/**
 * @fileoverview Syndicate Manager for Black Gold v2
 * Manages player alliances (syndicates) for coordinated gameplay
 * 
 * Features:
 * - Create syndicates (costs 1000 COAL, burned)
 * - Join/leave syndicates
 * - Invite/kick members (officers and leaders)
 * - Promote/demote members
 * - Treasury management
 * - Settings configuration
 */

import { 
  Syndicate, 
  SyndicateSettings, 
  SyndicateMember, 
  SyndicateRole,
  SYNDICATE_CREATION_COST 
} from './types';
import { getStakeManager } from './stake-manager';

/** Maximum syndicate name length */
const MAX_NAME_LENGTH = 24;

/** Maximum tag length */
const MAX_TAG_LENGTH = 4;

/** Minimum tag length */
const MIN_TAG_LENGTH = 2;

/** Maximum members per syndicate */
const MAX_MEMBERS = 50;

/** Maximum officers per syndicate (excluding leader) */
const MAX_OFFICERS = 5;

/** Treasury split limits */
const MIN_TREASURY_SPLIT = 0;
const MAX_TREASURY_SPLIT = 30;

/**
 * Syndicate Manager class
 */
export class SyndicateManager {
  /** All syndicates by ID */
  private syndicates: Map<string, Syndicate> = new Map();

  /** Map of wallet to syndicate ID for quick lookup */
  private memberToSyndicate: Map<string, string> = new Map();

  /** Pending invites (wallet -> syndicate ID) */
  private pendingInvites: Map<string, Set<string>> = new Map();

  /** Reserved tags to prevent duplicates */
  private reservedTags: Set<string> = new Set();

  /** Total syndicates created */
  private totalCreated: number = 0;

  /** Total burned from syndicate creation */
  private totalBurned: number = 0;

  /**
   * Generate unique syndicate ID
   */
  private generateId(): string {
    return `syn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Validate syndicate name
   */
  private validateName(name: string): { valid: boolean; error?: string } {
    if (!name || name.trim().length === 0) {
      return { valid: false, error: 'Name is required' };
    }
    if (name.length > MAX_NAME_LENGTH) {
      return { valid: false, error: `Name must be ${MAX_NAME_LENGTH} characters or less` };
    }
    if (!/^[a-zA-Z0-9 _-]+$/.test(name)) {
      return { valid: false, error: 'Name can only contain letters, numbers, spaces, underscores, and hyphens' };
    }
    return { valid: true };
  }

  /**
   * Validate syndicate tag
   */
  private validateTag(tag: string): { valid: boolean; error?: string } {
    if (!tag || tag.trim().length === 0) {
      return { valid: false, error: 'Tag is required' };
    }
    if (tag.length < MIN_TAG_LENGTH || tag.length > MAX_TAG_LENGTH) {
      return { valid: false, error: `Tag must be ${MIN_TAG_LENGTH}-${MAX_TAG_LENGTH} characters` };
    }
    if (!/^[a-zA-Z0-9]+$/.test(tag)) {
      return { valid: false, error: 'Tag can only contain letters and numbers' };
    }
    const upperTag = tag.toUpperCase();
    if (this.reservedTags.has(upperTag)) {
      return { valid: false, error: 'Tag is already taken' };
    }
    return { valid: true };
  }

  /**
   * Create a new syndicate
   * Costs 1000 COAL (burned)
   */
  createSyndicate(
    founderWallet: string,
    name: string,
    tag: string
  ): { success: boolean; syndicateId?: string; error?: string } {
    // Check if already in a syndicate
    if (this.memberToSyndicate.has(founderWallet)) {
      return { success: false, error: 'You must leave your current syndicate first' };
    }

    // Validate name
    const nameValidation = this.validateName(name);
    if (!nameValidation.valid) {
      return { success: false, error: nameValidation.error };
    }

    // Validate tag
    const tagValidation = this.validateTag(tag);
    if (!tagValidation.valid) {
      return { success: false, error: tagValidation.error };
    }

    // Check if founder has enough stake to burn for creation
    const stakeManager = getStakeManager();
    const totalStake = stakeManager.getTotalStake(founderWallet);
    if (totalStake < SYNDICATE_CREATION_COST) {
      return { 
        success: false, 
        error: `Requires ${SYNDICATE_CREATION_COST} COAL stake to create syndicate` 
      };
    }

    // Burn creation cost from founder's largest stake
    const stakes = stakeManager.getWalletStakes(founderWallet);
    if (stakes.length > 0) {
      // Sort by amount descending
      stakes.sort((a, b) => b.amount - a.amount);
      let remaining = SYNDICATE_CREATION_COST;
      
      for (const stake of stakes) {
        if (remaining <= 0) break;
        const toUnstake = Math.min(stake.amount, remaining);
        stakeManager.unstake(founderWallet, stake.mineId, toUnstake);
        remaining -= toUnstake;
      }
    }
    this.totalBurned += SYNDICATE_CREATION_COST;

    // Create syndicate
    const id = this.generateId();
    const upperTag = tag.toUpperCase();
    
    const founder: SyndicateMember = {
      walletAddress: founderWallet,
      role: 'leader',
      joinedAt: new Date(),
      totalContributed: 0,
    };

    const syndicate: Syndicate = {
      id,
      name: name.trim(),
      tag: upperTag,
      leaderId: founderWallet,
      members: new Map([[founderWallet, founder]]),
      createdAt: new Date(),
      treasury: 0,
      settings: {
        rewardSplit: 0,
        raidCoordination: true,
        defenseAlerts: true,
      },
      activeWars: [],
      warWins: 0,
      warLosses: 0,
    };

    this.syndicates.set(id, syndicate);
    this.memberToSyndicate.set(founderWallet, id);
    this.reservedTags.add(upperTag);
    this.totalCreated++;

    console.log(
      `[Syndicate] Created [${upperTag}] ${name} by ${founderWallet} ` +
      `(burned ${SYNDICATE_CREATION_COST} COAL)`
    );

    return { success: true, syndicateId: id };
  }

  /**
   * Get syndicate by ID
   */
  getSyndicate(syndicateId: string): Syndicate | undefined {
    return this.syndicates.get(syndicateId);
  }

  /**
   * Get syndicate for a wallet
   */
  getMemberSyndicate(walletAddress: string): Syndicate | undefined {
    const syndicateId = this.memberToSyndicate.get(walletAddress);
    if (!syndicateId) return undefined;
    return this.syndicates.get(syndicateId);
  }

  /**
   * Get member's role in their syndicate
   */
  getMemberRole(walletAddress: string): SyndicateRole | null {
    const syndicate = this.getMemberSyndicate(walletAddress);
    if (!syndicate) return null;
    const member = syndicate.members.get(walletAddress);
    return member?.role || null;
  }

  /**
   * Check if wallet can manage members (leader or officer)
   */
  canManageMembers(walletAddress: string): boolean {
    const role = this.getMemberRole(walletAddress);
    return role === 'leader' || role === 'officer';
  }

  /**
   * Invite a player to syndicate
   */
  invitePlayer(
    inviterWallet: string,
    targetWallet: string
  ): { success: boolean; error?: string } {
    if (!this.canManageMembers(inviterWallet)) {
      return { success: false, error: 'Only leaders and officers can invite members' };
    }

    const syndicate = this.getMemberSyndicate(inviterWallet);
    if (!syndicate) {
      return { success: false, error: 'You are not in a syndicate' };
    }

    if (syndicate.members.size >= MAX_MEMBERS) {
      return { success: false, error: `Syndicate is full (max ${MAX_MEMBERS} members)` };
    }

    if (this.memberToSyndicate.has(targetWallet)) {
      return { success: false, error: 'Player is already in a syndicate' };
    }

    // Add to pending invites
    let invites = this.pendingInvites.get(targetWallet);
    if (!invites) {
      invites = new Set();
      this.pendingInvites.set(targetWallet, invites);
    }
    invites.add(syndicate.id);

    console.log(`[Syndicate] ${inviterWallet} invited ${targetWallet} to [${syndicate.tag}]`);
    return { success: true };
  }

  /**
   * Get pending invites for a wallet
   */
  getPendingInvites(walletAddress: string): Syndicate[] {
    const invites = this.pendingInvites.get(walletAddress);
    if (!invites) return [];

    const syndicates: Syndicate[] = [];
    for (const syndicateId of invites) {
      const syndicate = this.syndicates.get(syndicateId);
      if (syndicate) {
        syndicates.push(syndicate);
      }
    }
    return syndicates;
  }

  /**
   * Accept syndicate invite
   */
  acceptInvite(
    walletAddress: string,
    syndicateId: string
  ): { success: boolean; error?: string } {
    const invites = this.pendingInvites.get(walletAddress);
    if (!invites || !invites.has(syndicateId)) {
      return { success: false, error: 'No pending invite from this syndicate' };
    }

    if (this.memberToSyndicate.has(walletAddress)) {
      return { success: false, error: 'You must leave your current syndicate first' };
    }

    const syndicate = this.syndicates.get(syndicateId);
    if (!syndicate) {
      return { success: false, error: 'Syndicate no longer exists' };
    }

    if (syndicate.members.size >= MAX_MEMBERS) {
      return { success: false, error: 'Syndicate is full' };
    }

    // Add member
    const member: SyndicateMember = {
      walletAddress,
      role: 'member',
      joinedAt: new Date(),
      totalContributed: 0,
    };
    syndicate.members.set(walletAddress, member);
    this.memberToSyndicate.set(walletAddress, syndicateId);

    // Clear all pending invites
    this.pendingInvites.delete(walletAddress);

    console.log(`[Syndicate] ${walletAddress} joined [${syndicate.tag}] ${syndicate.name}`);
    return { success: true };
  }

  /**
   * Decline syndicate invite
   */
  declineInvite(walletAddress: string, syndicateId: string): void {
    const invites = this.pendingInvites.get(walletAddress);
    if (invites) {
      invites.delete(syndicateId);
      if (invites.size === 0) {
        this.pendingInvites.delete(walletAddress);
      }
    }
  }

  /**
   * Leave syndicate
   */
  leaveSyndicate(walletAddress: string): { success: boolean; error?: string } {
    const syndicate = this.getMemberSyndicate(walletAddress);
    if (!syndicate) {
      return { success: false, error: 'You are not in a syndicate' };
    }

    if (syndicate.leaderId === walletAddress) {
      // Leader leaving - must transfer or disband
      if (syndicate.members.size > 1) {
        return { 
          success: false, 
          error: 'Leaders must transfer leadership or disband before leaving' 
        };
      }
      // Last member, disband
      return this.disbandSyndicate(walletAddress);
    }

    syndicate.members.delete(walletAddress);
    this.memberToSyndicate.delete(walletAddress);

    console.log(`[Syndicate] ${walletAddress} left [${syndicate.tag}]`);
    return { success: true };
  }

  /**
   * Kick a member from syndicate
   */
  kickMember(
    kickerWallet: string,
    targetWallet: string
  ): { success: boolean; error?: string } {
    const syndicate = this.getMemberSyndicate(kickerWallet);
    if (!syndicate) {
      return { success: false, error: 'You are not in a syndicate' };
    }

    const kickerRole = this.getMemberRole(kickerWallet);
    const targetRole = this.getMemberRole(targetWallet);

    // Leaders can kick anyone, officers can only kick members
    if (kickerRole === 'leader') {
      if (targetWallet === kickerWallet) {
        return { success: false, error: 'Cannot kick yourself' };
      }
    } else if (kickerRole === 'officer') {
      if (targetRole !== 'member') {
        return { success: false, error: 'Officers can only kick regular members' };
      }
    } else {
      return { success: false, error: 'Only leaders and officers can kick members' };
    }

    if (!syndicate.members.has(targetWallet)) {
      return { success: false, error: 'Player is not in your syndicate' };
    }

    syndicate.members.delete(targetWallet);
    this.memberToSyndicate.delete(targetWallet);

    console.log(`[Syndicate] ${kickerWallet} kicked ${targetWallet} from [${syndicate.tag}]`);
    return { success: true };
  }

  /**
   * Promote member to officer
   */
  promoteMember(
    leaderWallet: string,
    targetWallet: string
  ): { success: boolean; error?: string } {
    const syndicate = this.getMemberSyndicate(leaderWallet);
    if (!syndicate || syndicate.leaderId !== leaderWallet) {
      return { success: false, error: 'Only the leader can promote members' };
    }

    const member = syndicate.members.get(targetWallet);
    if (!member) {
      return { success: false, error: 'Player is not in your syndicate' };
    }

    if (member.role !== 'member') {
      return { success: false, error: 'Player is already an officer or leader' };
    }

    // Check officer limit
    let officerCount = 0;
    for (const m of syndicate.members.values()) {
      if (m.role === 'officer') officerCount++;
    }
    if (officerCount >= MAX_OFFICERS) {
      return { success: false, error: `Maximum ${MAX_OFFICERS} officers allowed` };
    }

    member.role = 'officer';
    console.log(`[Syndicate] ${targetWallet} promoted to officer in [${syndicate.tag}]`);
    return { success: true };
  }

  /**
   * Demote officer to member
   */
  demoteMember(
    leaderWallet: string,
    targetWallet: string
  ): { success: boolean; error?: string } {
    const syndicate = this.getMemberSyndicate(leaderWallet);
    if (!syndicate || syndicate.leaderId !== leaderWallet) {
      return { success: false, error: 'Only the leader can demote officers' };
    }

    const member = syndicate.members.get(targetWallet);
    if (!member) {
      return { success: false, error: 'Player is not in your syndicate' };
    }

    if (member.role !== 'officer') {
      return { success: false, error: 'Player is not an officer' };
    }

    member.role = 'member';
    console.log(`[Syndicate] ${targetWallet} demoted to member in [${syndicate.tag}]`);
    return { success: true };
  }

  /**
   * Transfer leadership
   */
  transferLeadership(
    currentLeader: string,
    newLeader: string
  ): { success: boolean; error?: string } {
    const syndicate = this.getMemberSyndicate(currentLeader);
    if (!syndicate || syndicate.leaderId !== currentLeader) {
      return { success: false, error: 'Only the leader can transfer leadership' };
    }

    const newLeaderMember = syndicate.members.get(newLeader);
    if (!newLeaderMember) {
      return { success: false, error: 'New leader must be a syndicate member' };
    }

    // Update roles
    const oldLeaderMember = syndicate.members.get(currentLeader);
    if (oldLeaderMember) {
      oldLeaderMember.role = 'officer';
    }
    newLeaderMember.role = 'leader';
    syndicate.leaderId = newLeader;

    console.log(`[Syndicate] Leadership of [${syndicate.tag}] transferred to ${newLeader}`);
    return { success: true };
  }

  /**
   * Disband syndicate (leader only)
   */
  disbandSyndicate(leaderWallet: string): { success: boolean; error?: string } {
    const syndicate = this.getMemberSyndicate(leaderWallet);
    if (!syndicate || syndicate.leaderId !== leaderWallet) {
      return { success: false, error: 'Only the leader can disband the syndicate' };
    }

    // Remove all members
    for (const walletAddress of syndicate.members.keys()) {
      this.memberToSyndicate.delete(walletAddress);
    }

    // Free the tag
    this.reservedTags.delete(syndicate.tag);

    // Remove syndicate
    this.syndicates.delete(syndicate.id);

    console.log(`[Syndicate] [${syndicate.tag}] ${syndicate.name} disbanded by ${leaderWallet}`);
    return { success: true };
  }

  /**
   * Update syndicate settings (leader only)
   */
  updateSettings(
    leaderWallet: string,
    settings: Partial<SyndicateSettings>
  ): { success: boolean; error?: string } {
    const syndicate = this.getMemberSyndicate(leaderWallet);
    if (!syndicate || syndicate.leaderId !== leaderWallet) {
      return { success: false, error: 'Only the leader can update settings' };
    }

    if (settings.rewardSplit !== undefined) {
      if (settings.rewardSplit < MIN_TREASURY_SPLIT || settings.rewardSplit > MAX_TREASURY_SPLIT) {
        return { 
          success: false, 
          error: `Reward split must be ${MIN_TREASURY_SPLIT}-${MAX_TREASURY_SPLIT}%` 
        };
      }
      syndicate.settings.rewardSplit = settings.rewardSplit;
    }

    if (settings.raidCoordination !== undefined) {
      syndicate.settings.raidCoordination = settings.raidCoordination;
    }

    if (settings.defenseAlerts !== undefined) {
      syndicate.settings.defenseAlerts = settings.defenseAlerts;
    }

    console.log(`[Syndicate] [${syndicate.tag}] settings updated`);
    return { success: true };
  }

  /**
   * Deposit to syndicate treasury
   */
  depositToTreasury(
    walletAddress: string,
    amount: number
  ): { success: boolean; error?: string } {
    const syndicate = this.getMemberSyndicate(walletAddress);
    if (!syndicate) {
      return { success: false, error: 'You are not in a syndicate' };
    }

    if (amount <= 0) {
      return { success: false, error: 'Amount must be positive' };
    }

    // In production, this would deduct from wallet balance
    syndicate.treasury += amount;

    const member = syndicate.members.get(walletAddress);
    if (member) {
      member.totalContributed += amount;
    }

    console.log(`[Syndicate] ${walletAddress} deposited ${amount} to [${syndicate.tag}] treasury`);
    return { success: true };
  }

  /**
   * Withdraw from syndicate treasury (leader only)
   */
  withdrawFromTreasury(
    leaderWallet: string,
    amount: number,
    recipientWallet: string
  ): { success: boolean; error?: string } {
    const syndicate = this.getMemberSyndicate(leaderWallet);
    if (!syndicate || syndicate.leaderId !== leaderWallet) {
      return { success: false, error: 'Only the leader can withdraw from treasury' };
    }

    if (amount <= 0 || amount > syndicate.treasury) {
      return { success: false, error: 'Invalid amount' };
    }

    syndicate.treasury -= amount;
    // In production, this would send tokens to recipient

    console.log(
      `[Syndicate] ${leaderWallet} withdrew ${amount} from [${syndicate.tag}] ` +
      `treasury to ${recipientWallet}`
    );
    return { success: true };
  }

  /**
   * Get all syndicates (for browsing)
   */
  getAllSyndicates(): Syndicate[] {
    return Array.from(this.syndicates.values());
  }

  /**
   * Search syndicates by name or tag
   */
  searchSyndicates(query: string): Syndicate[] {
    const lowerQuery = query.toLowerCase();
    return this.getAllSyndicates().filter(s => 
      s.name.toLowerCase().includes(lowerQuery) ||
      s.tag.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Get syndicate leaderboard (by member count or wins)
   */
  getLeaderboard(sortBy: 'members' | 'wins' = 'members', limit: number = 10): Syndicate[] {
    const syndicates = this.getAllSyndicates();
    
    if (sortBy === 'members') {
      syndicates.sort((a, b) => b.members.size - a.members.size);
    } else {
      syndicates.sort((a, b) => b.warWins - a.warWins);
    }
    
    return syndicates.slice(0, limit);
  }

  /**
   * Get manager statistics
   */
  getStats(): {
    totalSyndicates: number;
    totalMembers: number;
    totalCreated: number;
    totalBurned: number;
    averageSize: number;
  } {
    let totalMembers = 0;
    for (const syndicate of this.syndicates.values()) {
      totalMembers += syndicate.members.size;
    }

    return {
      totalSyndicates: this.syndicates.size,
      totalMembers,
      totalCreated: this.totalCreated,
      totalBurned: this.totalBurned,
      averageSize: this.syndicates.size > 0 ? totalMembers / this.syndicates.size : 0,
    };
  }
}

// Singleton instance
let syndicateManagerInstance: SyndicateManager | null = null;

export function getSyndicateManager(): SyndicateManager {
  if (!syndicateManagerInstance) {
    syndicateManagerInstance = new SyndicateManager();
  }
  return syndicateManagerInstance;
}

export function resetSyndicateManager(): void {
  syndicateManagerInstance = null;
}
