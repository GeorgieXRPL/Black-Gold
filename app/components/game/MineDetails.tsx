'use client';

/**
 * @fileoverview Mine Details panel showing selected mine info
 */

import { useMemo } from 'react';
import { Mine, MineStats, RESOURCE_COLORS, RESOURCE_MECHANICS, formatDiscoveryTime, ResourceType } from '../../lib/mines';

type WalletMode = 'disconnected' | 'address-only' | 'full-connect';

interface MineDetailsProps {
  mine: Mine;
  stats: MineStats | undefined;
  userStake: number;
  isHome: boolean;
  onSetHome: () => void;
  onStartMining?: () => void;
  onStake?: () => void;
  onRaid?: () => void;
  isMining: boolean;
  canRaid: boolean;
  walletMode?: WalletMode;
}

export default function MineDetails({
  mine,
  stats,
  userStake,
  isHome,
  onSetHome,
  onStartMining,
  onStake,
  onRaid,
  isMining,
  canRaid,
  walletMode = 'disconnected',
}: MineDetailsProps) {
  const mechanics = RESOURCE_MECHANICS[mine.resource];
  const colors = RESOURCE_COLORS[mine.resource];

  const raidStatus = useMemo(() => {
    if (!stats) return null;
    if (stats.hasDefenseBuff) return { text: 'DEFENDED', color: 'text-green-400' };
    if (stats.activeRaidCount > 0) return { text: 'UNDER ATTACK', color: 'text-red-400' };
    if (stats.hasAttackDebuff) return { text: 'RECOVERING', color: 'text-yellow-400' };
    return null;
  }, [stats]);

  return (
    <div className="bg-coal-900/90 backdrop-blur-sm border border-coal-700 rounded-xl overflow-hidden">
      {/* Header with resource color accent */}
      <div 
        className="p-4 border-b border-coal-700"
        style={{ 
          background: `linear-gradient(135deg, ${colors.primary}40, transparent)`,
          borderTopColor: colors.glow,
          borderTopWidth: '3px',
        }}
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span 
                className="px-2 py-0.5 text-xs font-bold rounded uppercase"
                style={{ backgroundColor: colors.glow, color: colors.primary }}
              >
                {mine.resource}
              </span>
              {isHome && (
                <span className="px-2 py-0.5 text-xs font-bold rounded bg-green-500 text-white">
                  HOME
                </span>
              )}
              {raidStatus && (
                <span className={`px-2 py-0.5 text-xs font-bold rounded bg-coal-800 ${raidStatus.color} animate-pulse`}>
                  {raidStatus.text}
                </span>
              )}
            </div>
            <h2 className="text-xl font-bold text-white mt-1">{mine.name}</h2>
            <p className="text-sm text-coal-400">{mine.countryName}</p>
          </div>
        </div>
        <p className="text-sm text-coal-300 mt-2">{mine.description}</p>
      </div>

      {/* Stats grid */}
      <div className="p-4 grid grid-cols-2 gap-4">
        <div className="bg-coal-800/50 rounded-lg p-3">
          <div className="text-xs text-coal-400 uppercase">Miners</div>
          <div className="text-2xl font-bold text-white">{stats?.minerCount || 0}</div>
        </div>
        <div className="bg-coal-800/50 rounded-lg p-3">
          <div className="text-xs text-coal-400 uppercase">Hashrate</div>
          <div className="text-2xl font-bold text-white">
            {stats ? (stats.hashrate / 1000).toFixed(1) : '0'} <span className="text-sm">KH/s</span>
          </div>
        </div>
        <div className="bg-coal-800/50 rounded-lg p-3">
          <div className="text-xs text-coal-400 uppercase">Total Stake</div>
          <div className="text-2xl font-bold" style={{ color: colors.glow }}>
            {stats?.totalStake.toLocaleString() || 0}
          </div>
        </div>
        <div className="bg-coal-800/50 rounded-lg p-3">
          <div className="text-xs text-coal-400 uppercase">{mechanics.discoveryName}s Found</div>
          <div className="text-2xl font-bold text-white">{stats?.discoveriesFound || 0}</div>
        </div>
      </div>

      {/* Special ability */}
      <div className="px-4 pb-4">
        <div 
          className="rounded-lg p-3 border"
          style={{ borderColor: colors.glow + '40', backgroundColor: colors.primary + '20' }}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">✨</span>
            <span className="font-bold" style={{ color: colors.glow }}>{mechanics.abilityName}</span>
          </div>
          <p className="text-sm text-coal-300">{mechanics.abilityDescription}</p>
          <div className="mt-2 flex items-center gap-4 text-xs text-coal-400">
            <span>{mechanics.discoveryName}: {formatDiscoveryTime(mechanics.discoveryTimeMs)}</span>
            <span>•</span>
            <span>{mechanics.rewardStyle}</span>
          </div>
        </div>
      </div>

      {/* Your stake */}
      <div className="px-4 pb-4">
        <div className="bg-coal-800/50 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-coal-400 uppercase">Your Stake</div>
              <div className="text-xl font-bold text-ember-400">
                {userStake.toLocaleString()} COAL
              </div>
            </div>
            {onStake ? (
              <button
                onClick={onStake}
                className="px-4 py-2 bg-ember-600 hover:bg-ember-500 text-white rounded-lg font-semibold transition-colors"
              >
                {userStake > 0 ? 'Manage Stake' : 'Stake'}
              </button>
            ) : (
              <span className="text-xs text-coal-500 bg-coal-700 px-2 py-1 rounded">
                Connect wallet to stake
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Wallet mode notice for address-only users */}
      {walletMode === 'address-only' && (
        <div className="px-4 pb-4">
          <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-3 text-center">
            <p className="text-yellow-400 text-xs">
              💡 Connect your wallet for staking & raids
            </p>
          </div>
        </div>
      )}

      {/* Disconnected notice */}
      {walletMode === 'disconnected' && (
        <div className="px-4 pb-4">
          <div className="bg-coal-800/50 border border-coal-700 rounded-lg p-3 text-center">
            <p className="text-coal-400 text-xs">
              🔗 Connect wallet or enter address to start mining
            </p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="p-4 border-t border-coal-700 space-y-3">
        {!isHome && walletMode !== 'disconnected' && (
          <button
            onClick={onSetHome}
            className="w-full py-3 bg-green-600 hover:bg-green-500 text-white rounded-lg font-bold transition-colors"
          >
            🏠 Set as Home Base
          </button>
        )}
        
        {onStartMining ? (
          <button
            onClick={onStartMining}
            className={`w-full py-3 rounded-lg font-bold transition-colors ${
              isMining 
                ? 'bg-red-600 hover:bg-red-500 text-white' 
                : 'bg-ember-600 hover:bg-ember-500 text-white'
            }`}
          >
            {isMining ? '⛏️ Stop Mining' : '⛏️ Start Mining'}
          </button>
        ) : (
          <div className="w-full py-3 bg-coal-700 text-coal-400 rounded-lg font-bold text-center">
            Connect wallet to mine
          </div>
        )}

        {!isHome && canRaid && onRaid && (
          <button
            onClick={onRaid}
            className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-bold transition-colors"
          >
            ⚔️ Launch Raid
          </button>
        )}
      </div>
    </div>
  );
}
