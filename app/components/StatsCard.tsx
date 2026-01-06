/**
 * @fileoverview Network statistics display component
 */

'use client';

import { motion } from 'framer-motion';
import type { NetworkStats } from '../../server/types';

interface StatsCardProps {
  stats: NetworkStats | null;
  userEarnings?: number;
  loading?: boolean;
}

/**
 * Format large numbers with K/M suffixes
 */
function formatNumber(num: number): string {
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(2)}M`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(2)}K`;
  }
  return num.toFixed(0);
}

/**
 * Format hashrate with appropriate units
 */
function formatHashrate(hashrate: number): string {
  if (hashrate >= 1_000_000_000) {
    return `${(hashrate / 1_000_000_000).toFixed(2)} GH/s`;
  }
  if (hashrate >= 1_000_000) {
    return `${(hashrate / 1_000_000).toFixed(2)} MH/s`;
  }
  if (hashrate >= 1_000) {
    return `${(hashrate / 1_000).toFixed(2)} KH/s`;
  }
  return `${Math.round(hashrate)} H/s`;
}

/**
 * Format time since last barrel
 */
function formatTimeSince(date: Date | null): string {
  if (!date) return 'Never';
  
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

interface StatItemProps {
  label: string;
  value: string | number;
  highlight?: boolean;
  loading?: boolean;
}

function StatItem({ label, value, highlight, loading }: StatItemProps) {
  return (
    <div className="text-center">
      <div className="stat-label mb-1">{label}</div>
      {loading ? (
        <div className="h-8 w-20 mx-auto shimmer rounded" />
      ) : (
        <motion.div
          key={String(value)}
          initial={{ scale: 1.05 }}
          animate={{ scale: 1 }}
          className={`text-2xl font-mono ${
            highlight ? 'text-gold text-shadow-gold' : 'text-white'
          }`}
        >
          {value}
        </motion.div>
      )}
    </div>
  );
}

export function StatsCard({ stats, userEarnings = 0, loading }: StatsCardProps) {
  return (
    <div className="coal-panel p-6 space-y-6">
      <h2 className="font-heading text-xl text-white text-center">
        Network Statistics
      </h2>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
        <StatItem
          label="Total Miners"
          value={stats?.totalMiners ?? 0}
          loading={loading}
        />
        <StatItem
          label="Network Hashrate"
          value={formatHashrate(stats?.networkHashrate ?? 0)}
          loading={loading}
        />
        <StatItem
          label="Total Barrels"
          value={stats?.totalBarrels ?? 0}
          loading={loading}
        />
        <StatItem
          label="Difficulty"
          value={formatNumber(stats?.difficulty ?? 1)}
          loading={loading}
        />
        <StatItem
          label="Last Barrel"
          value={formatTimeSince(stats?.lastBarrelTime ?? null)}
          loading={loading}
        />
        <StatItem
          label="Rewards Pool"
          value={`${formatNumber(stats?.currentRewardPool ?? 0)} COAL`}
          highlight
          loading={loading}
        />
      </div>

      {/* User Earnings Section */}
      <div className="border-t border-coal-700 pt-6">
        <div className="flex justify-between items-center">
          <div>
            <div className="stat-label">Your Earnings</div>
            <div className="stat-value text-3xl font-mono">
              {userEarnings.toFixed(2)} COAL
            </div>
          </div>
          <div className="text-right">
            <div className="stat-label">Total Distributed</div>
            <div className="text-xl font-mono text-coal-500">
              {formatNumber(stats?.totalRewardsDistributed ?? 0)} COAL
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
