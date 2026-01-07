'use client';

/**
 * @fileoverview Admin Dashboard - Overview of system health and key metrics
 */

import { useState, useEffect } from 'react';

interface SystemStats {
  activeMiners: number;
  totalHashrate: number;
  discoveriesToday: number;
  activeRaids: number;
  totalStaked: number;
  rewardWalletBalance: number;
  serverUptime: string;
  wsConnections: number;
  errorsToday: number;
  pendingDistributions: number;
}

interface ServerHealth {
  cpu: number;
  memory: number;
  wsLatency: number;
  rpcLatency: number;
  status: 'healthy' | 'degraded' | 'critical';
}

function StatCard({ 
  label, 
  value, 
  icon, 
  change, 
  changeType = 'neutral' 
}: { 
  label: string; 
  value: string | number; 
  icon: string;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
}) {
  const changeColors = {
    positive: 'text-green-400',
    negative: 'text-red-400',
    neutral: 'text-coal-500',
  };

  return (
    <div className="bg-coal-900 border border-coal-700 rounded-xl p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-coal-500 text-sm mb-1">{label}</p>
          <p className="text-2xl font-bold text-white">{value}</p>
          {change && (
            <p className={`text-xs mt-1 ${changeColors[changeType]}`}>{change}</p>
          )}
        </div>
        <div className="text-3xl">{icon}</div>
      </div>
    </div>
  );
}

function HealthIndicator({ health }: { health: ServerHealth }) {
  const statusColors = {
    healthy: 'bg-green-500',
    degraded: 'bg-yellow-500',
    critical: 'bg-red-500',
  };

  return (
    <div className="bg-coal-900 border border-coal-700 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-white">Server Health</h3>
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${statusColors[health.status]} animate-pulse`} />
          <span className="text-coal-400 capitalize">{health.status}</span>
        </div>
      </div>
      
      <div className="space-y-4">
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-coal-500">CPU</span>
            <span className="text-white">{health.cpu}%</span>
          </div>
          <div className="h-2 bg-coal-800 rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all ${health.cpu > 80 ? 'bg-red-500' : health.cpu > 50 ? 'bg-yellow-500' : 'bg-green-500'}`}
              style={{ width: `${health.cpu}%` }}
            />
          </div>
        </div>
        
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-coal-500">Memory</span>
            <span className="text-white">{health.memory}%</span>
          </div>
          <div className="h-2 bg-coal-800 rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all ${health.memory > 80 ? 'bg-red-500' : health.memory > 50 ? 'bg-yellow-500' : 'bg-green-500'}`}
              style={{ width: `${health.memory}%` }}
            />
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-4 pt-2">
          <div className="text-center">
            <p className="text-coal-500 text-xs">WS Latency</p>
            <p className="text-white font-mono">{health.wsLatency}ms</p>
          </div>
          <div className="text-center">
            <p className="text-coal-500 text-xs">RPC Latency</p>
            <p className="text-white font-mono">{health.rpcLatency}ms</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function RecentActivity() {
  const activities = [
    { type: 'discovery', message: 'Coal Seam found at Appalachian Basin', time: '2m ago' },
    { type: 'raid', message: 'Raid started: Witwatersrand → Grasberg', time: '5m ago' },
    { type: 'stake', message: 'User staked 500 COAL at Permian Basin', time: '8m ago' },
    { type: 'payout', message: 'Hourly vault distribution: 1,250 COAL', time: '15m ago' },
    { type: 'error', message: 'RPC timeout - retrying...', time: '22m ago' },
  ];

  const typeColors = {
    discovery: 'bg-gold-500/20 text-gold-400',
    raid: 'bg-red-500/20 text-red-400',
    stake: 'bg-purple-500/20 text-purple-400',
    payout: 'bg-green-500/20 text-green-400',
    error: 'bg-red-500/20 text-red-400',
  };

  return (
    <div className="bg-coal-900 border border-coal-700 rounded-xl p-6">
      <h3 className="text-lg font-bold text-white mb-4">Recent Activity</h3>
      <div className="space-y-3">
        {activities.map((activity, i) => (
          <div key={i} className="flex items-start gap-3">
            <div className={`px-2 py-1 rounded text-xs font-medium ${typeColors[activity.type as keyof typeof typeColors]}`}>
              {activity.type}
            </div>
            <div className="flex-1">
              <p className="text-coal-300 text-sm">{activity.message}</p>
            </div>
            <span className="text-coal-600 text-xs">{activity.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<SystemStats>({
    activeMiners: 0,
    totalHashrate: 0,
    discoveriesToday: 0,
    activeRaids: 0,
    totalStaked: 0,
    rewardWalletBalance: 0,
    serverUptime: '0h 0m',
    wsConnections: 0,
    errorsToday: 0,
    pendingDistributions: 0,
  });

  const [health, setHealth] = useState<ServerHealth>({
    cpu: 0,
    memory: 0,
    wsLatency: 0,
    rpcLatency: 0,
    status: 'healthy',
  });

  // Simulate loading stats (replace with real API calls)
  useEffect(() => {
    // Simulated data - replace with actual API calls
    setStats({
      activeMiners: 847,
      totalHashrate: 125_000_000,
      discoveriesToday: 156,
      activeRaids: 3,
      totalStaked: 2_500_000,
      rewardWalletBalance: 45_000,
      serverUptime: '14d 6h 23m',
      wsConnections: 412,
      errorsToday: 7,
      pendingDistributions: 2,
    });

    setHealth({
      cpu: 32,
      memory: 48,
      wsLatency: 12,
      rpcLatency: 85,
      status: 'healthy',
    });
  }, []);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-white">Dashboard</h1>
          <p className="text-coal-500 mt-1">System overview and key metrics</p>
        </div>
        <div className="flex items-center gap-2 text-coal-500 text-sm">
          <span>Last updated:</span>
          <span className="text-white font-mono">{new Date().toLocaleTimeString()}</span>
        </div>
      </div>

      {/* Key Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          label="Active Miners" 
          value={stats.activeMiners.toLocaleString()} 
          icon="👷"
          change="+12 from yesterday"
          changeType="positive"
        />
        <StatCard 
          label="Network Hashrate" 
          value={`${(stats.totalHashrate / 1_000_000).toFixed(1)} MH/s`} 
          icon="⚡"
          change="+5.2% from yesterday"
          changeType="positive"
        />
        <StatCard 
          label="Discoveries Today" 
          value={stats.discoveriesToday} 
          icon="💎"
          change="On pace for 180"
          changeType="neutral"
        />
        <StatCard 
          label="Active Raids" 
          value={stats.activeRaids} 
          icon="⚔️"
        />
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          label="Total Staked" 
          value={`${(stats.totalStaked / 1_000_000).toFixed(2)}M COAL`} 
          icon="🔒"
        />
        <StatCard 
          label="Reward Wallet" 
          value={`${stats.rewardWalletBalance.toLocaleString()} COAL`} 
          icon="💰"
        />
        <StatCard 
          label="WS Connections" 
          value={stats.wsConnections} 
          icon="🔗"
        />
        <StatCard 
          label="Errors Today" 
          value={stats.errorsToday} 
          icon="⚠️"
          changeType={stats.errorsToday > 10 ? 'negative' : 'neutral'}
        />
      </div>

      {/* Health and Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <HealthIndicator health={health} />
        <div className="lg:col-span-2">
          <RecentActivity />
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-coal-900 border border-coal-700 rounded-xl p-6">
        <h3 className="text-lg font-bold text-white mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <button className="p-4 bg-coal-800 hover:bg-coal-700 rounded-lg text-center transition-colors">
            <div className="text-2xl mb-2">🔄</div>
            <div className="text-sm text-coal-300">Refresh Stats</div>
          </button>
          <button className="p-4 bg-coal-800 hover:bg-coal-700 rounded-lg text-center transition-colors">
            <div className="text-2xl mb-2">💸</div>
            <div className="text-sm text-coal-300">Force Buyback</div>
          </button>
          <button className="p-4 bg-coal-800 hover:bg-coal-700 rounded-lg text-center transition-colors">
            <div className="text-2xl mb-2">📤</div>
            <div className="text-sm text-coal-300">Trigger Distribution</div>
          </button>
          <button className="p-4 bg-coal-800 hover:bg-coal-700 rounded-lg text-center transition-colors">
            <div className="text-2xl mb-2">🧹</div>
            <div className="text-sm text-coal-300">Clear Cache</div>
          </button>
        </div>
      </div>

      {/* Server Info */}
      <div className="text-center text-coal-600 text-sm">
        Server Uptime: {stats.serverUptime} • Pending Distributions: {stats.pendingDistributions}
      </div>
    </div>
  );
}
