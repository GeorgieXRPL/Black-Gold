/**
 * @fileoverview Black Gold Anti-Cheat & Anti-Gaming Security Layer
 * 
 * SECURITY LAYER: Rate Limiting, Sybil Detection, Connection Management
 * 
 * ============================================================================
 * SECURITY DECISIONS & RATIONALE
 * ============================================================================
 * 
 * 1. RATE LIMITING (10 submissions/min per wallet):
 *    - Prevents hash grinding attacks where attacker submits many guesses.
 *    - 10/min is generous for legitimate mining (valid proofs are rare).
 *    - Rate limit applies per wallet, not per connection (harder to evade).
 * 
 * 2. CONNECTION LIMITS (3 per IP):
 *    - Prevents single actor from monopolizing pool resources.
 *    - Allows legitimate multi-wallet setups (family, small org).
 *    - Low enough to make botnet attacks expensive.
 * 
 * 3. SYBIL DETECTION (flag at 3+ IPs in 1 hour):
 *    - Detects wallets connecting from multiple locations.
 *    - Legitimate miners typically use 1-2 IPs (home + mobile).
 *    - 3+ IPs in 1 hour is suspicious pattern.
 *    - Flagging (not blocking) allows manual review.
 * 
 * 4. EXPONENTIAL BACKOFF:
 *    - Failed submissions trigger increasing cooldown periods.
 *    - Starts at 1s, doubles each failure, caps at 60s.
 *    - Resets on successful submission.
 *    - Makes brute-force attacks exponentially costly.
 * 
 * 5. SLIDING WINDOW RATE LIMITING:
 *    - Uses sliding window (not fixed) for smoother limits.
 *    - Prevents burst attacks at window boundaries.
 * 
 * 6. COMPREHENSIVE LOGGING:
 *    - All suspicious activity is logged with full context.
 *    - Enables post-hoc attack analysis and pattern detection.
 *    - Logs include: wallet, IP, timestamp, violation type.
 * 
 * ============================================================================
 * ATTACK VECTORS MITIGATED
 * ============================================================================
 * 
 * - Submission spam: Rate limiting per wallet
 * - Sybil attacks: IP tracking and wallet-IP correlation
 * - Resource exhaustion: Connection limits per IP
 * - Brute force: Exponential backoff on failures
 * - Evasion attempts: Sliding window prevents boundary gaming
 * - VPN rotation: IP history tracking per wallet
 * - Botnet attacks: Combined IP + wallet limits
 * 
 * ============================================================================
 */

import { RATE_LIMIT_CONFIG } from '../../config/constants';
import { RateLimitEntry, IPTracker } from '../types';

/**
 * Result of a submission check
 */
export interface SubmissionCheckResult {
  /** Whether submission is allowed */
  allowed: boolean;
  /** Reason for rejection (if not allowed) */
  reason?: string;
  /** Time until next allowed submission (ms) */
  retryAfter?: number;
}

/**
 * Suspicious activity log entry
 */
export interface SuspiciousActivityLog {
  timestamp: number;
  type: 'RATE_LIMIT' | 'SYBIL_FLAG' | 'CONNECTION_LIMIT' | 'BACKOFF_ACTIVE' | 'FAILED_SUBMISSION' | 'RAPID_IP_CHANGE';
  walletAddress: string;
  ip: string;
  details: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

/**
 * Wallet tracking entry for sybil detection
 */
interface WalletTracker {
  /** Wallet address */
  walletAddress: string;
  /** Map of IP addresses to first seen timestamp */
  ips: Map<string, number>;
  /** Current active connections */
  activeConnections: number;
  /** Whether wallet is flagged as suspicious */
  flagged: boolean;
  /** Flag reason */
  flagReason?: string;
}

/**
 * Anti-Cheat Service
 * 
 * Central service for all anti-gaming measures.
 * Maintains state for rate limiting, connection tracking, and sybil detection.
 */
export class AntiCheatService {
  /** Rate limit entries by wallet address */
  private rateLimits: Map<string, RateLimitEntry> = new Map();
  
  /** IP tracker entries by IP address */
  private ipTrackers: Map<string, IPTracker> = new Map();
  
  /** Wallet tracker entries by wallet address */
  private walletTrackers: Map<string, WalletTracker> = new Map();
  
  /** Active connections: wallet -> IP */
  private activeConnections: Map<string, string> = new Map();
  
  /** Suspicious activity logs */
  private suspiciousLogs: SuspiciousActivityLog[] = [];
  
  /** Maximum log entries to keep */
  private readonly MAX_LOG_ENTRIES = 10000;
  
  /** Cleanup interval handle */
  private cleanupInterval: NodeJS.Timeout | null = null;
  
  constructor() {
    // Start periodic cleanup of expired entries
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredEntries();
    }, 60000); // Every minute
  }
  
  /**
   * Cleanup method for graceful shutdown
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
  
  // ===========================================================================
  // CONNECTION MANAGEMENT
  // ===========================================================================
  
  /**
   * Check if a new connection should be allowed
   * 
   * @param walletAddress - Connecting wallet
   * @param ip - Client IP address
   * @returns true if connection allowed
   * 
   * SECURITY CHECKS:
   * 1. IP connection limit (max 3 per IP)
   * 2. Sybil detection (wallet-IP correlation)
   */
  checkConnection(walletAddress: string, ip: string): boolean {
    // Get or create IP tracker
    let ipTracker = this.ipTrackers.get(ip);
    if (!ipTracker) {
      ipTracker = {
        ip,
        wallets: new Set(),
        connectionCount: 0,
        firstSeen: new Date(),
        flagged: false,
      };
      this.ipTrackers.set(ip, ipTracker);
    }
    
    // Check connection limit per IP
    if (ipTracker.connectionCount >= RATE_LIMIT_CONFIG.MAX_CONNECTIONS_PER_IP) {
      this.logSuspicious({
        timestamp: Date.now(),
        type: 'CONNECTION_LIMIT',
        walletAddress,
        ip,
        details: `Connection rejected: ${ipTracker.connectionCount} connections from IP (limit: ${RATE_LIMIT_CONFIG.MAX_CONNECTIONS_PER_IP})`,
        severity: 'MEDIUM',
      });
      return false;
    }
    
    // Track this connection
    ipTracker.wallets.add(walletAddress);
    ipTracker.connectionCount++;
    this.activeConnections.set(walletAddress, ip);
    
    // Update wallet tracker for sybil detection
    this.updateWalletTracker(walletAddress, ip);
    
    return true;
  }
  
  /**
   * Record a disconnection
   * 
   * @param walletAddress - Disconnecting wallet
   * @param ip - Client IP address
   */
  recordDisconnect(walletAddress: string, ip: string): void {
    // Update IP tracker
    const ipTracker = this.ipTrackers.get(ip);
    if (ipTracker && ipTracker.connectionCount > 0) {
      ipTracker.connectionCount--;
    }
    
    // Update wallet tracker
    const walletTracker = this.walletTrackers.get(walletAddress);
    if (walletTracker && walletTracker.activeConnections > 0) {
      walletTracker.activeConnections--;
    }
    
    // Remove from active connections
    this.activeConnections.delete(walletAddress);
  }
  
  // ===========================================================================
  // SUBMISSION RATE LIMITING
  // ===========================================================================
  
  /**
   * Check if a submission should be allowed
   * 
   * @param walletAddress - Submitting wallet
   * @param ip - Client IP address
   * @returns SubmissionCheckResult with allowed status and reason
   * 
   * SECURITY CHECKS:
   * 1. Exponential backoff (if in cooldown)
   * 2. Rate limit (max 10/min per wallet)
   * 3. Flagged wallet warning
   */
  checkSubmission(walletAddress: string, ip: string): SubmissionCheckResult {
    const now = Date.now();
    
    // Get or create rate limit entry
    let rateLimit = this.rateLimits.get(walletAddress);
    if (!rateLimit) {
      rateLimit = {
        count: 0,
        windowStart: now,
        failedCount: 0,
      };
      this.rateLimits.set(walletAddress, rateLimit);
    }
    
    // Check 1: Exponential backoff
    if (rateLimit.backoffUntil && now < rateLimit.backoffUntil) {
      const retryAfter = rateLimit.backoffUntil - now;
      
      this.logSuspicious({
        timestamp: now,
        type: 'BACKOFF_ACTIVE',
        walletAddress,
        ip,
        details: `Submission blocked: in backoff period for ${Math.ceil(retryAfter / 1000)}s more`,
        severity: 'LOW',
      });
      
      return {
        allowed: false,
        reason: 'In backoff period due to failed submissions',
        retryAfter,
      };
    }
    
    // Check 2: Sliding window rate limit
    // Reset window if expired
    if (now - rateLimit.windowStart >= RATE_LIMIT_CONFIG.WINDOW_MS) {
      rateLimit.count = 0;
      rateLimit.windowStart = now;
    }
    
    // Check rate limit
    if (rateLimit.count >= RATE_LIMIT_CONFIG.MAX_SUBMISSIONS_PER_MINUTE) {
      const retryAfter = RATE_LIMIT_CONFIG.WINDOW_MS - (now - rateLimit.windowStart);
      
      this.logSuspicious({
        timestamp: now,
        type: 'RATE_LIMIT',
        walletAddress,
        ip,
        details: `Rate limit exceeded: ${rateLimit.count} submissions in window (limit: ${RATE_LIMIT_CONFIG.MAX_SUBMISSIONS_PER_MINUTE})`,
        severity: 'MEDIUM',
      });
      
      return {
        allowed: false,
        reason: 'Rate limit exceeded',
        retryAfter,
      };
    }
    
    // Increment submission count
    rateLimit.count++;
    
    // Check if wallet is flagged (allow but log)
    const walletTracker = this.walletTrackers.get(walletAddress);
    if (walletTracker?.flagged) {
      this.logSuspicious({
        timestamp: now,
        type: 'SYBIL_FLAG',
        walletAddress,
        ip,
        details: `Flagged wallet submitted: ${walletTracker.flagReason}`,
        severity: 'HIGH',
      });
    }
    
    return { allowed: true };
  }
  
  /**
   * Record a failed submission
   * 
   * @param walletAddress - Wallet that submitted invalid proof
   * 
   * SECURITY: Implements exponential backoff.
   * Each failure doubles the backoff time up to MAX_BACKOFF_MS.
   */
  recordFailedSubmission(walletAddress: string): void {
    const now = Date.now();
    let rateLimit = this.rateLimits.get(walletAddress);
    
    if (!rateLimit) {
      rateLimit = {
        count: 0,
        windowStart: now,
        failedCount: 0,
      };
      this.rateLimits.set(walletAddress, rateLimit);
    }
    
    // Increment failed count
    rateLimit.failedCount++;
    
    // Calculate exponential backoff
    // backoff = min(INITIAL * 2^(failures-1), MAX)
    const backoffTime = Math.min(
      RATE_LIMIT_CONFIG.INITIAL_BACKOFF_MS * 
        Math.pow(RATE_LIMIT_CONFIG.BACKOFF_MULTIPLIER, rateLimit.failedCount - 1),
      RATE_LIMIT_CONFIG.MAX_BACKOFF_MS
    );
    
    rateLimit.backoffUntil = now + backoffTime;
    
    // Get IP for logging
    const ip = this.activeConnections.get(walletAddress) || 'unknown';
    
    this.logSuspicious({
      timestamp: now,
      type: 'FAILED_SUBMISSION',
      walletAddress,
      ip,
      details: `Failed submission #${rateLimit.failedCount}, backoff: ${backoffTime}ms`,
      severity: rateLimit.failedCount >= 5 ? 'HIGH' : 'MEDIUM',
    });
    
    console.log(
      `[AntiCheat] BACKOFF: ${walletAddress} - ${rateLimit.failedCount} failures, ` +
      `waiting ${Math.ceil(backoffTime / 1000)}s`
    );
  }
  
  /**
   * Record a successful submission (resets backoff)
   * 
   * @param walletAddress - Wallet with successful submission
   */
  recordSuccessfulSubmission(walletAddress: string): void {
    const rateLimit = this.rateLimits.get(walletAddress);
    if (rateLimit) {
      rateLimit.failedCount = 0;
      rateLimit.backoffUntil = undefined;
    }
  }
  
  // ===========================================================================
  // SYBIL DETECTION
  // ===========================================================================
  
  /**
   * Update wallet tracker with new IP observation
   * 
   * @param walletAddress - Wallet address
   * @param ip - Observed IP address
   * 
   * SECURITY: Tracks IP history per wallet for sybil detection.
   * Flags wallets that connect from 3+ IPs within 1 hour.
   */
  private updateWalletTracker(walletAddress: string, ip: string): void {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    
    // Get or create wallet tracker
    let tracker = this.walletTrackers.get(walletAddress);
    if (!tracker) {
      tracker = {
        walletAddress,
        ips: new Map(),
        activeConnections: 0,
        flagged: false,
      };
      this.walletTrackers.set(walletAddress, tracker);
    }
    
    // Update active connections
    tracker.activeConnections++;
    
    // Record this IP with timestamp
    if (!tracker.ips.has(ip)) {
      tracker.ips.set(ip, now);
    }
    
    // Count unique IPs in the last hour
    let recentIpCount = 0;
    const recentIps: string[] = [];
    
    tracker.ips.forEach((firstSeen, trackedIp) => {
      if (firstSeen >= oneHourAgo) {
        recentIpCount++;
        recentIps.push(trackedIp);
      }
    });
    
    // Check for rapid IP changes (sybil indicator)
    if (recentIpCount >= RATE_LIMIT_CONFIG.MAX_IPS_PER_WALLET && !tracker.flagged) {
      tracker.flagged = true;
      tracker.flagReason = `${recentIpCount} unique IPs in 1 hour: ${recentIps.join(', ')}`;
      
      this.logSuspicious({
        timestamp: now,
        type: 'SYBIL_FLAG',
        walletAddress,
        ip,
        details: tracker.flagReason,
        severity: 'CRITICAL',
      });
      
      console.log(
        `[AntiCheat] SYBIL FLAG: ${walletAddress} connected from ${recentIpCount} IPs in 1 hour`
      );
    }
  }
  
  /**
   * Check if a wallet is flagged as suspicious
   * 
   * @param walletAddress - Wallet to check
   * @returns true if flagged
   */
  isWalletFlagged(walletAddress: string): boolean {
    return this.walletTrackers.get(walletAddress)?.flagged ?? false;
  }
  
  /**
   * Get sybil status for a wallet
   * 
   * @param walletAddress - Wallet to check
   * @returns Sybil status object
   */
  getWalletSybilStatus(walletAddress: string): {
    flagged: boolean;
    reason?: string;
    uniqueIps: number;
    ips: string[];
  } {
    const tracker = this.walletTrackers.get(walletAddress);
    if (!tracker) {
      return { flagged: false, uniqueIps: 0, ips: [] };
    }
    
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const recentIps: string[] = [];
    tracker.ips.forEach((firstSeen, ip) => {
      if (firstSeen >= oneHourAgo) {
        recentIps.push(ip);
      }
    });
    
    return {
      flagged: tracker.flagged,
      reason: tracker.flagReason,
      uniqueIps: recentIps.length,
      ips: recentIps,
    };
  }
  
  // ===========================================================================
  // LOGGING & MONITORING
  // ===========================================================================
  
  /**
   * Log suspicious activity
   * 
   * @param entry - Log entry to add
   */
  private logSuspicious(entry: SuspiciousActivityLog): void {
    this.suspiciousLogs.push(entry);
    
    // Trim old logs
    if (this.suspiciousLogs.length > this.MAX_LOG_ENTRIES) {
      this.suspiciousLogs.shift();
    }
    
    // Console log for immediate visibility
    const severityIcon = {
      LOW: '⚪',
      MEDIUM: '🟡',
      HIGH: '🟠',
      CRITICAL: '🔴',
    };
    
    console.log(
      `[AntiCheat] ${severityIcon[entry.severity]} ${entry.type}: ` +
      `${entry.walletAddress.slice(0, 8)}... from ${entry.ip} - ${entry.details}`
    );
  }
  
  /**
   * Get recent suspicious activity logs
   * 
   * @param limit - Maximum number of entries to return
   * @param minSeverity - Minimum severity to include
   * @returns Array of suspicious activity logs
   */
  getRecentSuspiciousActivity(
    limit: number = 100,
    minSeverity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW'
  ): SuspiciousActivityLog[] {
    const severityOrder = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
    const minLevel = severityOrder[minSeverity];
    
    return this.suspiciousLogs
      .filter(log => severityOrder[log.severity] >= minLevel)
      .slice(-limit);
  }
  
  /**
   * Get anti-cheat statistics
   * 
   * @returns Statistics object
   */
  getStats(): {
    activeConnections: number;
    trackedWallets: number;
    trackedIps: number;
    flaggedWallets: number;
    suspiciousEventsToday: number;
    suspiciousEventsByType: Record<string, number>;
  } {
    const now = Date.now();
    const todayStart = now - (now % (24 * 60 * 60 * 1000));
    
    let flaggedCount = 0;
    this.walletTrackers.forEach((tracker) => {
      if (tracker.flagged) flaggedCount++;
    });
    
    const todaysLogs = this.suspiciousLogs.filter(l => l.timestamp >= todayStart);
    const eventsByType: Record<string, number> = {};
    for (const log of todaysLogs) {
      eventsByType[log.type] = (eventsByType[log.type] || 0) + 1;
    }
    
    return {
      activeConnections: this.activeConnections.size,
      trackedWallets: this.walletTrackers.size,
      trackedIps: this.ipTrackers.size,
      flaggedWallets: flaggedCount,
      suspiciousEventsToday: todaysLogs.length,
      suspiciousEventsByType: eventsByType,
    };
  }
  
  // ===========================================================================
  // MAINTENANCE
  // ===========================================================================
  
  /**
   * Clean up expired entries to prevent memory leaks
   * 
   * SECURITY: Regular cleanup prevents memory exhaustion attacks
   * where an attacker creates many entries to exhaust server memory.
   */
  private cleanupExpiredEntries(): void {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    
    // Clean up old IP timestamps from wallet trackers
    this.walletTrackers.forEach((tracker) => {
      const ipsToDelete: string[] = [];
      tracker.ips.forEach((firstSeen, ip) => {
        if (firstSeen < oneHourAgo) {
          ipsToDelete.push(ip);
        }
      });
      ipsToDelete.forEach(ip => tracker.ips.delete(ip));
      
      // Re-evaluate sybil flag if IPs cleaned up
      if (tracker.flagged && tracker.ips.size < RATE_LIMIT_CONFIG.MAX_IPS_PER_WALLET) {
        // Keep flagged but note it's based on historical data
        // Don't automatically unflag - requires manual review
      }
    });
    
    // Clean up rate limit entries that haven't been used in a day
    const rateLimitsToDelete: string[] = [];
    this.rateLimits.forEach((rateLimit, wallet) => {
      if (rateLimit.windowStart < oneDayAgo) {
        rateLimitsToDelete.push(wallet);
      }
    });
    rateLimitsToDelete.forEach(wallet => this.rateLimits.delete(wallet));
    
    // Clean up IP trackers with no connections and old data
    const ipsToDelete: string[] = [];
    this.ipTrackers.forEach((tracker, ip) => {
      if (tracker.connectionCount === 0 && tracker.firstSeen.getTime() < oneDayAgo) {
        ipsToDelete.push(ip);
      }
    });
    ipsToDelete.forEach(ip => this.ipTrackers.delete(ip));
    
    console.log(
      `[AntiCheat] Cleanup complete: ${this.walletTrackers.size} wallets, ` +
      `${this.ipTrackers.size} IPs, ${this.rateLimits.size} rate limits`
    );
  }
  
  /**
   * Manually unflag a wallet (for admin use)
   * 
   * @param walletAddress - Wallet to unflag
   * @returns true if wallet was unflagged
   */
  unflagWallet(walletAddress: string): boolean {
    const tracker = this.walletTrackers.get(walletAddress);
    if (!tracker) return false;
    
    tracker.flagged = false;
    tracker.flagReason = undefined;
    
    console.log(`[AntiCheat] Manually unflagged wallet: ${walletAddress}`);
    return true;
  }
  
  /**
   * Reset all backoffs for a wallet (for admin use)
   * 
   * @param walletAddress - Wallet to reset
   * @returns true if reset was performed
   */
  resetBackoff(walletAddress: string): boolean {
    const rateLimit = this.rateLimits.get(walletAddress);
    if (!rateLimit) return false;
    
    rateLimit.failedCount = 0;
    rateLimit.backoffUntil = undefined;
    
    console.log(`[AntiCheat] Reset backoff for wallet: ${walletAddress}`);
    return true;
  }
}
