/**
 * @fileoverview Work unit generation and management for Black Gold
 */

import { randomBytes, createHash } from 'crypto';
import { WorkUnit } from '../types';
import { POOL_CONFIG } from '../../config/constants';

/** Grace period for old work units (60 seconds) */
const WORK_GRACE_PERIOD_MS = 60_000;

/** Stored work with invalidation timestamp */
interface GracePeriodWork {
  work: WorkUnit;
  walletAddress: string;
  invalidatedAt: number;
}

/**
 * Work unit tracking
 */
export interface WorkTracker {
  /** All active work units by ID */
  activeWork: Map<string, WorkUnit>;
  /** Work units by wallet address */
  workByWallet: Map<string, Set<string>>;
  /** Next nonce range start */
  nextNonceStart: number;
  /** Current discovery number */
  discoveryNumber: number;
  /** Current discovery header */
  discoveryHeader: string;
  /** Recently invalidated work units (grace period for late submissions) */
  previousWork: Map<string, GracePeriodWork>;
}

/**
 * Create initial work tracker
 */
export function createWorkTracker(): WorkTracker {
  return {
    activeWork: new Map(),
    workByWallet: new Map(),
    nextNonceStart: 0,
    discoveryNumber: 0,
    discoveryHeader: generateDiscoveryHeader(null, 0),
    previousWork: new Map(),
  };
}

/**
 * Generate a new discovery header
 * Includes previous discovery hash, timestamp, and random data
 * @param previousHash - Hash of previous discovery (null for genesis)
 * @param discoveryNumber - Current discovery number
 * @returns New discovery header string
 */
export function generateDiscoveryHeader(
  previousHash: string | null,
  discoveryNumber: number
): string {
  const timestamp = Date.now();
  const random = randomBytes(16).toString('hex');
  const prevHash = previousHash || '0'.repeat(64);
  
  // Combine components into header
  const header = `COAL:${discoveryNumber}:${prevHash}:${timestamp}:${random}`;
  
  // Hash the header to get a consistent length
  return createHash('sha256').update(header).digest('hex');
}

/**
 * Generate a new work unit for a miner
 * @param tracker - Work tracker state
 * @param walletAddress - Miner's wallet address
 * @param target - Current difficulty target
 * @returns New work unit and updated tracker
 */
export function generateWork(
  tracker: WorkTracker,
  walletAddress: string,
  target: string
): { work: WorkUnit; tracker: WorkTracker } {
  const workId = randomBytes(16).toString('hex');
  const nonceStart = tracker.nextNonceStart;
  const nonceEnd = nonceStart + POOL_CONFIG.NONCE_RANGE_SIZE;
  
  const work: WorkUnit = {
    id: workId,
    discoveryHeader: tracker.discoveryHeader,
    target,
    nonceStart,
    nonceEnd,
    timestamp: Date.now(),
    discoveryNumber: tracker.discoveryNumber,
    mineId: 'default', // Should be set by caller
  };
  
  // Update tracker
  const activeWork = new Map(tracker.activeWork);
  activeWork.set(workId, work);
  
  const workByWallet = new Map(tracker.workByWallet);
  const walletWork = workByWallet.get(walletAddress) || new Set();
  walletWork.add(workId);
  workByWallet.set(walletAddress, walletWork);
  
  return {
    work,
    tracker: {
      ...tracker,
      activeWork,
      workByWallet,
      nextNonceStart: nonceEnd,
    },
  };
}

/**
 * Validate that a work unit exists and is valid for a wallet
 * Also checks previousWork for grace period submissions
 * @param tracker - Work tracker state
 * @param workId - Work unit ID to validate
 * @param walletAddress - Wallet claiming the work
 * @returns The work unit if valid, null otherwise
 */
export function validateWork(
  tracker: WorkTracker,
  workId: string,
  walletAddress: string
): WorkUnit | null {
  // First check active work
  let work = tracker.activeWork.get(workId);
  let isGracePeriod = false;
  
  if (!work) {
    // Check grace period work (recently invalidated)
    const gracePeriodEntry = tracker.previousWork.get(workId);
    if (gracePeriodEntry) {
      const now = Date.now();
      const timeSinceInvalidated = now - gracePeriodEntry.invalidatedAt;
      
      if (timeSinceInvalidated <= WORK_GRACE_PERIOD_MS) {
        // Verify wallet matches
        if (gracePeriodEntry.walletAddress === walletAddress) {
          work = gracePeriodEntry.work;
          isGracePeriod = true;
          console.log(`[Work] Accepting grace period work ${workId} (${Math.round(timeSinceInvalidated / 1000)}s since invalidation)`);
        } else {
          console.log(`[Work] Grace period work ${workId} belongs to different wallet`);
          return null;
        }
      } else {
        console.log(`[Work] Grace period expired for work ${workId}`);
        return null;
      }
    } else {
      console.log(`[Work] Invalid work ID: ${workId}`);
      return null;
    }
  }
  
  // For active work, check if wallet owns it
  if (!isGracePeriod) {
    const walletWork = tracker.workByWallet.get(walletAddress);
    if (!walletWork?.has(workId)) {
      console.log(`[Work] Wallet ${walletAddress} doesn't own work ${workId}`);
      return null;
    }
  }
  
  // Check if work is expired (use longer expiry for grace period work)
  const expiryMs = isGracePeriod 
    ? POOL_CONFIG.WORK_EXPIRY_MS + WORK_GRACE_PERIOD_MS 
    : POOL_CONFIG.WORK_EXPIRY_MS;
  if (Date.now() - work.timestamp > expiryMs) {
    console.log(`[Work] Work ${workId} expired`);
    return null;
  }
  
  // For grace period work, we accept older discovery numbers
  // This is the whole point - allowing late submissions after discovery changes
  if (!isGracePeriod && work.discoveryNumber !== tracker.discoveryNumber) {
    console.log(`[Work] Work ${workId} is for old discovery`);
    return null;
  }
  
  return work;
}

/**
 * Invalidate a work unit (moves to grace period instead of deleting)
 * @param tracker - Work tracker state
 * @param workId - Work unit to invalidate
 * @returns Updated tracker
 */
export function invalidateWork(
  tracker: WorkTracker,
  workId: string
): WorkTracker {
  const work = tracker.activeWork.get(workId);
  if (!work) return tracker;
  
  const activeWork = new Map(tracker.activeWork);
  activeWork.delete(workId);
  
  const workByWallet = new Map(tracker.workByWallet);
  let walletForWork: string | null = null;
  
  // Find and remove from wallet's work set
  for (const [wallet, workSet] of workByWallet.entries()) {
    if (workSet.has(workId)) {
      walletForWork = wallet;
      const newSet = new Set(workSet);
      newSet.delete(workId);
      if (newSet.size === 0) {
        workByWallet.delete(wallet);
      } else {
        workByWallet.set(wallet, newSet);
      }
      break;
    }
  }
  
  // Move to grace period instead of deleting completely
  const previousWork = new Map(tracker.previousWork);
  if (walletForWork) {
    previousWork.set(workId, {
      work,
      walletAddress: walletForWork,
      invalidatedAt: Date.now(),
    });
  }
  
  return {
    ...tracker,
    activeWork,
    workByWallet,
    previousWork,
  };
}

/**
 * Start a new discovery (after previous one was found)
 * Moves existing work to grace period and generates new header
 * @param tracker - Work tracker state
 * @param previousHash - Hash of the found discovery
 * @returns Updated tracker
 */
export function startNewDiscovery(
  tracker: WorkTracker,
  previousHash: string
): WorkTracker {
  const newDiscoveryNumber = tracker.discoveryNumber + 1;
  const newHeader = generateDiscoveryHeader(previousHash, newDiscoveryNumber);
  
  console.log(`[Work] Starting discovery #${newDiscoveryNumber}`);
  
  // Move all active work to grace period
  const previousWork = new Map(tracker.previousWork);
  const now = Date.now();
  
  for (const [workId, work] of tracker.activeWork.entries()) {
    // Find the wallet for this work
    for (const [wallet, workSet] of tracker.workByWallet.entries()) {
      if (workSet.has(workId)) {
        previousWork.set(workId, {
          work,
          walletAddress: wallet,
          invalidatedAt: now,
        });
        break;
      }
    }
  }
  
  console.log(`[Work] Moved ${tracker.activeWork.size} work units to grace period`);
  
  return {
    activeWork: new Map(),
    workByWallet: new Map(),
    nextNonceStart: 0,
    discoveryNumber: newDiscoveryNumber,
    discoveryHeader: newHeader,
    previousWork,
  };
}

/** @deprecated Use startNewDiscovery instead */
export const startNewBarrel = startNewDiscovery;

/**
 * Clean up expired work units and old grace period entries
 * @param tracker - Work tracker state
 * @returns Updated tracker with expired work removed
 */
export function cleanupExpiredWork(tracker: WorkTracker): WorkTracker {
  const now = Date.now();
  const expiredIds: string[] = [];
  
  // Clean up expired active work
  for (const [id, work] of tracker.activeWork.entries()) {
    if (now - work.timestamp > POOL_CONFIG.WORK_EXPIRY_MS) {
      expiredIds.push(id);
    }
  }
  
  let updatedTracker = tracker;
  for (const id of expiredIds) {
    updatedTracker = invalidateWork(updatedTracker, id);
  }
  
  if (expiredIds.length > 0) {
    console.log(`[Work] Cleaned up ${expiredIds.length} expired work units`);
  }
  
  // Clean up expired grace period work
  const expiredGraceIds: string[] = [];
  for (const [id, entry] of updatedTracker.previousWork.entries()) {
    if (now - entry.invalidatedAt > WORK_GRACE_PERIOD_MS) {
      expiredGraceIds.push(id);
    }
  }
  
  if (expiredGraceIds.length > 0) {
    const previousWork = new Map(updatedTracker.previousWork);
    for (const id of expiredGraceIds) {
      previousWork.delete(id);
    }
    updatedTracker = {
      ...updatedTracker,
      previousWork,
    };
    console.log(`[Work] Cleaned up ${expiredGraceIds.length} grace period work units`);
  }
  
  return updatedTracker;
}
