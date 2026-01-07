'use client';

/**
 * @fileoverview Home Base dashboard showing user's mining stats and actions
 */

import { Mine, MineStats, RESOURCE_COLORS, getStakeTier, formatDiscoveryTime, RESOURCE_MECHANICS } from '../../lib/mines';

interface HomeBaseProps {
  mine: Mine | null;
  stats: MineStats | undefined;
  userStake: number;
  hashrate: number;
  loyaltyDays: number;
  activeExpedition: {
    targetMine: string;
    timeRemaining: number;
  } | null;
  cooldowns: {
    expeditionCooldown: number | null;
    homeBaseCooldown: number | null;
  };
  onMiningToggle: () => void;
  onViewMine: () => void;
  isMining: boolean;
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export default function HomeBase({
  mine,
  stats,
  userStake,
  hashrate,
  loyaltyDays,
  activeExpedition,
  cooldowns,
  onMiningToggle,
  onViewMine,
  isMining,
}: HomeBaseProps) {
  if (!mine) {
    return (
      <div className="bg-coal-900/90 backdrop-blur-sm border border-coal-700 rounded-xl p-6 text-center h-full flex flex-col justify-center min-h-[200px]">
        <div className="text-5xl mb-3">🏠</div>
        <h2 className="text-lg font-bold text-white mb-2">No Home Base Set</h2>
        <p className="text-coal-400 text-sm">
          Select a mine on the globe and set it as your home base to start mining!
        </p>
      </div>
    );
  }

  const colors = RESOURCE_COLORS[mine.resource];
  const tier = getStakeTier(userStake);
  const mechanics = RESOURCE_MECHANICS[mine.resource];
  const effectiveHashrate = hashrate * tier.hashrateMultiplier;

  // Coal loyalty bonus
  const loyaltyBonus = mine.resource === 'coal' && loyaltyDays >= 7 ? 1.1 : 1.0;
  const finalHashrate = effectiveHashrate * loyaltyBonus;

  return (
    <div className="bg-coal-900/90 backdrop-blur-sm border border-coal-700 rounded-xl overflow-hidden">
      {/* Header */}
      <div 
        className="p-4 border-b border-coal-700"
        style={{ 
          background: `linear-gradient(135deg, ${colors.primary}60, transparent)`,
          borderTop: `3px solid ${colors.glow}`,
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl">🏠</span>
              <span 
                className="px-2 py-0.5 text-xs font-bold rounded uppercase"
                style={{ backgroundColor: colors.glow, color: colors.primary }}
              >
                {mine.resource}
              </span>
            </div>
            <h2 className="text-xl font-bold text-white">{mine.name}</h2>
            <p className="text-sm text-coal-400">{mine.countryName}</p>
          </div>
          <button
            onClick={onViewMine}
            className="px-3 py-1.5 bg-coal-700 hover:bg-coal-600 text-coal-300 rounded-lg text-sm transition-colors"
          >
            View on Globe
          </button>
        </div>
      </div>

      {/* Active expedition banner */}
      {activeExpedition && (
        <div className="px-4 pt-4">
          <div className="bg-purple-900/50 border border-purple-700 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">⚔️</span>
                <div>
                  <div className="text-sm font-semibold text-purple-300">Raiding {activeExpedition.targetMine}</div>
                  <div className="text-xs text-purple-400">Time remaining: {formatTime(activeExpedition.timeRemaining)}</div>
                </div>
              </div>
              <div className="text-2xl animate-pulse">🏴‍☠️</div>
            </div>
          </div>
        </div>
      )}

      {/* Stats grid */}
      <div className="p-4 grid grid-cols-2 gap-3">
        <div className="bg-coal-800/50 rounded-lg p-3">
          <div className="text-xs text-coal-400 uppercase">Base Hashrate</div>
          <div className="text-xl font-bold text-white">
            {(hashrate / 1000).toFixed(2)} <span className="text-sm">KH/s</span>
          </div>
        </div>
        <div className="bg-coal-800/50 rounded-lg p-3">
          <div className="text-xs text-coal-400 uppercase">Effective Hashrate</div>
          <div className="text-xl font-bold text-ember-400">
            {(finalHashrate / 1000).toFixed(2)} <span className="text-sm">KH/s</span>
          </div>
        </div>
        <div className="bg-coal-800/50 rounded-lg p-3">
          <div className="text-xs text-coal-400 uppercase">Your Stake</div>
          <div className="text-xl font-bold" style={{ color: colors.glow }}>
            {userStake.toLocaleString()}
          </div>
        </div>
        <div className="bg-coal-800/50 rounded-lg p-3">
          <div className="text-xs text-coal-400 uppercase">Tier</div>
          <div className="text-xl font-bold text-gold-400">{tier.name}</div>
          <div className="text-xs text-coal-500">{tier.hashrateMultiplier}x boost</div>
        </div>
      </div>

      {/* Loyalty info for coal */}
      {mine.resource === 'coal' && (
        <div className="px-4">
          <div className="bg-coal-800/50 rounded-lg p-3 mb-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-coal-400 uppercase">Loyalty Days</div>
                <div className="text-lg font-bold text-white">{loyaltyDays} days</div>
              </div>
              {loyaltyDays >= 7 ? (
                <div className="text-right">
                  <div className="text-xs text-green-400 uppercase">Bonus Active</div>
                  <div className="text-lg font-bold text-green-400">+10%</div>
                </div>
              ) : (
                <div className="text-right">
                  <div className="text-xs text-coal-500 uppercase">Bonus in</div>
                  <div className="text-lg font-bold text-coal-400">{7 - loyaltyDays} days</div>
                </div>
              )}
            </div>
            <div className="mt-2 h-1.5 bg-coal-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-green-500 transition-all"
                style={{ width: `${Math.min(100, (loyaltyDays / 7) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Mine stats */}
      <div className="px-4 pb-4">
        <div className="text-xs text-coal-400 uppercase mb-2">Mine Status</div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-coal-800/50 rounded-lg p-2">
            <div className="text-lg font-bold text-white">{stats?.minerCount || 0}</div>
            <div className="text-xs text-coal-500">Miners</div>
          </div>
          <div className="bg-coal-800/50 rounded-lg p-2">
            <div className="text-lg font-bold text-white">
              {stats ? (stats.hashrate / 1000).toFixed(0) : 0}
            </div>
            <div className="text-xs text-coal-500">KH/s</div>
          </div>
          <div className="bg-coal-800/50 rounded-lg p-2">
            <div className="text-lg font-bold text-white">{stats?.discoveriesFound || 0}</div>
            <div className="text-xs text-coal-500">Discoveries</div>
          </div>
        </div>
      </div>

      {/* Cooldowns */}
      {(cooldowns.expeditionCooldown || cooldowns.homeBaseCooldown) && (
        <div className="px-4 pb-4">
          <div className="text-xs text-coal-400 uppercase mb-2">Cooldowns</div>
          <div className="space-y-1">
            {cooldowns.expeditionCooldown && cooldowns.expeditionCooldown > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-coal-400">Expedition</span>
                <span className="text-yellow-400">{formatTime(cooldowns.expeditionCooldown)}</span>
              </div>
            )}
            {cooldowns.homeBaseCooldown && cooldowns.homeBaseCooldown > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-coal-400">Home Base Switch</span>
                <span className="text-yellow-400">{formatTime(cooldowns.homeBaseCooldown)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mining toggle */}
      <div className="p-4 border-t border-coal-700">
        <button
          onClick={onMiningToggle}
          className={`w-full py-4 rounded-xl font-bold text-lg transition-all ${
            isMining 
              ? 'bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white shadow-lg shadow-red-900/50' 
              : 'bg-gradient-to-r from-ember-600 to-ember-500 hover:from-ember-500 hover:to-ember-400 text-white shadow-lg shadow-ember-900/50'
          }`}
        >
          {isMining ? (
            <span className="flex items-center justify-center gap-2">
              <span className="animate-pulse">⛏️</span> Stop Mining
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              ⛏️ Start Mining
            </span>
          )}
        </button>
        
        {isMining && (
          <div className="mt-2 text-center text-xs text-coal-500">
            Mining at {mine.name} • {mechanics.discoveryName} every ~{formatDiscoveryTime(mechanics.discoveryTimeMs)}
          </div>
        )}
      </div>
    </div>
  );
}
