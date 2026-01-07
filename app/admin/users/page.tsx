'use client';

/**
 * @fileoverview Admin Users Page - Manage miners and user accounts
 */

import { useState } from 'react';

interface User {
  id: string;
  wallet: string;
  homeMine: string;
  stakeAmount: number;
  hashrate: number;
  discoveryCount: number;
  raidWins: number;
  raidLosses: number;
  lastActive: string;
  status: 'active' | 'idle' | 'banned';
  joinedAt: string;
}

// Mock data - replace with real API calls
const MOCK_USERS: User[] = [
  { id: '1', wallet: 'Abc1...xyz9', homeMine: 'Appalachian Basin', stakeAmount: 5000, hashrate: 150000, discoveryCount: 23, raidWins: 5, raidLosses: 2, lastActive: '2m ago', status: 'active', joinedAt: '2025-12-15' },
  { id: '2', wallet: 'Def2...uvw8', homeMine: 'Witwatersrand', stakeAmount: 2500, hashrate: 120000, discoveryCount: 18, raidWins: 3, raidLosses: 4, lastActive: '15m ago', status: 'active', joinedAt: '2025-12-20' },
  { id: '3', wallet: 'Ghi3...rst7', homeMine: 'Permian Basin', stakeAmount: 10000, hashrate: 0, discoveryCount: 45, raidWins: 12, raidLosses: 3, lastActive: '2h ago', status: 'idle', joinedAt: '2025-11-10' },
  { id: '4', wallet: 'Jkl4...opq6', homeMine: 'Super Pit', stakeAmount: 500, hashrate: 80000, discoveryCount: 8, raidWins: 1, raidLosses: 5, lastActive: '5m ago', status: 'active', joinedAt: '2026-01-02' },
  { id: '5', wallet: 'Mno5...lmn5', homeMine: 'Ghawar Field', stakeAmount: 0, hashrate: 0, discoveryCount: 2, raidWins: 0, raidLosses: 0, lastActive: '3d ago', status: 'banned', joinedAt: '2025-12-28' },
];

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>(MOCK_USERS);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'idle' | 'banned'>('all');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

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

  const handleBan = (userId: string) => {
    setUsers(users.map(u => u.id === userId ? { ...u, status: 'banned' as const } : u));
    setSelectedUser(null);
  };

  const handleUnban = (userId: string) => {
    setUsers(users.map(u => u.id === userId ? { ...u, status: 'idle' as const } : u));
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
              <th className="text-right px-6 py-4 text-coal-400 font-medium text-sm">Hashrate</th>
              <th className="text-right px-6 py-4 text-coal-400 font-medium text-sm">Discoveries</th>
              <th className="text-center px-6 py-4 text-coal-400 font-medium text-sm">Status</th>
              <th className="text-right px-6 py-4 text-coal-400 font-medium text-sm">Last Active</th>
              <th className="px-6 py-4"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-coal-800">
            {filteredUsers.map((user) => (
              <tr key={user.id} className="hover:bg-coal-800/50 transition-colors">
                <td className="px-6 py-4">
                  <span className="font-mono text-white">{user.wallet}</span>
                </td>
                <td className="px-6 py-4 text-coal-300">{user.homeMine}</td>
                <td className="px-6 py-4 text-right text-ember-400 font-mono">
                  {user.stakeAmount.toLocaleString()}
                </td>
                <td className="px-6 py-4 text-right text-coal-300 font-mono">
                  {user.hashrate > 0 ? `${(user.hashrate / 1000).toFixed(0)} KH/s` : '-'}
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
            ))}
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

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-coal-500 text-sm">Stake</label>
                  <p className="text-ember-400 font-mono">{selectedUser.stakeAmount.toLocaleString()}</p>
                </div>
                <div>
                  <label className="text-coal-500 text-sm">Discoveries</label>
                  <p className="text-gold-400">{selectedUser.discoveryCount}</p>
                </div>
                <div>
                  <label className="text-coal-500 text-sm">Raids (W/L)</label>
                  <p className="text-white">{selectedUser.raidWins}/{selectedUser.raidLosses}</p>
                </div>
              </div>

              <div className="border-t border-coal-700 pt-4 flex gap-3">
                {selectedUser.status !== 'banned' ? (
                  <button
                    onClick={() => handleBan(selectedUser.id)}
                    className="flex-1 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg transition-colors"
                  >
                    Ban User
                  </button>
                ) : (
                  <button
                    onClick={() => handleUnban(selectedUser.id)}
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
