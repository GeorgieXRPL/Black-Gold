'use client';

/**
 * @fileoverview Expedition Panel for launching raids on other mines
 */

import { useState } from 'react';
import { Mine, RESOURCE_COLORS } from '../../lib/mines';

interface ExpeditionPanelProps {
  sourceMine: Mine;
  targetMine: Mine;
  userStake: number;
  estimatedAttackPower: number;
  estimatedDefensePower: number;
  cooldownRemaining: number | null;
  onLaunch: (betAmount: number) => void;
  onCancel: () => void;
}

export default function ExpeditionPanel({
  sourceMine,
  targetMine,
  userStake,
  estimatedAttackPower,
  estimatedDefensePower,
  cooldownRemaining,
  onLaunch,
  onCancel,
}: ExpeditionPanelProps) {
  const [betAmount, setBetAmount] = useState(0);
  const [betPercentage, setBetPercentage] = useState(0);

  const maxBet = Math.floor(userStake * 0.2); // 20% max bet
  const winChance = Math.min(90, Math.max(10, (estimatedAttackPower / (estimatedDefensePower * 1.2)) * 50));
  
  const targetColors = RESOURCE_COLORS[targetMine.resource];

  const handleBetChange = (percentage: number) => {
    setBetPercentage(percentage);
    setBetAmount(Math.floor(maxBet * (percentage / 100)));
  };

  const formatCooldown = (ms: number) => {
    const minutes = Math.ceil(ms / 60000);
    if (minutes >= 60) {
      return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
    }
    return `${minutes}m`;
  };

  if (cooldownRemaining && cooldownRemaining > 0) {
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-coal-900 border border-coal-700 rounded-xl w-full max-w-md p-6 text-center">
          <div className="text-6xl mb-4">⏳</div>
          <h2 className="text-xl font-bold text-white mb-2">Expedition Cooldown</h2>
          <p className="text-coal-400 mb-4">
            You must wait before launching another expedition
          </p>
          <div className="text-3xl font-bold text-ember-400 mb-6">
            {formatCooldown(cooldownRemaining)}
          </div>
          <button
            onClick={onCancel}
            className="w-full py-3 bg-coal-700 hover:bg-coal-600 text-white rounded-lg font-semibold transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-coal-900 border border-coal-700 rounded-xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-coal-700 bg-gradient-to-r from-purple-900/50 to-red-900/50">
          <h2 className="text-xl font-bold text-white">⚔️ Launch Expedition</h2>
          <p className="text-sm text-coal-400 mt-1">
            Raid {targetMine.name} from {sourceMine.name}
          </p>
        </div>

        {/* Target info */}
        <div className="p-4 border-b border-coal-700">
          <div 
            className="rounded-lg p-4"
            style={{ 
              background: `linear-gradient(135deg, ${targetColors.primary}40, transparent)`,
              borderLeft: `3px solid ${targetColors.glow}`,
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <span 
                className="px-2 py-0.5 text-xs font-bold rounded uppercase"
                style={{ backgroundColor: targetColors.glow, color: targetColors.primary }}
              >
                {targetMine.resource}
              </span>
              <span className="text-white font-bold">{targetMine.name}</span>
            </div>
            <p className="text-sm text-coal-400">{targetMine.countryName}</p>
          </div>
        </div>

        {/* Power comparison */}
        <div className="p-4 border-b border-coal-700">
          <div className="text-xs text-coal-400 uppercase mb-3">Battle Forecast</div>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-coal-300">Your Attack Power</span>
              <span className="text-purple-400 font-bold">{estimatedAttackPower.toFixed(0)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-coal-300">Their Defense Power</span>
              <span className="text-blue-400 font-bold">{estimatedDefensePower.toFixed(0)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-coal-300">Defense Advantage</span>
              <span className="text-yellow-400">1.2x</span>
            </div>
            
            <div className="h-px bg-coal-700" />
            
            <div className="flex items-center justify-between">
              <span className="text-white font-semibold">Win Chance</span>
              <span className={`font-bold text-lg ${
                winChance >= 60 ? 'text-green-400' : 
                winChance >= 40 ? 'text-yellow-400' : 'text-red-400'
              }`}>
                {winChance.toFixed(0)}%
              </span>
            </div>
          </div>

          {/* Visual bar */}
          <div className="mt-3 h-2 bg-coal-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-purple-500 to-red-500 transition-all"
              style={{ width: `${winChance}%` }}
            />
          </div>
        </div>

        {/* Bet section */}
        <div className="p-4 border-b border-coal-700">
          <div className="flex items-center justify-between mb-3">
            <span className="text-coal-300">Optional Bet</span>
            <span className="text-xs text-coal-500">Max: {maxBet.toLocaleString()} COAL (20%)</span>
          </div>

          <div className="space-y-3">
            <input
              type="range"
              min="0"
              max="100"
              value={betPercentage}
              onChange={(e) => handleBetChange(Number(e.target.value))}
              className="w-full accent-purple-500"
            />
            
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold text-white">{betAmount.toLocaleString()} COAL</span>
              <span className="text-sm text-coal-400">{betPercentage}% of max</span>
            </div>

            {betAmount > 0 && (
              <div className="bg-coal-800/50 rounded-lg p-3 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-coal-400">If you win:</span>
                  <span className="text-green-400 font-semibold">+{betAmount.toLocaleString()} COAL</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-coal-400">If you lose:</span>
                  <span className="text-red-400 font-semibold">-{betAmount.toLocaleString()} COAL (burned)</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="p-4 border-b border-coal-700">
          <div className="bg-coal-800/50 rounded-lg p-3 text-sm space-y-2">
            <div className="flex items-start gap-2">
              <span className="text-coal-500">•</span>
              <span className="text-coal-300">Expedition lasts up to 2 hours</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-coal-500">•</span>
              <span className="text-coal-300">Raid resolves when target makes a discovery</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-coal-500">•</span>
              <span className="text-coal-300">Win: Steal 10-30% of discovery rewards</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-coal-500">•</span>
              <span className="text-coal-300">Lose: Target gets 2h immunity + defenders share 10% of your bet (90% burned 🔥)</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="p-4 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 bg-coal-700 hover:bg-coal-600 text-white rounded-lg font-semibold transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onLaunch(betAmount)}
            className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-red-600 hover:from-purple-500 hover:to-red-500 text-white rounded-lg font-bold transition-colors"
          >
            ⚔️ Launch Raid
          </button>
        </div>
      </div>
    </div>
  );
}
