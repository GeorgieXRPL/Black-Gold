'use client';

/**
 * @fileoverview Admin Mines Page - Manage mine configurations and view stats
 */

import { useState } from 'react';
import { MINES, RESOURCE_COLORS, ResourceType } from '../../lib/mines';

interface MineAdminData {
  id: string;
  name: string;
  resource: ResourceType;
  activeMiners: number;
  hashrate: number;
  totalStake: number;
  discoveriesToday: number;
  vaultBalance: number;
  isActive: boolean;
  difficultyMultiplier: number;
  rewardMultiplier: number;
}

// Generate mock admin data from MINES
const generateMockMineData = (): MineAdminData[] => {
  return MINES.map(mine => ({
    id: mine.id,
    name: mine.name,
    resource: mine.resource,
    activeMiners: Math.floor(Math.random() * 50) + 5,
    hashrate: Math.floor(Math.random() * 5000000) + 500000,
    totalStake: Math.floor(Math.random() * 100000) + 10000,
    discoveriesToday: Math.floor(Math.random() * 20),
    vaultBalance: Math.floor(Math.random() * 500) + 50,
    isActive: true,
    difficultyMultiplier: 1.0,
    rewardMultiplier: 1.0,
  }));
};

export default function MinesPage() {
  const [mines, setMines] = useState<MineAdminData[]>(generateMockMineData());
  const [selectedMine, setSelectedMine] = useState<MineAdminData | null>(null);
  const [resourceFilter, setResourceFilter] = useState<'all' | ResourceType>('all');

  const filteredMines = mines.filter(mine => 
    resourceFilter === 'all' || mine.resource === resourceFilter
  );

  const handleToggleActive = (mineId: string) => {
    setMines(mines.map(m => m.id === mineId ? { ...m, isActive: !m.isActive } : m));
  };

  const handleUpdateMultipliers = (mineId: string, difficulty: number, reward: number) => {
    setMines(mines.map(m => m.id === mineId ? { 
      ...m, 
      difficultyMultiplier: difficulty,
      rewardMultiplier: reward 
    } : m));
    setSelectedMine(null);
  };

  const totalStats = {
    miners: filteredMines.reduce((a, b) => a + b.activeMiners, 0),
    hashrate: filteredMines.reduce((a, b) => a + b.hashrate, 0),
    stake: filteredMines.reduce((a, b) => a + b.totalStake, 0),
    discoveries: filteredMines.reduce((a, b) => a + b.discoveriesToday, 0),
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-white">Mines</h1>
          <p className="text-coal-500 mt-1">Manage mine configurations and statistics</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-coal-900 border border-coal-700 rounded-xl p-4 text-center">
          <p className="text-coal-500 text-sm">Total Miners</p>
          <p className="text-2xl font-bold text-white">{totalStats.miners}</p>
        </div>
        <div className="bg-coal-900 border border-coal-700 rounded-xl p-4 text-center">
          <p className="text-coal-500 text-sm">Total Hashrate</p>
          <p className="text-2xl font-bold text-ember-400">{(totalStats.hashrate / 1_000_000).toFixed(1)} MH/s</p>
        </div>
        <div className="bg-coal-900 border border-coal-700 rounded-xl p-4 text-center">
          <p className="text-coal-500 text-sm">Total Staked</p>
          <p className="text-2xl font-bold text-purple-400">{(totalStats.stake / 1000).toFixed(0)}K</p>
        </div>
        <div className="bg-coal-900 border border-coal-700 rounded-xl p-4 text-center">
          <p className="text-coal-500 text-sm">Discoveries Today</p>
          <p className="text-2xl font-bold text-gold-400">{totalStats.discoveries}</p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        <button
          onClick={() => setResourceFilter('all')}
          className={`px-4 py-2 rounded-lg transition-colors ${
            resourceFilter === 'all' 
              ? 'bg-ember-600 text-white' 
              : 'bg-coal-800 text-coal-400 hover:bg-coal-700'
          }`}
        >
          All ({mines.length})
        </button>
        {(['coal', 'gold', 'oil', 'silver'] as ResourceType[]).map(resource => (
          <button
            key={resource}
            onClick={() => setResourceFilter(resource)}
            className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${
              resourceFilter === resource 
                ? 'bg-ember-600 text-white' 
                : 'bg-coal-800 text-coal-400 hover:bg-coal-700'
            }`}
          >
            <div 
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: RESOURCE_COLORS[resource].glow }}
            />
            <span className="capitalize">{resource}</span>
          </button>
        ))}
      </div>

      {/* Mines Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredMines.map(mine => (
          <div 
            key={mine.id}
            className={`bg-coal-900 border rounded-xl p-5 ${
              mine.isActive ? 'border-coal-700' : 'border-red-900/50 bg-red-950/20'
            }`}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: RESOURCE_COLORS[mine.resource].glow }}
                  />
                  <h3 className="font-bold text-white">{mine.name}</h3>
                </div>
                <p className="text-coal-500 text-sm capitalize">{mine.resource}</p>
              </div>
              <button
                onClick={() => handleToggleActive(mine.id)}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                  mine.isActive 
                    ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30' 
                    : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                }`}
              >
                {mine.isActive ? 'Active' : 'Disabled'}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm mb-4">
              <div>
                <p className="text-coal-500">Miners</p>
                <p className="text-white font-mono">{mine.activeMiners}</p>
              </div>
              <div>
                <p className="text-coal-500">Hashrate</p>
                <p className="text-ember-400 font-mono">{(mine.hashrate / 1000).toFixed(0)} KH/s</p>
              </div>
              <div>
                <p className="text-coal-500">Staked</p>
                <p className="text-purple-400 font-mono">{mine.totalStake.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-coal-500">Vault</p>
                <p className="text-gold-400 font-mono">{mine.vaultBalance}</p>
              </div>
            </div>

            <div className="flex gap-2 text-xs border-t border-coal-800 pt-3">
              <span className="text-coal-500">
                Difficulty: <span className="text-white">{mine.difficultyMultiplier}x</span>
              </span>
              <span className="text-coal-500">
                Reward: <span className="text-white">{mine.rewardMultiplier}x</span>
              </span>
            </div>

            <button
              onClick={() => setSelectedMine(mine)}
              className="w-full mt-3 py-2 bg-coal-800 hover:bg-coal-700 text-coal-300 rounded-lg transition-colors text-sm"
            >
              Configure
            </button>
          </div>
        ))}
      </div>

      {/* Configure Modal */}
      {selectedMine && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-coal-900 border border-coal-700 rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">Configure {selectedMine.name}</h2>
              <button
                onClick={() => setSelectedMine(null)}
                className="text-coal-500 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-coal-400 text-sm block mb-2">Difficulty Multiplier</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="5"
                  defaultValue={selectedMine.difficultyMultiplier}
                  id="difficultyInput"
                  className="w-full px-4 py-2 bg-coal-800 border border-coal-600 rounded-lg text-white focus:border-ember-500 outline-none"
                />
                <p className="text-coal-600 text-xs mt-1">Higher = harder to find discoveries</p>
              </div>

              <div>
                <label className="text-coal-400 text-sm block mb-2">Reward Multiplier</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="5"
                  defaultValue={selectedMine.rewardMultiplier}
                  id="rewardInput"
                  className="w-full px-4 py-2 bg-coal-800 border border-coal-600 rounded-lg text-white focus:border-ember-500 outline-none"
                />
                <p className="text-coal-600 text-xs mt-1">Higher = more rewards per discovery</p>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    const difficulty = parseFloat((document.getElementById('difficultyInput') as HTMLInputElement).value);
                    const reward = parseFloat((document.getElementById('rewardInput') as HTMLInputElement).value);
                    handleUpdateMultipliers(selectedMine.id, difficulty, reward);
                  }}
                  className="flex-1 py-2 bg-ember-600 hover:bg-ember-500 text-white rounded-lg transition-colors"
                >
                  Save Changes
                </button>
                <button
                  onClick={() => setSelectedMine(null)}
                  className="flex-1 py-2 bg-coal-800 hover:bg-coal-700 text-white rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
