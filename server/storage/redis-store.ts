/**
 * @fileoverview Redis persistence layer for Black Gold
 * Handles persistent storage of activity feed, discoveries, and mine statistics
 */

import Redis from 'ioredis';

/** Discovery record stored in Redis */
export interface StoredDiscovery {
  id: string;
  mineId: string;
  mineName: string;
  resource: string;
  finderAddress: string;
  finderReward: number;
  vaultReward: number;
  timestamp: number;
  hash: string;
}

/** Activity event stored in Redis */
export interface StoredActivity {
  id: string;
  type: 'discovery' | 'raid_success' | 'raid_failed' | 'stake' | 'unstake' | 'join_mine';
  mineId?: string;
  mineName?: string;
  walletAddress: string;
  details: Record<string, unknown>;
  timestamp: number;
}

/** Mine statistics stored in Redis */
export interface StoredMineStats {
  totalDiscoveries: number;
  lastDiscoveryTime: number;
  totalRewardsDistributed: number;
  peakHashrate: number;
  peakMinerCount: number;
}

// Redis key prefixes
const KEY_PREFIX = 'blackgold:';
const MINE_DISCOVERIES_KEY = (mineId: string) => `${KEY_PREFIX}mine:${mineId}:discoveries`;
const MINE_STATS_KEY = (mineId: string) => `${KEY_PREFIX}mine:${mineId}:stats`;
const GLOBAL_ACTIVITY_KEY = `${KEY_PREFIX}activity:global`;
const PENDING_DISCOVERY_KEY = (mineId: string) => `${KEY_PREFIX}mine:${mineId}:pending`;

// List limits
const MAX_DISCOVERIES_PER_MINE = 50;
const MAX_GLOBAL_ACTIVITY = 100;

/**
 * Redis store for persistent game data
 */
export class RedisStore {
  private redis: Redis | null = null;
  private isConnected = false;

  /**
   * Initialize Redis connection
   * Gracefully degrades if Redis is unavailable
   */
  async connect(): Promise<boolean> {
    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
      console.log('[Redis] No REDIS_URL configured, running without persistence');
      return false;
    }

    try {
      this.redis = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        retryStrategy: (times) => {
          if (times > 3) {
            console.log('[Redis] Max retries reached, running without persistence');
            return null;
          }
          return Math.min(times * 200, 2000);
        },
        lazyConnect: true,
      });

      await this.redis.connect();
      this.isConnected = true;
      console.log('[Redis] Connected successfully');
      return true;
    } catch (error) {
      console.error('[Redis] Connection failed:', error);
      this.redis = null;
      this.isConnected = false;
      return false;
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
      this.isConnected = false;
      console.log('[Redis] Disconnected');
    }
  }

  /**
   * Check if Redis is available
   */
  isAvailable(): boolean {
    return this.isConnected && this.redis !== null;
  }

  // ========================================
  // Discovery Storage
  // ========================================

  /**
   * Store a pending discovery (before announcement)
   */
  async storePendingDiscovery(discovery: StoredDiscovery, ttlSeconds: number = 60): Promise<void> {
    if (!this.isAvailable()) return;

    try {
      const key = PENDING_DISCOVERY_KEY(discovery.mineId);
      await this.redis!.setex(key, ttlSeconds, JSON.stringify(discovery));
      console.log(`[Redis] Stored pending discovery for mine ${discovery.mineId}`);
    } catch (error) {
      console.error('[Redis] Failed to store pending discovery:', error);
    }
  }

  /**
   * Get pending discovery for a mine
   */
  async getPendingDiscovery(mineId: string): Promise<StoredDiscovery | null> {
    if (!this.isAvailable()) return null;

    try {
      const key = PENDING_DISCOVERY_KEY(mineId);
      const data = await this.redis!.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('[Redis] Failed to get pending discovery:', error);
      return null;
    }
  }

  /**
   * Clear pending discovery after announcement
   */
  async clearPendingDiscovery(mineId: string): Promise<void> {
    if (!this.isAvailable()) return;

    try {
      const key = PENDING_DISCOVERY_KEY(mineId);
      await this.redis!.del(key);
    } catch (error) {
      console.error('[Redis] Failed to clear pending discovery:', error);
    }
  }

  /**
   * Store a completed discovery (after announcement)
   */
  async storeDiscovery(discovery: StoredDiscovery): Promise<void> {
    if (!this.isAvailable()) return;

    try {
      const key = MINE_DISCOVERIES_KEY(discovery.mineId);
      
      // Add to the list (newest first)
      await this.redis!.lpush(key, JSON.stringify(discovery));
      
      // Trim to keep only the most recent
      await this.redis!.ltrim(key, 0, MAX_DISCOVERIES_PER_MINE - 1);

      // Update mine stats
      await this.incrementMineStats(discovery.mineId, {
        totalDiscoveries: 1,
        lastDiscoveryTime: discovery.timestamp,
        totalRewardsDistributed: discovery.finderReward + discovery.vaultReward,
      });

      console.log(`[Redis] Stored discovery at mine ${discovery.mineId}`);
    } catch (error) {
      console.error('[Redis] Failed to store discovery:', error);
    }
  }

  /**
   * Get recent discoveries for a mine
   */
  async getMineDiscoveries(mineId: string, limit: number = 10): Promise<StoredDiscovery[]> {
    if (!this.isAvailable()) return [];

    try {
      const key = MINE_DISCOVERIES_KEY(mineId);
      const data = await this.redis!.lrange(key, 0, limit - 1);
      return data.map(item => JSON.parse(item));
    } catch (error) {
      console.error('[Redis] Failed to get mine discoveries:', error);
      return [];
    }
  }

  // ========================================
  // Activity Feed Storage
  // ========================================

  /**
   * Store a global activity event
   */
  async storeActivity(activity: StoredActivity): Promise<void> {
    if (!this.isAvailable()) return;

    try {
      // Add to global activity list
      await this.redis!.lpush(GLOBAL_ACTIVITY_KEY, JSON.stringify(activity));
      
      // Trim to keep only the most recent
      await this.redis!.ltrim(GLOBAL_ACTIVITY_KEY, 0, MAX_GLOBAL_ACTIVITY - 1);

      console.log(`[Redis] Stored activity: ${activity.type}`);
    } catch (error) {
      console.error('[Redis] Failed to store activity:', error);
    }
  }

  /**
   * Get global activity feed
   */
  async getGlobalActivity(limit: number = 20): Promise<StoredActivity[]> {
    if (!this.isAvailable()) return [];

    try {
      const data = await this.redis!.lrange(GLOBAL_ACTIVITY_KEY, 0, limit - 1);
      return data.map(item => JSON.parse(item));
    } catch (error) {
      console.error('[Redis] Failed to get global activity:', error);
      return [];
    }
  }

  // ========================================
  // Mine Statistics Storage
  // ========================================

  /**
   * Increment mine statistics
   */
  async incrementMineStats(
    mineId: string,
    increments: Partial<StoredMineStats>
  ): Promise<void> {
    if (!this.isAvailable()) return;

    try {
      const key = MINE_STATS_KEY(mineId);
      
      if (increments.totalDiscoveries) {
        await this.redis!.hincrby(key, 'totalDiscoveries', increments.totalDiscoveries);
      }
      if (increments.totalRewardsDistributed) {
        await this.redis!.hincrbyfloat(key, 'totalRewardsDistributed', increments.totalRewardsDistributed);
      }
      if (increments.lastDiscoveryTime) {
        await this.redis!.hset(key, 'lastDiscoveryTime', increments.lastDiscoveryTime.toString());
      }
    } catch (error) {
      console.error('[Redis] Failed to increment mine stats:', error);
    }
  }

  /**
   * Update peak stats for a mine (only if new value is higher)
   */
  async updatePeakStats(mineId: string, hashrate: number, minerCount: number): Promise<void> {
    if (!this.isAvailable()) return;

    try {
      const key = MINE_STATS_KEY(mineId);
      const current = await this.getMineStats(mineId);

      if (hashrate > (current?.peakHashrate || 0)) {
        await this.redis!.hset(key, 'peakHashrate', hashrate.toString());
      }
      if (minerCount > (current?.peakMinerCount || 0)) {
        await this.redis!.hset(key, 'peakMinerCount', minerCount.toString());
      }
    } catch (error) {
      console.error('[Redis] Failed to update peak stats:', error);
    }
  }

  /**
   * Get mine statistics
   */
  async getMineStats(mineId: string): Promise<StoredMineStats | null> {
    if (!this.isAvailable()) return null;

    try {
      const key = MINE_STATS_KEY(mineId);
      const data = await this.redis!.hgetall(key);

      if (!Object.keys(data).length) return null;

      return {
        totalDiscoveries: parseInt(data.totalDiscoveries || '0', 10),
        lastDiscoveryTime: parseInt(data.lastDiscoveryTime || '0', 10),
        totalRewardsDistributed: parseFloat(data.totalRewardsDistributed || '0'),
        peakHashrate: parseInt(data.peakHashrate || '0', 10),
        peakMinerCount: parseInt(data.peakMinerCount || '0', 10),
      };
    } catch (error) {
      console.error('[Redis] Failed to get mine stats:', error);
      return null;
    }
  }

  /**
   * Get statistics for all mines
   */
  async getAllMineStats(): Promise<Map<string, StoredMineStats>> {
    if (!this.isAvailable()) return new Map();

    try {
      // Scan for all mine stat keys
      const keys = await this.redis!.keys(`${KEY_PREFIX}mine:*:stats`);
      const result = new Map<string, StoredMineStats>();

      for (const key of keys) {
        const mineId = key.replace(`${KEY_PREFIX}mine:`, '').replace(':stats', '');
        const stats = await this.getMineStats(mineId);
        if (stats) {
          result.set(mineId, stats);
        }
      }

      return result;
    } catch (error) {
      console.error('[Redis] Failed to get all mine stats:', error);
      return new Map();
    }
  }
}

// Singleton instance
let redisStore: RedisStore | null = null;

/**
 * Get the Redis store singleton
 */
export function getRedisStore(): RedisStore {
  if (!redisStore) {
    redisStore = new RedisStore();
  }
  return redisStore;
}

/**
 * Initialize Redis store (call at server startup)
 */
export async function initRedisStore(): Promise<RedisStore> {
  const store = getRedisStore();
  await store.connect();
  return store;
}
