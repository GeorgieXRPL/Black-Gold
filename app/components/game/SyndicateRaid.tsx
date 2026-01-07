'use client';

/**
 * @fileoverview Syndicate Raid Panel
 * UI for organizing and launching coordinated syndicate raids
 */

import { useState } from 'react';
import { Mine, RESOURCE_COLORS } from '../../lib/mines';

export interface SyndicateRaidInfo {
  id: string;
  syndicateId: string;
  syndicateTag: string;
  targetMine: Mine;
  participants: string[];
  pooledAttackPower: number;
  totalBets: number;
  userBet: number;
  estimatedDefensePower: number;
  status: 'pending' | 'active' | 'completed' | 'failed';
  expiresAt: Date;
}

interface SyndicateRaidProps {
  /** Current pending or active raid */
  raid: SyndicateRaidInfo | null;
  /** List of potential target mines */
  targetMines: Array<{
    mine: Mine;
    defensePower: number;
    hasImmunity: boolean;
  }>;
  /** User's max bet (20% of stake) */
  maxBet: number;
  /** Whether user can propose raids */
  canPropose: boolean;
  /** Whether user is in a syndicate */
  inSyndicate: boolean;
  onProposeRaid?: (targetMineId: string, betAmount: number) => void;
  onJoinRaid?: (betAmount: number) => void;
  onLeaveRaid?: () => void;
  onLaunchRaid?: () => void;
  onCancelRaid?: () => void;
}

function formatTimeRemaining(expiresAt: Date): string {
  const remaining = expiresAt.getTime() - Date.now();
  if (remaining <= 0) return 'Expired';
  
  const hours = Math.floor(remaining / (60 * 60 * 1000));
  const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
  
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function truncateWallet(wallet: string): string {
  return `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;
}

export default function SyndicateRaid({
  raid,
  targetMines,
  maxBet,
  canPropose,
  inSyndicate,
  onProposeRaid,
  onJoinRaid,
  onLeaveRaid,
  onLaunchRaid,
  onCancelRaid,
}: SyndicateRaidProps) {
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [betAmount, setBetAmount] = useState(0);
  const [showTargetList, setShowTargetList] = useState(false);

  if (!inSyndicate) {
    return (
      <div className="bg-coal-900/90 backdrop-blur-sm border border-coal-700 rounded-xl p-6 text-center">
        <div className="text-4xl mb-3">⚔️</div>
        <h3 className="text-lg font-bold text-white mb-2">Syndicate Raids</h3>
        <p className="text-coal-400 text-sm">
          Join a syndicate to participate in coordinated raids!
        </p>
      </div>
    );
  }

  // Active or pending raid
  if (raid) {
    const targetColors = RESOURCE_COLORS[raid.targetMine.resource];
    const winChance = Math.min(90, Math.max(10, 
      (raid.pooledAttackPower / (raid.estimatedDefensePower * 1.2)) * 50
    ));
    const userInRaid = raid.userBet >= 0;

    return (
      <div className="bg-coal-900/90 backdrop-blur-sm border border-coal-700 rounded-xl overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-coal-700 bg-gradient-to-r from-purple-900/50 to-red-900/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">⚔️</span>
              <span className="px-2 py-0.5 bg-purple-600 text-white text-xs font-bold rounded">
                [{raid.syndicateTag}]
              </span>
              <span className="font-bold text-white">
                {raid.status === 'pending' ? 'Raid Forming' : 'Raid Active'}
              </span>
            </div>
            <span className={`text-sm ${raid.status === 'pending' ? 'text-yellow-400' : 'text-red-400 animate-pulse'}`}>
              {formatTimeRemaining(raid.expiresAt)}
            </span>
          </div>
        </div>

        {/* Target info */}
        <div className="p-4 border-b border-coal-700">
          <div 
            className="rounded-lg p-3"
            style={{ 
              background: `linear-gradient(135deg, ${targetColors.primary}40, transparent)`,
              borderLeft: `3px solid ${targetColors.glow}`,
            }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">🎯</span>
              <span 
                className="px-2 py-0.5 text-xs font-bold rounded uppercase"
                style={{ backgroundColor: targetColors.glow, color: targetColors.primary }}
              >
                {raid.targetMine.resource}
              </span>
              <span className="text-white font-bold">{raid.targetMine.name}</span>
            </div>
            <p className="text-sm text-coal-400">{raid.targetMine.countryName}</p>
          </div>
        </div>

        {/* Stats */}
        <div className="p-4 border-b border-coal-700 grid grid-cols-2 gap-4">
          <div className="bg-coal-800/50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-purple-400">
              {raid.participants.length}
            </div>
            <div className="text-xs text-coal-400">Participants</div>
          </div>
          <div className="bg-coal-800/50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-gold-400">
              {raid.totalBets.toLocaleString()}
            </div>
            <div className="text-xs text-coal-400">Total Bets</div>
          </div>
        </div>

        {/* Battle forecast */}
        <div className="p-4 border-b border-coal-700">
          <div className="text-xs text-coal-400 uppercase mb-2">Battle Forecast</div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-coal-300">Pooled Attack</span>
              <span className="text-purple-400 font-semibold">{raid.pooledAttackPower.toFixed(0)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-coal-300">Est. Defense</span>
              <span className="text-blue-400 font-semibold">{raid.estimatedDefensePower.toFixed(0)}</span>
            </div>
            <div className="h-2 bg-coal-800 rounded-full overflow-hidden mt-2">
              <div 
                className="h-full bg-gradient-to-r from-purple-500 to-red-500 transition-all"
                style={{ width: `${winChance}%` }}
              />
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-coal-500">Win Chance</span>
              <span className={`font-semibold ${
                winChance >= 60 ? 'text-green-400' : 
                winChance >= 40 ? 'text-yellow-400' : 'text-red-400'
              }`}>
                {winChance.toFixed(0)}%
              </span>
            </div>
          </div>
        </div>

        {/* Join/Bet section */}
        {raid.status === 'pending' && (
          <div className="p-4 border-b border-coal-700">
            {!userInRaid ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-coal-300">Your Bet</span>
                  <span className="text-xs text-coal-500">Max: {maxBet.toLocaleString()}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max={maxBet}
                  value={betAmount}
                  onChange={(e) => setBetAmount(Number(e.target.value))}
                  className="w-full accent-purple-500"
                />
                <div className="text-center text-lg font-bold text-white">
                  {betAmount.toLocaleString()} COAL
                </div>
                <button
                  onClick={() => onJoinRaid?.(betAmount)}
                  className="w-full py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-semibold transition-colors"
                >
                  Join Raid
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-center">
                  <div className="text-sm text-coal-400">Your Bet</div>
                  <div className="text-xl font-bold text-gold-400">
                    {raid.userBet.toLocaleString()} COAL
                  </div>
                </div>
                <button
                  onClick={onLeaveRaid}
                  className="w-full py-2 bg-coal-700 hover:bg-coal-600 text-white rounded-lg transition-colors"
                >
                  Leave Raid
                </button>
              </div>
            )}
          </div>
        )}

        {/* Participants */}
        <div className="p-4 border-b border-coal-700">
          <div className="text-xs text-coal-400 uppercase mb-2">
            Participants ({raid.participants.length}/3 min)
          </div>
          <div className="flex flex-wrap gap-1">
            {raid.participants.slice(0, 10).map((wallet) => (
              <span
                key={wallet}
                className="px-2 py-1 bg-coal-800 text-coal-300 text-xs rounded font-mono"
              >
                {truncateWallet(wallet)}
              </span>
            ))}
            {raid.participants.length > 10 && (
              <span className="px-2 py-1 text-coal-500 text-xs">
                +{raid.participants.length - 10} more
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        {raid.status === 'pending' && canPropose && (
          <div className="p-4 flex gap-3">
            <button
              onClick={onCancelRaid}
              className="flex-1 py-2 bg-coal-700 hover:bg-coal-600 text-white rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onLaunchRaid}
              disabled={raid.participants.length < 3}
              className="flex-1 py-2 bg-gradient-to-r from-purple-600 to-red-600 hover:from-purple-500 hover:to-red-500 disabled:from-coal-700 disabled:to-coal-700 text-white rounded-lg font-bold transition-colors"
            >
              Launch Raid
            </button>
          </div>
        )}

        {raid.status === 'active' && (
          <div className="p-4 text-center">
            <div className="text-xl animate-pulse">⚔️</div>
            <div className="text-sm text-coal-400 mt-2">
              Raid in progress... waiting for target to find a discovery
            </div>
          </div>
        )}
      </div>
    );
  }

  // No active raid - show propose UI
  return (
    <div className="bg-coal-900/90 backdrop-blur-sm border border-coal-700 rounded-xl overflow-hidden">
      <div className="p-4 border-b border-coal-700">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <span>⚔️</span> Syndicate Raids
        </h3>
        <p className="text-sm text-coal-400 mt-1">
          Coordinate with your syndicate for powerful raids
        </p>
      </div>

      {canPropose ? (
        <div className="p-4">
          {!showTargetList ? (
            <button
              onClick={() => setShowTargetList(true)}
              className="w-full py-3 bg-gradient-to-r from-purple-600 to-red-600 hover:from-purple-500 hover:to-red-500 text-white rounded-lg font-bold transition-colors"
            >
              Propose New Raid
            </button>
          ) : (
            <div className="space-y-3">
              <div className="text-sm text-coal-400">Select Target Mine</div>
              
              <div className="max-h-60 overflow-y-auto space-y-2">
                {targetMines
                  .filter(t => !t.hasImmunity)
                  .map(({ mine, defensePower }) => {
                    const colors = RESOURCE_COLORS[mine.resource];
                    return (
                      <button
                        key={mine.id}
                        onClick={() => setSelectedTarget(mine.id)}
                        className={`w-full p-3 rounded-lg border transition-colors text-left ${
                          selectedTarget === mine.id
                            ? 'border-purple-500 bg-purple-900/30'
                            : 'border-coal-700 bg-coal-800/50 hover:border-coal-600'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span 
                              className="px-1.5 py-0.5 text-xs font-bold rounded uppercase"
                              style={{ backgroundColor: colors.glow, color: colors.primary }}
                            >
                              {mine.resource}
                            </span>
                            <span className="text-white font-semibold">{mine.name}</span>
                          </div>
                          <span className="text-xs text-coal-400">
                            Def: {defensePower.toFixed(0)}
                          </span>
                        </div>
                      </button>
                    );
                  })}
              </div>

              {selectedTarget && (
                <div className="space-y-3 pt-3 border-t border-coal-700">
                  <div className="flex items-center justify-between">
                    <span className="text-coal-300">Your Bet (optional)</span>
                    <span className="text-xs text-coal-500">Max: {maxBet.toLocaleString()}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max={maxBet}
                    value={betAmount}
                    onChange={(e) => setBetAmount(Number(e.target.value))}
                    className="w-full accent-purple-500"
                  />
                  <div className="text-center text-lg font-bold text-white">
                    {betAmount.toLocaleString()} COAL
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => {
                    setShowTargetList(false);
                    setSelectedTarget(null);
                    setBetAmount(0);
                  }}
                  className="flex-1 py-2 bg-coal-700 hover:bg-coal-600 text-white rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (selectedTarget) {
                      onProposeRaid?.(selectedTarget, betAmount);
                      setShowTargetList(false);
                      setSelectedTarget(null);
                      setBetAmount(0);
                    }
                  }}
                  disabled={!selectedTarget}
                  className="flex-1 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-coal-700 text-white rounded-lg font-semibold transition-colors"
                >
                  Propose Raid
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="p-6 text-center text-coal-400">
          <p>Only leaders and officers can propose raids.</p>
          <p className="text-sm mt-2">Wait for a raid to be proposed or ask an officer!</p>
        </div>
      )}

      {/* Info */}
      <div className="p-4 border-t border-coal-700 bg-coal-800/30">
        <div className="text-xs text-coal-500 space-y-1">
          <div>• Need 3+ members to launch</div>
          <div>• Pooled attack power gets 10% coordination bonus</div>
          <div>• If raid fails, 10% of bets go to defenders, 90% burned 🔥</div>
        </div>
      </div>
    </div>
  );
}
