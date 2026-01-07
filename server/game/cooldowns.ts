/**
 * @fileoverview Cooldown Manager for Black Gold v2
 * Manages all cooldown timers for expeditions, home base switches, etc.
 */

import { Cooldown, CooldownType, COOLDOWN_DURATIONS } from './types';

/**
 * Cooldown Manager class
 * Tracks and enforces cooldowns for game actions
 */
export class CooldownManager {
  /** Cooldowns by wallet address */
  private cooldowns: Map<string, Cooldown[]> = new Map();

  /**
   * Check if a wallet has an active cooldown of a specific type
   */
  hasCooldown(walletAddress: string, type: CooldownType): boolean {
    const walletCooldowns = this.cooldowns.get(walletAddress);
    if (!walletCooldowns) return false;

    const now = new Date();
    return walletCooldowns.some(cd => cd.type === type && cd.expiresAt > now);
  }

  /**
   * Get remaining cooldown time in milliseconds
   */
  getRemainingCooldown(walletAddress: string, type: CooldownType): number {
    const walletCooldowns = this.cooldowns.get(walletAddress);
    if (!walletCooldowns) return 0;

    const now = new Date();
    const cooldown = walletCooldowns.find(cd => cd.type === type && cd.expiresAt > now);
    
    if (!cooldown) return 0;
    return Math.max(0, cooldown.expiresAt.getTime() - now.getTime());
  }

  /**
   * Apply a cooldown to a wallet
   */
  applyCooldown(walletAddress: string, type: CooldownType): void {
    let walletCooldowns = this.cooldowns.get(walletAddress);
    if (!walletCooldowns) {
      walletCooldowns = [];
      this.cooldowns.set(walletAddress, walletCooldowns);
    }

    // Remove existing cooldown of same type
    const existingIndex = walletCooldowns.findIndex(cd => cd.type === type);
    if (existingIndex >= 0) {
      walletCooldowns.splice(existingIndex, 1);
    }

    // Add new cooldown
    const duration = COOLDOWN_DURATIONS[type];
    const cooldown: Cooldown = {
      walletAddress,
      type,
      expiresAt: new Date(Date.now() + duration),
    };

    walletCooldowns.push(cooldown);

    console.log(
      `[CooldownManager] Applied ${type} cooldown to ${walletAddress} ` +
      `(expires in ${Math.round(duration / 60000)} minutes)`
    );
  }

  /**
   * Clear a specific cooldown (for admin/testing)
   */
  clearCooldown(walletAddress: string, type: CooldownType): void {
    const walletCooldowns = this.cooldowns.get(walletAddress);
    if (!walletCooldowns) return;

    const index = walletCooldowns.findIndex(cd => cd.type === type);
    if (index >= 0) {
      walletCooldowns.splice(index, 1);
    }
  }

  /**
   * Clear all cooldowns for a wallet
   */
  clearAllCooldowns(walletAddress: string): void {
    this.cooldowns.delete(walletAddress);
  }

  /**
   * Get all active cooldowns for a wallet
   */
  getActiveCooldowns(walletAddress: string): Cooldown[] {
    const walletCooldowns = this.cooldowns.get(walletAddress);
    if (!walletCooldowns) return [];

    const now = new Date();
    return walletCooldowns.filter(cd => cd.expiresAt > now);
  }

  /**
   * Clean up expired cooldowns (call periodically)
   */
  cleanupExpired(): void {
    const now = new Date();
    let cleaned = 0;

    for (const [walletAddress, cooldowns] of this.cooldowns) {
      const activeCount = cooldowns.length;
      const filtered = cooldowns.filter(cd => cd.expiresAt > now);
      cleaned += activeCount - filtered.length;

      if (filtered.length === 0) {
        this.cooldowns.delete(walletAddress);
      } else {
        this.cooldowns.set(walletAddress, filtered);
      }
    }

    if (cleaned > 0) {
      console.log(`[CooldownManager] Cleaned up ${cleaned} expired cooldowns`);
    }
  }

  /**
   * Check if an action is allowed (no active cooldown)
   * Returns error message if blocked, null if allowed
   */
  checkAction(walletAddress: string, type: CooldownType): string | null {
    if (!this.hasCooldown(walletAddress, type)) {
      return null;
    }

    const remaining = this.getRemainingCooldown(walletAddress, type);
    const minutes = Math.ceil(remaining / 60000);
    const hours = Math.floor(minutes / 60);

    let timeStr: string;
    if (hours > 0) {
      timeStr = `${hours}h ${minutes % 60}m`;
    } else {
      timeStr = `${minutes}m`;
    }

    const actionNames: Record<CooldownType, string> = {
      home_base_switch: 'switch home base',
      expedition_start: 'start an expedition',
      expedition_recovery: 'start another expedition',
      rally_defense: 'rally defense',
    };

    return `Cannot ${actionNames[type]} for another ${timeStr}`;
  }
}

// Singleton instance
let cooldownManagerInstance: CooldownManager | null = null;

export function getCooldownManager(): CooldownManager {
  if (!cooldownManagerInstance) {
    cooldownManagerInstance = new CooldownManager();
  }
  return cooldownManagerInstance;
}

export function resetCooldownManager(): void {
  cooldownManagerInstance = null;
}
