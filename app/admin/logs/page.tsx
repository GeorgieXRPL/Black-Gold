'use client';

/**
 * @fileoverview Admin Logs Page - Error logs and debugging tools
 */

import { useState } from 'react';

interface LogEntry {
  id: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  source: string;
  message: string;
  details?: string;
  timestamp: string;
}

// Mock logs
const MOCK_LOGS: LogEntry[] = [
  { id: '1', level: 'error', source: 'RPC', message: 'Connection timeout to Helius RPC', details: 'Retrying in 5s...', timestamp: '2026-01-07T10:45:32Z' },
  { id: '2', level: 'warn', source: 'Pool', message: 'High difficulty adjustment', details: 'Difficulty increased 15% due to fast discovery rate', timestamp: '2026-01-07T10:42:18Z' },
  { id: '3', level: 'info', source: 'Server', message: 'Hourly distribution completed', details: 'Distributed 1,250 COAL to 47 miners', timestamp: '2026-01-07T10:00:05Z' },
  { id: '4', level: 'error', source: 'Buyback', message: 'Jupiter swap failed', details: 'Slippage exceeded: expected 4,950 COAL, got quote for 4,820', timestamp: '2026-01-07T09:30:12Z' },
  { id: '5', level: 'info', source: 'WebSocket', message: 'New connection established', details: 'Wallet: Abc1...xyz9, Cores: 8', timestamp: '2026-01-07T09:28:45Z' },
  { id: '6', level: 'warn', source: 'AntiCheat', message: 'Suspicious activity detected', details: 'Wallet Xyz9...abc1 submitted 50 proofs in 10s', timestamp: '2026-01-07T09:15:22Z' },
  { id: '7', level: 'debug', source: 'Raid', message: 'Raid resolution started', details: 'Attack: 1,500 vs Defense: 1,200 (adjusted: 1,440)', timestamp: '2026-01-07T09:10:08Z' },
  { id: '8', level: 'info', source: 'Discovery', message: 'Coal Seam found', details: 'Mine: Appalachian Basin, Finder: Def2...uvw8', timestamp: '2026-01-07T09:05:33Z' },
  { id: '9', level: 'error', source: 'Rewards', message: 'Failed to send reward', details: 'Insufficient SOL for transaction fee', timestamp: '2026-01-07T08:45:19Z' },
  { id: '10', level: 'info', source: 'Server', message: 'Server started', details: 'Loaded 20 mines, WebSocket on port 8080', timestamp: '2026-01-07T08:00:00Z' },
];

export default function LogsPage() {
  const [logs] = useState<LogEntry[]>(MOCK_LOGS);
  const [levelFilter, setLevelFilter] = useState<'all' | 'info' | 'warn' | 'error' | 'debug'>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  const sources = ['all', ...new Set(logs.map(l => l.source))];

  const filteredLogs = logs.filter(log => {
    const matchesLevel = levelFilter === 'all' || log.level === levelFilter;
    const matchesSource = sourceFilter === 'all' || log.source === sourceFilter;
    const matchesSearch = log.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         log.details?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesLevel && matchesSource && matchesSearch;
  });

  const levelColors = {
    info: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    warn: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    error: 'bg-red-500/20 text-red-400 border-red-500/30',
    debug: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  };

  const levelIcons = {
    info: 'ℹ️',
    warn: '⚠️',
    error: '❌',
    debug: '🔍',
  };

  const errorCount = logs.filter(l => l.level === 'error').length;
  const warnCount = logs.filter(l => l.level === 'warn').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-white">Logs</h1>
          <p className="text-coal-500 mt-1">Error logs and debugging tools</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-red-400">{errorCount} errors</span>
            <span className="text-coal-600">•</span>
            <span className="text-yellow-400">{warnCount} warnings</span>
          </div>
          <button className="px-4 py-2 bg-coal-800 hover:bg-coal-700 text-coal-300 rounded-lg transition-colors text-sm">
            Export Logs
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <input
          type="text"
          placeholder="Search logs..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 min-w-[200px] px-4 py-2 bg-coal-900 border border-coal-700 rounded-lg text-white placeholder-coal-500 focus:border-ember-500 outline-none"
        />
        
        <div className="flex gap-2">
          {(['all', 'error', 'warn', 'info', 'debug'] as const).map(level => (
            <button
              key={level}
              onClick={() => setLevelFilter(level)}
              className={`px-3 py-2 rounded-lg transition-colors text-sm ${
                levelFilter === level 
                  ? 'bg-ember-600 text-white' 
                  : 'bg-coal-800 text-coal-400 hover:bg-coal-700'
              }`}
            >
              {level === 'all' ? 'All' : level.charAt(0).toUpperCase() + level.slice(1)}
            </button>
          ))}
        </div>

        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="px-4 py-2 bg-coal-900 border border-coal-700 rounded-lg text-white focus:border-ember-500 outline-none"
        >
          {sources.map(source => (
            <option key={source} value={source}>
              {source === 'all' ? 'All Sources' : source}
            </option>
          ))}
        </select>
      </div>

      {/* Logs List */}
      <div className="bg-coal-900 border border-coal-700 rounded-xl overflow-hidden">
        <div className="divide-y divide-coal-800">
          {filteredLogs.length === 0 ? (
            <div className="p-8 text-center text-coal-500">
              No logs match your filters
            </div>
          ) : (
            filteredLogs.map(log => (
              <div 
                key={log.id}
                className="p-4 hover:bg-coal-800/50 transition-colors cursor-pointer"
                onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
              >
                <div className="flex items-start gap-4">
                  <span className="text-lg">{levelIcons[log.level]}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium border ${levelColors[log.level]}`}>
                        {log.level.toUpperCase()}
                      </span>
                      <span className="text-coal-500 text-sm">{log.source}</span>
                      <span className="text-coal-600 text-xs">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-white">{log.message}</p>
                    {expandedLog === log.id && log.details && (
                      <div className="mt-2 p-3 bg-coal-800 rounded-lg">
                        <p className="text-coal-400 text-sm font-mono">{log.details}</p>
                      </div>
                    )}
                  </div>
                  <span className="text-coal-600 text-sm">
                    {expandedLog === log.id ? '▼' : '▶'}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-coal-900 border border-coal-700 rounded-xl p-6">
        <h3 className="text-lg font-bold text-white mb-4">Debug Tools</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <button className="p-4 bg-coal-800 hover:bg-coal-700 rounded-lg text-center transition-colors">
            <div className="text-2xl mb-2">🔄</div>
            <div className="text-sm text-coal-300">Refresh Logs</div>
          </button>
          <button className="p-4 bg-coal-800 hover:bg-coal-700 rounded-lg text-center transition-colors">
            <div className="text-2xl mb-2">🧹</div>
            <div className="text-sm text-coal-300">Clear Old Logs</div>
          </button>
          <button className="p-4 bg-coal-800 hover:bg-coal-700 rounded-lg text-center transition-colors">
            <div className="text-2xl mb-2">📊</div>
            <div className="text-sm text-coal-300">View Metrics</div>
          </button>
          <button className="p-4 bg-coal-800 hover:bg-coal-700 rounded-lg text-center transition-colors">
            <div className="text-2xl mb-2">🔔</div>
            <div className="text-sm text-coal-300">Alert Settings</div>
          </button>
        </div>
      </div>

      {/* WebSocket Connections */}
      <div className="bg-coal-900 border border-coal-700 rounded-xl p-6">
        <h3 className="text-lg font-bold text-white mb-4">Active WebSocket Connections</h3>
        <div className="grid grid-cols-4 gap-4 text-center">
          <div>
            <p className="text-3xl font-bold text-white">412</p>
            <p className="text-coal-500 text-sm">Total Connections</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-green-400">398</p>
            <p className="text-coal-500 text-sm">Active Mining</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-yellow-400">14</p>
            <p className="text-coal-500 text-sm">Idle</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-ember-400">12ms</p>
            <p className="text-coal-500 text-sm">Avg Latency</p>
          </div>
        </div>
      </div>
    </div>
  );
}
