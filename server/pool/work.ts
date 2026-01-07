/**
 * @fileoverview Work unit generation and management for Black Gold
 */

import { randomBytes, createHash } from 'crypto';
import { WorkUnit } from '../types';
import { POOL_CONFIG } from '../../config/constants';

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
  const work = tracker.activeWork.get(workId);
  
  if (!work) {
    console.log(`[Work] Invalid work ID: ${workId}`);
    return null;
  }
  
  // Check if wallet owns this work
  const walletWork = tracker.workByWallet.get(walletAddress);
  if (!walletWork?.has(workId)) {
    console.log(`[Work] Wallet ${walletAddress} doesn't own work ${workId}`);
    return null;
  }
  
  // Check if work is expired
  if (Date.now() - work.timestamp > POOL_CONFIG.WORK_EXPIRY_MS) {
    console.log(`[Work] Work ${workId} expired`);
    return null;
  }
  
  // Check if work is for current discovery
  if (work.discoveryNumber !== tracker.discoveryNumber) {
    console.log(`[Work] Work ${workId} is for old discovery`);
    return null;
  }
  
  return work;
}

/**
 * Invalidate a work unit
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
  // Find and remove from wallet's work set
  for (const [wallet, workSet] of workByWallet.entries()) {
    if (workSet.has(workId)) {
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
  
  return {
    ...tracker,
    activeWork,
    workByWallet,
  };
}

/**
 * Start a new discovery (after previous one was found)
 * Invalidates all existing work and generates new header
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
  
  return {
    activeWork: new Map(),
    workByWallet: new Map(),
    nextNonceStart: 0,
    discoveryNumber: newDiscoveryNumber,
    discoveryHeader: newHeader,
  };
}

/** @deprecated Use startNewDiscovery instead */
export const startNewBarrel = startNewDiscovery;

/**
 * Clean up expired work units
 * @param tracker - Work tracker state
 * @returns Updated tracker with expired work removed
 */
export function cleanupExpiredWork(tracker: WorkTracker): WorkTracker {
  const now = Date.now();
  const expiredIds: string[] = [];
  
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
  
  return updatedTracker;
}
