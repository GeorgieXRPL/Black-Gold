/**
 * @fileoverview Rate limiting middleware for WebSocket connections
 * In-memory rate limiting without Redis dependency (suitable for single-server deployments)
 */

// ============================================================================
// Types
// ============================================================================

interface RateLimitEntry {
  count: number;
  windowStart: number;
  blocked: boolean;
  blockedUntil: number;
}

interface RateLimitConfig {
  /** Maximum requests per window */
  limit: number;
  /** Window duration in milliseconds */
  windowMs: number;
  /** Block duration if limit exceeded (ms) */
  blockDurationMs: number;
}

// ============================================================================
// Rate Limiter Class
// ============================================================================

/**
 * In-memory rate limiter with automatic cleanup
 * Thread-safe for single-process Node.js
 */
export class RateLimiter {
  private entries: Map<string, RateLimitEntry> = new Map();
  private config: RateLimitConfig;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = {
      limit: config.limit ?? 100,
      windowMs: config.windowMs ?? 60_000, // 1 minute
      blockDurationMs: config.blockDurationMs ?? 300_000, // 5 minutes
    };

    // Start cleanup interval to prevent memory leaks
    this.startCleanup();
  }

  /**
   * Check if a key is allowed (not rate limited)
   * @param key - Identifier (IP, wallet, etc.)
   * @returns Whether the request is allowed
   */
  isAllowed(key: string): boolean {
    const now = Date.now();
    const entry = this.entries.get(key);

    // No entry exists, allow and create
    if (!entry) {
      this.entries.set(key, {
        count: 1,
        windowStart: now,
        blocked: false,
        blockedUntil: 0,
      });
      return true;
    }

    // Check if blocked
    if (entry.blocked) {
      if (now >= entry.blockedUntil) {
        // Block expired, reset
        entry.blocked = false;
        entry.count = 1;
        entry.windowStart = now;
        return true;
      }
      return false;
    }

    // Check if window expired
    if (now - entry.windowStart >= this.config.windowMs) {
      // Reset window
      entry.count = 1;
      entry.windowStart = now;
      return true;
    }

    // Increment count
    entry.count++;

    // Check if limit exceeded
    if (entry.count > this.config.limit) {
      entry.blocked = true;
      entry.blockedUntil = now + this.config.blockDurationMs;
      console.warn(`[RateLimit] Key ${key} blocked until ${new Date(entry.blockedUntil).toISOString()}`);
      return false;
    }

    return true;
  }

  /**
   * Get remaining requests for a key
   * @param key - Identifier
   * @returns Remaining requests in current window
   */
  getRemaining(key: string): number {
    const entry = this.entries.get(key);
    if (!entry) return this.config.limit;
    if (entry.blocked) return 0;
    return Math.max(0, this.config.limit - entry.count);
  }

  /**
   * Get time until rate limit resets
   * @param key - Identifier
   * @returns Milliseconds until reset
   */
  getResetTime(key: string): number {
    const entry = this.entries.get(key);
    if (!entry) return 0;
    
    if (entry.blocked) {
      return Math.max(0, entry.blockedUntil - Date.now());
    }
    
    const windowEnd = entry.windowStart + this.config.windowMs;
    return Math.max(0, windowEnd - Date.now());
  }

  /**
   * Manually block a key
   * @param key - Identifier
   * @param durationMs - Block duration in milliseconds
   */
  block(key: string, durationMs: number = this.config.blockDurationMs): void {
    const now = Date.now();
    this.entries.set(key, {
      count: this.config.limit + 1,
      windowStart: now,
      blocked: true,
      blockedUntil: now + durationMs,
    });
    console.warn(`[RateLimit] Key ${key} manually blocked for ${durationMs}ms`);
  }

  /**
   * Unblock a key
   * @param key - Identifier
   */
  unblock(key: string): void {
    const entry = this.entries.get(key);
    if (entry) {
      entry.blocked = false;
      entry.blockedUntil = 0;
      entry.count = 0;
    }
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.entries.clear();
  }

  /**
   * Get statistics
   */
  getStats(): { totalEntries: number; blockedCount: number } {
    let blockedCount = 0;
    for (const entry of this.entries.values()) {
      if (entry.blocked && Date.now() < entry.blockedUntil) {
        blockedCount++;
      }
    }
    return {
      totalEntries: this.entries.size,
      blockedCount,
    };
  }

  /**
   * Start cleanup interval
   */
  private startCleanup(): void {
    // Clean up expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      const expiredThreshold = this.config.windowMs * 2;

      for (const [key, entry] of this.entries.entries()) {
        const age = now - entry.windowStart;
        const isExpiredBlock = entry.blocked && now >= entry.blockedUntil;
        
        if (age > expiredThreshold && (!entry.blocked || isExpiredBlock)) {
          this.entries.delete(key);
        }
      }
    }, 300_000); // 5 minutes
  }

  /**
   * Stop the rate limiter and cleanup
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.entries.clear();
  }

  /**
   * Alias for destroy() - backwards compatibility
   */
  stop(): void {
    this.destroy();
  }

  /**
   * Check if allowed and return result object
   * @param key - Identifier
   * @returns Result object with allowed status and remaining info
   */
  check(key: string): { allowed: boolean; remaining: number; resetIn: number } {
    const allowed = this.isAllowed(key);
    return {
      allowed,
      remaining: this.getRemaining(key),
      resetIn: this.getResetTime(key),
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Get or create a rate limiter with specified configuration
 * @param name - Limiter name (for caching)
 * @param config - Rate limit configuration
 * @returns RateLimiter instance
 */
const limiterCache = new Map<string, RateLimiter>();

export function getRateLimiter(name: string, config?: Partial<RateLimitConfig>): RateLimiter {
  const existing = limiterCache.get(name);
  if (existing) return existing;
  
  const limiter = new RateLimiter(config);
  limiterCache.set(name, limiter);
  return limiter;
}

// ============================================================================
// Pre-configured Rate Limiters
// ============================================================================

/** General API rate limiter: 100 requests per minute */
export const apiLimiter = new RateLimiter({
  limit: 100,
  windowMs: 60_000,
  blockDurationMs: 300_000,
});

/** Proof submission limiter: 500 per minute (mining is high-frequency) */
export const proofLimiter = new RateLimiter({
  limit: 500,
  windowMs: 60_000,
  blockDurationMs: 120_000,
});

/** Auth limiter: 10 per minute to prevent brute force */
export const authLimiter = new RateLimiter({
  limit: 10,
  windowMs: 60_000,
  blockDurationMs: 600_000, // 10 minutes
});

/** Staking limiter: 20 per minute */
export const stakeLimiter = new RateLimiter({
  limit: 20,
  windowMs: 60_000,
  blockDurationMs: 300_000,
});

/** Raid limiter: 5 per hour per user */
export const raidLimiter = new RateLimiter({
  limit: 5,
  windowMs: 3_600_000, // 1 hour
  blockDurationMs: 1_800_000, // 30 minutes
});

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get client IP from various sources
 * @param headers - Request headers
 * @param socket - WebSocket socket
 * @returns Client IP address
 */
export function getClientIP(
  headers?: Record<string, string | string[] | undefined>,
  socket?: { remoteAddress?: string }
): string {
  // Check X-Forwarded-For (behind proxy)
  if (headers) {
    const forwarded = headers['x-forwarded-for'];
    if (forwarded) {
      const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
      return ip.trim();
    }
    
    // Check X-Real-IP
    const realIP = headers['x-real-ip'];
    if (realIP) {
      return Array.isArray(realIP) ? realIP[0] : realIP;
    }
  }

  // Fallback to socket
  return socket?.remoteAddress || 'unknown';
}

/**
 * Create a composite rate limit key
 * @param parts - Key parts to combine
 * @returns Combined key
 */
export function createRateLimitKey(...parts: string[]): string {
  return parts.filter(Boolean).join(':');
}
