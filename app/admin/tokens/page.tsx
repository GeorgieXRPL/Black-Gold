'use client';

/**
 * @fileoverview Admin Tokens Page - Token configuration and wallet management
 * Uses real-time WebSocket data from useAdminSocket hook
 */

import { useState } from 'react';
import { useAdminContext } from '../layout';

interface TokenConfig {
  minHolderPercent: number;
  baseRewardAmount: number;
  pooledRewardPercent: number;
  distributionInterval: number; // minutes
  buybackThreshold: number;
  buybackEnabled: boolean;
}

interface Transaction {
  id: string;
  type: 'reward' | 'buyback' | 'distribution';
  amount: number;
  recipient?: string;
  txHash: string;
  timestamp: string;
  status: 'confirmed' | 'pending' | 'failed';
}

export default function TokensPage() {
  const { stats, executeAction } = useAdminContext();

  const [config, setConfig] = useState<TokenConfig>({
    minHolderPercent: 0.01,
    baseRewardAmount: 100,
    pooledRewardPercent: 30,
    distributionInterval: 60,
    buybackThreshold: 1.0,
    buybackEnabled: true,
  });

  // Use stats from WebSocket for wallet info
  const wallet = {
    address: process.env.NEXT_PUBLIC_REWARD_WALLET || 'Not configured',
    solBalance: 0, // TODO: Get from backend
    coalBalance: stats?.rewardWalletBalance || 0,
    pendingRewards: stats?.pendingDistributions || 0,
    lastBuyback: 'N/A',
    totalDistributed: 0, // TODO: Track in backend
  };

  // TODO: Get real transactions from backend
  const [transactions] = useState<Transaction[]>([]);

  const handleSaveConfig = () => {
    // TODO: Save config to backend via admin action
    alert('Configuration saved! (Note: Backend integration pending)');
  };

  const handleForceBuyback = () => {
    executeAction('force_buyback');
  };

  const handleTriggerDistribution = () => {
    executeAction('trigger_distribution');
  };

  const typeColors = {
    reward: 'bg-green-500/20 text-green-400',
    buyback: 'bg-purple-500/20 text-purple-400',
    distribution: 'bg-blue-500/20 text-blue-400',
  };

  const statusColors = {
    confirmed: 'text-green-400',
    pending: 'text-yellow-400',
    failed: 'text-red-400',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-display font-bold text-white">Token Configuration</h1>
        <p className="text-coal-500 mt-1">Manage token settings and wallet balances</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Configuration */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-coal-900 border border-coal-700 rounded-xl p-6">
            <h3 className="text-lg font-bold text-white mb-4">Holder Requirements</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-coal-400 text-sm block mb-2">Minimum Holder %</label>
                <input
                  type="number"
                  step="0.001"
                  value={config.minHolderPercent}
                  onChange={(e) => setConfig({ ...config, minHolderPercent: parseFloat(e.target.value) })}
                  className="w-full px-4 py-2 bg-coal-800 border border-coal-600 rounded-lg text-white focus:border-ember-500 outline-none"
                />
                <p className="text-coal-600 text-xs mt-1">% of supply required to mine</p>
              </div>
            </div>
          </div>

          <div className="bg-coal-900 border border-coal-700 rounded-xl p-6">
            <h3 className="text-lg font-bold text-white mb-4">Reward Settings</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-coal-400 text-sm block mb-2">Base Reward (COAL)</label>
                <input
                  type="number"
                  value={config.baseRewardAmount}
                  onChange={(e) => setConfig({ ...config, baseRewardAmount: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 bg-coal-800 border border-coal-600 rounded-lg text-white focus:border-ember-500 outline-none"
                />
              </div>
              <div>
                <label className="text-coal-400 text-sm block mb-2">Pooled Reward %</label>
                <input
                  type="number"
                  value={config.pooledRewardPercent}
                  onChange={(e) => setConfig({ ...config, pooledRewardPercent: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 bg-coal-800 border border-coal-600 rounded-lg text-white focus:border-ember-500 outline-none"
                />
                <p className="text-coal-600 text-xs mt-1">% that goes to vault (rest is instant)</p>
              </div>
              <div>
                <label className="text-coal-400 text-sm block mb-2">Distribution Interval (min)</label>
                <input
                  type="number"
                  value={config.distributionInterval}
                  onChange={(e) => setConfig({ ...config, distributionInterval: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 bg-coal-800 border border-coal-600 rounded-lg text-white focus:border-ember-500 outline-none"
                />
              </div>
            </div>
          </div>

          <div className="bg-coal-900 border border-coal-700 rounded-xl p-6">
            <h3 className="text-lg font-bold text-white mb-4">Buyback Settings</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-coal-400 text-sm block mb-2">Buyback Threshold (SOL)</label>
                <input
                  type="number"
                  step="0.1"
                  value={config.buybackThreshold}
                  onChange={(e) => setConfig({ ...config, buybackThreshold: parseFloat(e.target.value) })}
                  className="w-full px-4 py-2 bg-coal-800 border border-coal-600 rounded-lg text-white focus:border-ember-500 outline-none"
                />
                <p className="text-coal-600 text-xs mt-1">Min SOL to trigger buyback</p>
              </div>
              <div className="flex items-center gap-3">
                <label className="text-coal-400 text-sm">Buyback Enabled</label>
                <button
                  onClick={() => setConfig({ ...config, buybackEnabled: !config.buybackEnabled })}
                  className={`w-12 h-6 rounded-full transition-colors ${
                    config.buybackEnabled ? 'bg-green-500' : 'bg-coal-700'
                  }`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
                    config.buybackEnabled ? 'translate-x-6' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>
            </div>
          </div>

          <button
            onClick={handleSaveConfig}
            className="w-full py-3 bg-ember-600 hover:bg-ember-500 text-white font-bold rounded-lg transition-colors"
          >
            Save Configuration
          </button>
        </div>

        {/* Wallet Info */}
        <div className="space-y-6">
          <div className="bg-coal-900 border border-coal-700 rounded-xl p-6">
            <h3 className="text-lg font-bold text-white mb-4">Reward Wallet</h3>
            <div className="space-y-4">
              <div>
                <label className="text-coal-500 text-sm">Address</label>
                <p className="font-mono text-white text-sm truncate">{wallet.address}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-coal-500 text-sm">SOL Balance</label>
                  <p className="text-2xl font-bold text-purple-400">{wallet.solBalance.toFixed(2)}</p>
                </div>
                <div>
                  <label className="text-coal-500 text-sm">COAL Balance</label>
                  <p className="text-2xl font-bold text-ember-400">{wallet.coalBalance.toLocaleString()}</p>
                </div>
              </div>
              <div className="border-t border-coal-700 pt-4">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-coal-500">Pending Rewards</span>
                  <span className="text-yellow-400">{wallet.pendingRewards}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-coal-500">Total Distributed</span>
                  <span className="text-green-400">{wallet.totalDistributed.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-coal-900 border border-coal-700 rounded-xl p-6">
            <h3 className="text-lg font-bold text-white mb-4">Quick Actions</h3>
            <div className="space-y-2">
              <button 
                onClick={handleForceBuyback}
                className="w-full py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 rounded-lg transition-colors"
              >
                Force Buyback Now
              </button>
              <button 
                onClick={handleTriggerDistribution}
                className="w-full py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded-lg transition-colors"
              >
                Trigger Distribution
              </button>
              <button className="w-full py-2 bg-coal-800 hover:bg-coal-700 text-coal-300 rounded-lg transition-colors">
                View on Solscan
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Transaction History */}
      <div className="bg-coal-900 border border-coal-700 rounded-xl p-6">
        <h3 className="text-lg font-bold text-white mb-4">Recent Transactions</h3>
        <div className="space-y-3">
          {transactions.length === 0 ? (
            <p className="text-coal-500 text-center py-4">No recent transactions</p>
          ) : (
            transactions.map(tx => (
              <div key={tx.id} className="flex items-center justify-between py-3 border-b border-coal-800 last:border-0">
                <div className="flex items-center gap-4">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${typeColors[tx.type]}`}>
                    {tx.type}
                  </span>
                  <div>
                    <p className="text-white">
                      {tx.amount.toLocaleString()} COAL
                      {tx.recipient && <span className="text-coal-500"> → {tx.recipient}</span>}
                    </p>
                    <p className="text-coal-600 text-sm font-mono">{tx.txHash}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-sm ${statusColors[tx.status]}`}>{tx.status}</p>
                  <p className="text-coal-600 text-xs">{new Date(tx.timestamp).toLocaleTimeString()}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
