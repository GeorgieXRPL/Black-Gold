/**
 * @fileoverview Raid Bet Escrow System for Black Gold
 * 
 * Manages raid bet locking separate from Quarry staking:
 * - Bets are locked when raids start (can't escape mid-raid)
 * - Resolved when raid ends (winner gets back + winnings, loser burned)
 * - Uses simple SPL transfers to escrow wallet
 * 
 * Architecture:
 * - Quarry = Staking (instant unstake OK, affects defense power)
 * - BetEscrow = Raid bets (locked until raid resolves)
 */

import { PublicKey } from '@solana/web3.js';
import { TOKEN_CONFIG } from '../../config/constants';

/**
 * Bet status in the escrow system
 */
export type BetStatus = 'pending' | 'locked' | 'won' | 'lost' | 'returned' | 'burned';

/**
 * Individual bet record
 */
export interface BetRecord {
  id: string;
  raidId: string;
  walletAddress: string;
  mineId: string;
  amount: number;
  side: 'attacker' | 'defender';
  status: BetStatus;
  createdAt: Date;
  resolvedAt: Date | null;
  txSignature: string | null; // Deposit tx signature
  returnTxSignature: string | null; // Return/burn tx signature
}

/**
 * Raid bet pool (all bets for a single raid)
 */
export interface RaidBetPool {
  raidId: string;
  targetMineId: string;
  sourceMineId: string;
  attackerBets: Map<string, BetRecord>; // wallet -> bet
  totalAttackerBets: number;
  status: 'active' | 'resolved';
  createdAt: Date;
  resolvedAt: Date | null;
  winningSide: 'attacker' | 'defender' | null;
}

/**
 * Escrow resolution result
 */
export interface EscrowResolution {
  raidId: string;
  winningSide: 'attacker' | 'defender';
  totalBurned: number;
  totalReturnedToWinners: number;
  totalDistributedToDefenders: number;
  winnerPayouts: Map<string, number>; // wallet -> amount
  defenderPayouts: Map<string, number>; // wallet -> amount
}

/**
 * Bet Escrow Manager
 * Handles all raid bet operations
 */
export class BetEscrowManager {
  /** Active raid bet pools */
  private raidPools: Map<string, RaidBetPool> = new Map();
  
  /** All bets by wallet (for quick lookup) */
  private betsByWallet: Map<string, Set<string>> = new Map(); // wallet -> Set<betId>
  
  /** All bet records */
  private bets: Map<string, BetRecord> = new Map(); // betId -> BetRecord
  
  /** Escrow wallet address (configured externally) */
  private escrowWallet: string;
  
  constructor() {
    this.escrowWallet = process.env.BET_ESCROW_WALLET || '';
    if (!this.escrowWallet) {
      console.warn('[BetEscrow] BET_ESCROW_WALLET not configured - using placeholder');
      this.escrowWallet = 'ESCROW_WALLET_NOT_SET';
    }
  }

  /**
   * Get the escrow wallet address
   */
  getEscrowWallet(): string {
    return this.escrowWallet;
  }

  /**
   * Create a new raid bet pool
   */
  createRaidPool(
    raidId: string,
    targetMineId: string,
    sourceMineId: string
  ): RaidBetPool {
    if (this.raidPools.has(raidId)) {
      throw new Error(`Raid pool ${raidId} already exists`);
    }

    const pool: RaidBetPool = {
      raidId,
      targetMineId,
      sourceMineId,
      attackerBets: new Map(),
      totalAttackerBets: 0,
      status: 'active',
      createdAt: new Date(),
      resolvedAt: null,
      winningSide: null,
    };

    this.raidPools.set(raidId, pool);
    console.log(`[BetEscrow] Created raid pool: ${raidId}`);
    return pool;
  }

  /**
   * Place a bet for a raid
   * 
   * @param raidId - The raid ID
   * @param walletAddress - Bettor's wallet
   * @param mineId - The mine being bet on
   * @param amount - Bet amount in COAL
   * @param side - Which side the bet is on
   * @param txSignature - The SPL transfer signature (for verification)
   */
  placeBet(
    raidId: string,
    walletAddress: string,
    mineId: string,
    amount: number,
    side: 'attacker' | 'defender',
    txSignature: string
  ): BetRecord {
    const pool = this.raidPools.get(raidId);
    if (!pool) {
      throw new Error(`Raid pool ${raidId} not found`);
    }

    if (pool.status !== 'active') {
      throw new Error(`Raid ${raidId} is no longer accepting bets`);
    }

    // Check if wallet already has a bet on this raid
    if (pool.attackerBets.has(walletAddress)) {
      throw new Error(`Wallet ${walletAddress} already has a bet on raid ${raidId}`);
    }

    const betId = `bet_${raidId}_${walletAddress}_${Date.now()}`;
    
    const bet: BetRecord = {
      id: betId,
      raidId,
      walletAddress,
      mineId,
      amount,
      side,
      status: 'locked',
      createdAt: new Date(),
      resolvedAt: null,
      txSignature,
      returnTxSignature: null,
    };

    // Store bet
    this.bets.set(betId, bet);
    
    // Add to pool
    if (side === 'attacker') {
      pool.attackerBets.set(walletAddress, bet);
      pool.totalAttackerBets += amount;
    }

    // Track by wallet
    let walletBets = this.betsByWallet.get(walletAddress);
    if (!walletBets) {
      walletBets = new Set();
      this.betsByWallet.set(walletAddress, walletBets);
    }
    walletBets.add(betId);

    console.log(
      `[BetEscrow] Bet placed: ${walletAddress} bet ${amount} COAL on ${side} ` +
      `for raid ${raidId}`
    );

    return bet;
  }

  /**
   * Check if a wallet has locked bets (can't unstake from Quarry)
   * Note: With new architecture, unstaking from Quarry is OK - bet is separate
   */
  hasLockedBets(walletAddress: string): boolean {
    const walletBets = this.betsByWallet.get(walletAddress);
    if (!walletBets) return false;

    for (const betId of walletBets) {
      const bet = this.bets.get(betId);
      if (bet && bet.status === 'locked') {
        return true;
      }
    }
    return false;
  }

  /**
   * Get total locked bet amount for a wallet
   */
  getLockedBetAmount(walletAddress: string): number {
    const walletBets = this.betsByWallet.get(walletAddress);
    if (!walletBets) return 0;

    let total = 0;
    for (const betId of walletBets) {
      const bet = this.bets.get(betId);
      if (bet && bet.status === 'locked') {
        total += bet.amount;
      }
    }
    return total;
  }

  /**
   * Get all active bets for a wallet
   */
  getActiveBets(walletAddress: string): BetRecord[] {
    const walletBets = this.betsByWallet.get(walletAddress);
    if (!walletBets) return [];

    const activeBets: BetRecord[] = [];
    for (const betId of walletBets) {
      const bet = this.bets.get(betId);
      if (bet && bet.status === 'locked') {
        activeBets.push(bet);
      }
    }
    return activeBets;
  }

  /**
   * Resolve a raid and distribute bets
   * 
   * @param raidId - The raid to resolve
   * @param winningSide - Which side won
   * @param defenderStakes - Map of defender wallet -> stake amount (for weighted distribution)
   */
  resolveRaid(
    raidId: string,
    winningSide: 'attacker' | 'defender',
    defenderStakes: Map<string, number>
  ): EscrowResolution {
    const pool = this.raidPools.get(raidId);
    if (!pool) {
      throw new Error(`Raid pool ${raidId} not found`);
    }

    if (pool.status !== 'active') {
      throw new Error(`Raid ${raidId} already resolved`);
    }

    const resolution: EscrowResolution = {
      raidId,
      winningSide,
      totalBurned: 0,
      totalReturnedToWinners: 0,
      totalDistributedToDefenders: 0,
      winnerPayouts: new Map(),
      defenderPayouts: new Map(),
    };

    // Process attacker bets
    for (const [walletAddress, bet] of pool.attackerBets) {
      if (winningSide === 'attacker') {
        // Attackers won - return bet + share of stolen rewards
        // (Actual stolen amount calculated elsewhere, here we just return bets)
        bet.status = 'won';
        bet.resolvedAt = new Date();
        resolution.totalReturnedToWinners += bet.amount;
        resolution.winnerPayouts.set(walletAddress, bet.amount);
      } else {
        // Defenders won - burn 90% of bet, 10% to defenders
        bet.status = 'lost';
        bet.resolvedAt = new Date();
        
        const burnAmount = Math.floor(bet.amount * 0.9);
        const defenderShare = bet.amount - burnAmount;
        
        resolution.totalBurned += burnAmount;
        resolution.totalDistributedToDefenders += defenderShare;
      }
    }

    // Distribute defender spoils (10% of lost bets, weighted by stake)
    if (winningSide === 'defender' && resolution.totalDistributedToDefenders > 0) {
      const totalDefenderStake = Array.from(defenderStakes.values()).reduce((a, b) => a + b, 0);
      
      if (totalDefenderStake > 0) {
        for (const [walletAddress, stake] of defenderStakes) {
          const share = (stake / totalDefenderStake) * resolution.totalDistributedToDefenders;
          if (share > 0) {
            resolution.defenderPayouts.set(walletAddress, Math.floor(share));
          }
        }
      }
    }

    // Update pool status
    pool.status = 'resolved';
    pool.resolvedAt = new Date();
    pool.winningSide = winningSide;

    console.log(
      `[BetEscrow] Raid ${raidId} resolved: ${winningSide} won. ` +
      `Burned: ${resolution.totalBurned}, Returned: ${resolution.totalReturnedToWinners}, ` +
      `Defender spoils: ${resolution.totalDistributedToDefenders}`
    );

    return resolution;
  }

  /**
   * Get raid pool by ID
   */
  getRaidPool(raidId: string): RaidBetPool | undefined {
    return this.raidPools.get(raidId);
  }

  /**
   * Get all active raid pools
   */
  getActiveRaidPools(): RaidBetPool[] {
    return Array.from(this.raidPools.values()).filter(p => p.status === 'active');
  }

  /**
   * Cleanup old resolved pools (call periodically)
   */
  cleanupResolvedPools(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [raidId, pool] of this.raidPools) {
      if (pool.status === 'resolved' && pool.resolvedAt) {
        const age = now - pool.resolvedAt.getTime();
        if (age > maxAgeMs) {
          // Remove bets from wallet tracking
          for (const bet of pool.attackerBets.values()) {
            const walletBets = this.betsByWallet.get(bet.walletAddress);
            if (walletBets) {
              walletBets.delete(bet.id);
              if (walletBets.size === 0) {
                this.betsByWallet.delete(bet.walletAddress);
              }
            }
            this.bets.delete(bet.id);
          }
          
          this.raidPools.delete(raidId);
          cleaned++;
        }
      }
    }

    if (cleaned > 0) {
      console.log(`[BetEscrow] Cleaned up ${cleaned} old raid pools`);
    }
    return cleaned;
  }

  /**
   * Get escrow statistics
   */
  getStats(): {
    activeRaids: number;
    totalLockedBets: number;
    totalBettors: number;
    escrowWallet: string;
  } {
    let totalLockedBets = 0;
    let totalBettors = 0;

    for (const pool of this.raidPools.values()) {
      if (pool.status === 'active') {
        totalLockedBets += pool.totalAttackerBets;
        totalBettors += pool.attackerBets.size;
      }
    }

    return {
      activeRaids: this.getActiveRaidPools().length,
      totalLockedBets,
      totalBettors,
      escrowWallet: this.escrowWallet,
    };
  }
}

// Singleton instance
let betEscrowInstance: BetEscrowManager | null = null;

export function getBetEscrowManager(): BetEscrowManager {
  if (!betEscrowInstance) {
    betEscrowInstance = new BetEscrowManager();
  }
  return betEscrowInstance;
}

export function resetBetEscrowManager(): void {
  betEscrowInstance = null;
}
