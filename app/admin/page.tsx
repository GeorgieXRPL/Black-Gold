'use client';

/**
 * @fileoverview Admin Dashboard - Overview of system health and key metrics
 * Uses real-time WebSocket data from useAdminSocket hook
 */

import { useAdminContext } from './layout';

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

function RecentActivity({ logs }: { logs: Array<{ type: string; message: string; timestamp: string }> }) {
  const typeColors: Record<string, string> = {
    discovery: 'bg-gold-500/20 text-gold-400',
    raid: 'bg-red-500/20 text-red-400',
    stake: 'bg-purple-500/20 text-purple-400',
    payout: 'bg-green-500/20 text-green-400',
    error: 'bg-red-500/20 text-red-400',
    info: 'bg-blue-500/20 text-blue-400',
    warn: 'bg-yellow-500/20 text-yellow-400',
  };

  // Convert logs to activity format
  const activities = logs.slice(0, 5).map(log => ({
    type: log.type || 'info',
    message: log.message,
    time: new Date(log.timestamp).toLocaleTimeString(),
  }));

  return (
    <div className="bg-coal-900 border border-coal-700 rounded-xl p-6">
      <h3 className="text-lg font-bold text-white mb-4">Recent Activity</h3>
      <div className="space-y-3">
        {activities.length === 0 ? (
          <p className="text-coal-500 text-sm">No recent activity</p>
        ) : (
          activities.map((activity, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className={`px-2 py-1 rounded text-xs font-medium ${typeColors[activity.type] || typeColors.info}`}>
                {activity.type}
              </div>
              <div className="flex-1">
                <p className="text-coal-300 text-sm">{activity.message}</p>
              </div>
              <span className="text-coal-600 text-xs">{activity.time}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const { stats, logs, executeAction, status } = useAdminContext();

  // Default values when no data yet
  const displayStats = stats || {
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
    serverHealth: {
      cpu: 0,
      memory: 0,
      wsLatency: 0,
      rpcLatency: 0,
      status: 'healthy' as const,
    },
  };

  const handleRefreshStats = () => {
    // Stats are auto-refreshed via WebSocket, this is just for UI feedback
    console.log('[Admin] Manual refresh triggered');
  };

  const handleForceBuyback = () => {
    executeAction('force_buyback');
  };

  const handleTriggerDistribution = () => {
    executeAction('trigger_distribution');
  };

  const handleClearCache = () => {
    executeAction('clear_cache');
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-white">Dashboard</h1>
          <p className="text-coal-500 mt-1">System overview and key metrics</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-coal-500 text-sm">
            <span>Status:</span>
            <span className={`font-bold ${status === 'authenticated' ? 'text-green-400' : 'text-yellow-400'}`}>
              {status === 'authenticated' ? 'Live' : status}
            </span>
          </div>
          <div className="flex items-center gap-2 text-coal-500 text-sm">
            <span>Last updated:</span>
            <span className="text-white font-mono">{new Date().toLocaleTimeString()}</span>
          </div>
        </div>
      </div>

      {/* Key Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          label="Active Miners" 
          value={displayStats.activeMiners.toLocaleString()} 
          icon="👷"
          changeType="positive"
        />
        <StatCard 
          label="Network Hashrate" 
          value={`${(displayStats.totalHashrate / 1_000_000).toFixed(1)} MH/s`} 
          icon="⚡"
          changeType="positive"
        />
        <StatCard 
          label="Discoveries Today" 
          value={displayStats.discoveriesToday} 
          icon="💎"
          changeType="neutral"
        />
        <StatCard 
          label="Active Raids" 
          value={displayStats.activeRaids} 
          icon="⚔️"
        />
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          label="Total Staked" 
          value={`${(displayStats.totalStaked / 1_000_000).toFixed(2)}M COAL`} 
          icon="🔒"
        />
        <StatCard 
          label="Reward Wallet" 
          value={`${displayStats.rewardWalletBalance.toLocaleString()} COAL`} 
          icon="💰"
        />
        <StatCard 
          label="WS Connections" 
          value={displayStats.wsConnections} 
          icon="🔗"
        />
        <StatCard 
          label="Errors Today" 
          value={displayStats.errorsToday} 
          icon="⚠️"
          changeType={displayStats.errorsToday > 10 ? 'negative' : 'neutral'}
        />
      </div>

      {/* Health and Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <HealthIndicator health={displayStats.serverHealth} />
        <div className="lg:col-span-2">
          <RecentActivity logs={logs.map(l => ({ type: l.level, message: l.message, timestamp: l.timestamp }))} />
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-coal-900 border border-coal-700 rounded-xl p-6">
        <h3 className="text-lg font-bold text-white mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <button 
            onClick={handleRefreshStats}
            className="p-4 bg-coal-800 hover:bg-coal-700 rounded-lg text-center transition-colors"
          >
            <div className="text-2xl mb-2">🔄</div>
            <div className="text-sm text-coal-300">Refresh Stats</div>
          </button>
          <button 
            onClick={handleForceBuyback}
            className="p-4 bg-coal-800 hover:bg-coal-700 rounded-lg text-center transition-colors"
          >
            <div className="text-2xl mb-2">💸</div>
            <div className="text-sm text-coal-300">Force Buyback</div>
          </button>
          <button 
            onClick={handleTriggerDistribution}
            className="p-4 bg-coal-800 hover:bg-coal-700 rounded-lg text-center transition-colors"
          >
            <div className="text-2xl mb-2">📤</div>
            <div className="text-sm text-coal-300">Trigger Distribution</div>
          </button>
          <button 
            onClick={handleClearCache}
            className="p-4 bg-coal-800 hover:bg-coal-700 rounded-lg text-center transition-colors"
          >
            <div className="text-2xl mb-2">🧹</div>
            <div className="text-sm text-coal-300">Clear Cache</div>
          </button>
        </div>
      </div>

      {/* Server Info */}
      <div className="text-center text-coal-600 text-sm">
        Server Uptime: {displayStats.serverUptime} • Pending Distributions: {displayStats.pendingDistributions}
      </div>
    </div>
  );
}
