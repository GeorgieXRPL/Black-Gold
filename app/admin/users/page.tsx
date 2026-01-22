'use client';

/**
 * @fileoverview Admin Users Page - Manage miners and user accounts
 * Uses real-time WebSocket data from useAdminSocket hook
 */

import { useState } from 'react';
import { useAdminContext } from '../layout';
import { AdminUser } from '../../../server/types';
import { getStakeTier } from '../../lib/mines';

/**
 * Calculate effective hashrate with staking multiplier
 */
function getEffectiveHashrate(baseHashrate: number, stakeAmount: number): number {
  const tier = getStakeTier(stakeAmount);
  return Math.floor(baseHashrate * tier.hashrateMultiplier);
}

export default function UsersPage() {
  const { users, executeAction } = useAdminContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'idle' | 'banned'>('all');
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.wallet.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         user.homeMine.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || user.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const statusColors = {
    active: 'bg-green-500/20 text-green-400',
    idle: 'bg-yellow-500/20 text-yellow-400',
    banned: 'bg-red-500/20 text-red-400',
  };

  const handleBan = (wallet: string) => {
    executeAction('ban_user', { wallet });
    setSelectedUser(null);
  };

  const handleUnban = (wallet: string) => {
    executeAction('unban_user', { wallet });
    setSelectedUser(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-white">Users</h1>
          <p className="text-coal-500 mt-1">Manage miners and user accounts</p>
        </div>
        <div className="text-coal-500">
          Total: <span className="text-white font-bold">{users.length}</span> users
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <input
          type="text"
          placeholder="Search by wallet or mine..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 px-4 py-2 bg-coal-900 border border-coal-700 rounded-lg text-white placeholder-coal-500 focus:border-ember-500 outline-none"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="px-4 py-2 bg-coal-900 border border-coal-700 rounded-lg text-white focus:border-ember-500 outline-none"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="idle">Idle</option>
          <option value="banned">Banned</option>
        </select>
      </div>

      {/* Users Table */}
      <div className="bg-coal-900 border border-coal-700 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-coal-800">
            <tr>
              <th className="text-left px-6 py-4 text-coal-400 font-medium text-sm">Wallet</th>
              <th className="text-left px-6 py-4 text-coal-400 font-medium text-sm">Home Mine</th>
              <th className="text-right px-6 py-4 text-coal-400 font-medium text-sm">Stake</th>
              <th className="text-center px-6 py-4 text-coal-400 font-medium text-sm">Tier</th>
              <th className="text-right px-6 py-4 text-coal-400 font-medium text-sm">Effective HR</th>
              <th className="text-right px-6 py-4 text-coal-400 font-medium text-sm">Discoveries</th>
              <th className="text-center px-6 py-4 text-coal-400 font-medium text-sm">Status</th>
              <th className="text-right px-6 py-4 text-coal-400 font-medium text-sm">Last Active</th>
              <th className="px-6 py-4"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-coal-800">
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-8 text-center text-coal-500">
                  {users.length === 0 ? 'No connected users' : 'No users match your filters'}
                </td>
              </tr>
            ) : (
              filteredUsers.map((user) => {
                const stakeTier = getStakeTier(user.stakeAmount);
                const effectiveHashrate = getEffectiveHashrate(user.hashrate, user.stakeAmount);
                return (
                  <tr key={user.id} className="hover:bg-coal-800/50 transition-colors">
                    <td className="px-6 py-4">
                      <span className="font-mono text-white">{user.wallet}</span>
                    </td>
                    <td className="px-6 py-4 text-coal-300">{user.homeMine}</td>
                    <td className="px-6 py-4 text-right text-ember-400 font-mono">
                      {user.stakeAmount.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        stakeTier.name === 'Diamond' ? 'bg-purple-500/20 text-purple-400' :
                        stakeTier.name === 'Gold' ? 'bg-gold-500/20 text-gold-400' :
                        stakeTier.name === 'Silver' ? 'bg-gray-400/20 text-gray-300' :
                        stakeTier.name === 'Bronze' ? 'bg-orange-500/20 text-orange-400' :
                        'bg-coal-600/20 text-coal-400'
                      }`}>
                        {stakeTier.name} ({stakeTier.hashrateMultiplier}x)
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-mono">
                      {user.hashrate > 0 ? (
                        <div>
                          <span className="text-green-400">{(effectiveHashrate / 1000).toFixed(0)} KH/s</span>
                          {stakeTier.hashrateMultiplier > 1 && (
                            <span className="text-coal-500 text-xs ml-1">
                              (base: {(user.hashrate / 1000).toFixed(0)})
                            </span>
                          )}
                        </div>
                      ) : '-'}
                    </td>
                    <td className="px-6 py-4 text-right text-gold-400">{user.discoveryCount}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[user.status]}`}>
                        {user.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-coal-500 text-sm">{user.lastActive}</td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => setSelectedUser(user)}
                        className="text-coal-500 hover:text-white transition-colors"
                      >
                        •••
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* User Detail Modal */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-coal-900 border border-coal-700 rounded-xl p-6 w-full max-w-lg">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">User Details</h2>
              <button
                onClick={() => setSelectedUser(null)}
                className="text-coal-500 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-coal-500 text-sm">Wallet</label>
                  <p className="text-white font-mono">{selectedUser.wallet}</p>
                </div>
                <div>
                  <label className="text-coal-500 text-sm">Status</label>
                  <p className={`inline-block px-2 py-1 rounded text-xs font-medium ${statusColors[selectedUser.status]}`}>
                    {selectedUser.status}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-coal-500 text-sm">Home Mine</label>
                  <p className="text-white">{selectedUser.homeMine}</p>
                </div>
                <div>
                  <label className="text-coal-500 text-sm">Joined</label>
                  <p className="text-white">{selectedUser.joinedAt}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-coal-500 text-sm">Stake</label>
                  <p className="text-ember-400 font-mono">{selectedUser.stakeAmount.toLocaleString()}</p>
                </div>
                <div>
                  <label className="text-coal-500 text-sm">Stake Tier</label>
                  <p className={`font-medium ${
                    getStakeTier(selectedUser.stakeAmount).name === 'Diamond' ? 'text-purple-400' :
                    getStakeTier(selectedUser.stakeAmount).name === 'Gold' ? 'text-gold-400' :
                    getStakeTier(selectedUser.stakeAmount).name === 'Silver' ? 'text-gray-300' :
                    getStakeTier(selectedUser.stakeAmount).name === 'Bronze' ? 'text-orange-400' :
                    'text-coal-400'
                  }`}>
                    {getStakeTier(selectedUser.stakeAmount).name} ({getStakeTier(selectedUser.stakeAmount).hashrateMultiplier}x)
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-coal-500 text-sm">Base Hashrate</label>
                  <p className="text-coal-300 font-mono">
                    {selectedUser.hashrate > 0 ? `${(selectedUser.hashrate / 1000).toFixed(0)} KH/s` : '-'}
                  </p>
                </div>
                <div>
                  <label className="text-coal-500 text-sm">Effective Hashrate</label>
                  <p className="text-green-400 font-mono">
                    {selectedUser.hashrate > 0 
                      ? `${(getEffectiveHashrate(selectedUser.hashrate, selectedUser.stakeAmount) / 1000).toFixed(0)} KH/s` 
                      : '-'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-coal-500 text-sm">Discoveries</label>
                  <p className="text-gold-400">{selectedUser.discoveryCount}</p>
                </div>
                <div>
                  <label className="text-coal-500 text-sm">Raid Wins</label>
                  <p className="text-green-400">{selectedUser.raidWins}</p>
                </div>
                <div>
                  <label className="text-coal-500 text-sm">Raid Losses</label>
                  <p className="text-red-400">{selectedUser.raidLosses}</p>
                </div>
              </div>

              <div className="border-t border-coal-700 pt-4 flex gap-3">
                {selectedUser.status !== 'banned' ? (
                  <button
                    onClick={() => handleBan(selectedUser.wallet)}
                    className="flex-1 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg transition-colors"
                  >
                    Ban User
                  </button>
                ) : (
                  <button
                    onClick={() => handleUnban(selectedUser.wallet)}
                    className="flex-1 py-2 bg-green-600/20 hover:bg-green-600/30 text-green-400 rounded-lg transition-colors"
                  >
                    Unban User
                  </button>
                )}
                <button
                  onClick={() => setSelectedUser(null)}
                  className="flex-1 py-2 bg-coal-800 hover:bg-coal-700 text-white rounded-lg transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
