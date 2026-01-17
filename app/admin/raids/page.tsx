'use client';

/**
 * @fileoverview Admin Raids Page - View raid logs and analytics
 * Uses real-time WebSocket data from useAdminSocket hook
 */

import { useState } from 'react';
import { useAdminContext } from '../layout';

export default function RaidsPage() {
  const { raids } = useAdminContext();
  const [outcomeFilter, setOutcomeFilter] = useState<'all' | 'attacker_won' | 'defender_won' | 'pending'>('all');

  const filteredRaids = raids.filter(raid => 
    outcomeFilter === 'all' || raid.outcome === outcomeFilter
  );

  const stats = {
    total: raids.length,
    attackerWins: raids.filter(r => r.outcome === 'attacker_won').length,
    defenderWins: raids.filter(r => r.outcome === 'defender_won').length,
    pending: raids.filter(r => r.outcome === 'pending').length,
    totalStolen: raids.filter(r => r.stolenAmount).reduce((a, b) => a + (b.stolenAmount || 0), 0),
    totalBurned: raids.filter(r => r.burnedAmount).reduce((a, b) => a + (b.burnedAmount || 0), 0),
  };

  const outcomeColors = {
    attacker_won: 'bg-red-500/20 text-red-400',
    defender_won: 'bg-green-500/20 text-green-400',
    pending: 'bg-yellow-500/20 text-yellow-400',
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-display font-bold text-white">Raids</h1>
        <p className="text-coal-500 mt-1">Raid logs, analytics, and resolution</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-6 gap-4">
        <div className="bg-coal-900 border border-coal-700 rounded-xl p-4 text-center">
          <p className="text-coal-500 text-sm">Total Raids</p>
          <p className="text-2xl font-bold text-white">{stats.total}</p>
        </div>
        <div className="bg-coal-900 border border-coal-700 rounded-xl p-4 text-center">
          <p className="text-coal-500 text-sm">Attacker Wins</p>
          <p className="text-2xl font-bold text-red-400">{stats.attackerWins}</p>
        </div>
        <div className="bg-coal-900 border border-coal-700 rounded-xl p-4 text-center">
          <p className="text-coal-500 text-sm">Defender Wins</p>
          <p className="text-2xl font-bold text-green-400">{stats.defenderWins}</p>
        </div>
        <div className="bg-coal-900 border border-coal-700 rounded-xl p-4 text-center">
          <p className="text-coal-500 text-sm">Pending</p>
          <p className="text-2xl font-bold text-yellow-400">{stats.pending}</p>
        </div>
        <div className="bg-coal-900 border border-coal-700 rounded-xl p-4 text-center">
          <p className="text-coal-500 text-sm">Total Stolen</p>
          <p className="text-2xl font-bold text-ember-400">{stats.totalStolen}</p>
        </div>
        <div className="bg-coal-900 border border-coal-700 rounded-xl p-4 text-center">
          <p className="text-coal-500 text-sm">Total Burned</p>
          <p className="text-2xl font-bold text-orange-400">{stats.totalBurned}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {(['all', 'attacker_won', 'defender_won', 'pending'] as const).map(outcome => (
          <button
            key={outcome}
            onClick={() => setOutcomeFilter(outcome)}
            className={`px-4 py-2 rounded-lg transition-colors ${
              outcomeFilter === outcome 
                ? 'bg-ember-600 text-white' 
                : 'bg-coal-800 text-coal-400 hover:bg-coal-700'
            }`}
          >
            {outcome === 'all' ? 'All' : outcome.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
          </button>
        ))}
      </div>

      {/* Raids Table */}
      <div className="bg-coal-900 border border-coal-700 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-coal-800">
            <tr>
              <th className="text-left px-6 py-4 text-coal-400 font-medium text-sm">Time</th>
              <th className="text-left px-6 py-4 text-coal-400 font-medium text-sm">Attacker</th>
              <th className="text-left px-6 py-4 text-coal-400 font-medium text-sm">Source → Target</th>
              <th className="text-right px-6 py-4 text-coal-400 font-medium text-sm">Bet</th>
              <th className="text-center px-6 py-4 text-coal-400 font-medium text-sm">Power (Atk/Def)</th>
              <th className="text-center px-6 py-4 text-coal-400 font-medium text-sm">Outcome</th>
              <th className="text-right px-6 py-4 text-coal-400 font-medium text-sm">Result</th>
              <th className="px-6 py-4"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-coal-800">
            {filteredRaids.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-8 text-center text-coal-500">
                  {raids.length === 0 ? 'No raid data available' : 'No raids match your filter'}
                </td>
              </tr>
            ) : (
              filteredRaids.map((raid) => (
                <tr key={raid.id} className="hover:bg-coal-800/50 transition-colors">
                  <td className="px-6 py-4 text-coal-400 text-sm">{formatTime(raid.timestamp)}</td>
                  <td className="px-6 py-4 font-mono text-white">{raid.attackerWallet}</td>
                  <td className="px-6 py-4 text-coal-300 text-sm">
                    {raid.sourceMine} <span className="text-coal-600">→</span> {raid.defenderMine}
                  </td>
                  <td className="px-6 py-4 text-right text-ember-400 font-mono">
                    {raid.betAmount > 0 ? raid.betAmount : '-'}
                  </td>
                  <td className="px-6 py-4 text-center font-mono text-sm">
                    <span className="text-red-400">{raid.attackPower}</span>
                    <span className="text-coal-600"> / </span>
                    <span className="text-green-400">{raid.defensePower}</span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${outcomeColors[raid.outcome]}`}>
                      {raid.outcome === 'attacker_won' ? 'Attacker Won' : 
                       raid.outcome === 'defender_won' ? 'Defender Won' : 'Pending'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right text-sm">
                    {raid.stolenAmount && (
                      <span className="text-red-400">-{raid.stolenAmount} stolen</span>
                    )}
                    {raid.burnedAmount && (
                      <span className="text-orange-400">{raid.burnedAmount} burned</span>
                    )}
                    {raid.outcome === 'pending' && (
                      <span className="text-yellow-400">Waiting...</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {raid.outcome === 'pending' && (
                      <button className="text-xs px-2 py-1 bg-red-600/20 text-red-400 rounded hover:bg-red-600/30 transition-colors">
                        Force Resolve
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Win Rate Chart Placeholder */}
      <div className="bg-coal-900 border border-coal-700 rounded-xl p-6">
        <h3 className="text-lg font-bold text-white mb-4">Win Rate Analysis</h3>
        <div className="h-40 flex items-center justify-center text-coal-500">
          <div className="text-center">
            <p>Defender Win Rate: <span className="text-green-400 font-bold">
              {stats.total > 0 && (stats.total - stats.pending) > 0 
                ? ((stats.defenderWins / (stats.total - stats.pending)) * 100).toFixed(1) 
                : 0}%
            </span></p>
            <p className="text-sm mt-2">Defense advantage working as intended (1.2x bonus)</p>
          </div>
        </div>
      </div>
    </div>
  );
}
