'use client';

/**
 * @fileoverview Mining status component showing round progress, leaderboard, and rollover jackpot
 */

import { useMemo } from 'react';

interface LeaderboardEntry {
  wallet: string;
  distance: string;
  submissions: number;
}

interface MiningStatusProps {
  /** Current mine ID */
  mineId: string | null;
  /** Mine name for display */
  mineName: string;
  /** Resource type (coal, gold, oil, silver) */
  resource: string;
  /** Whether mining is active */
  isMining: boolean;
  /** Current hashrate */
  hashrate: number;
  /** Round start timestamp */
  roundStartTime: number | null;
  /** Maximum round time in ms (null = no timeout) */
  maxTime: number | null;
  /** Time remaining in ms (null = no timeout) */
  timeRemaining: number | null;
  /** Accumulated rollover jackpot */
  rolloverAmount: number;
  /** Leaderboard of top closest hashes */
  leaderboard: LeaderboardEntry[];
  /** Your current best hash info */
  yourBestHash?: {
    distance: string;
    submissions: number;
    rank: number;
  };
  /** Base reward for this mine */
  baseReward: number;
}

const RESOURCE_COLORS: Record<string, { border: string; text: string; bg: string; glow: string }> = {
  coal: { border: 'border-orange-500', text: 'text-orange-400', bg: 'bg-orange-900/20', glow: 'shadow-orange-500/30' },
  gold: { border: 'border-yellow-500', text: 'text-yellow-400', bg: 'bg-yellow-900/20', glow: 'shadow-yellow-500/30' },
  oil: { border: 'border-blue-500', text: 'text-blue-400', bg: 'bg-blue-900/20', glow: 'shadow-blue-500/30' },
  silver: { border: 'border-gray-400', text: 'text-gray-300', bg: 'bg-gray-700/20', glow: 'shadow-gray-400/30' },
};

export function MiningStatus({
  mineId,
  mineName,
  resource,
  isMining,
  hashrate,
  roundStartTime,
  maxTime,
  timeRemaining,
  rolloverAmount,
  leaderboard,
  yourBestHash,
  baseReward,
}: MiningStatusProps) {
  const colors = RESOURCE_COLORS[resource] || RESOURCE_COLORS.coal;
  
  // Calculate progress percentage
  const progressPercent = useMemo(() => {
    if (!maxTime || !roundStartTime) return null;
    const elapsed = Date.now() - roundStartTime;
    return Math.min(100, (elapsed / maxTime) * 100);
  }, [maxTime, roundStartTime]);
  
  // Format time remaining
  const timeDisplay = useMemo(() => {
    if (timeRemaining === null) return 'No limit';
    const minutes = Math.floor(timeRemaining / 60000);
    const seconds = Math.floor((timeRemaining % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, [timeRemaining]);
  
  // Total pot calculation
  const totalPot = baseReward + rolloverAmount;
  
  if (!isMining || !mineId) {
    return null;
  }
  
  return (
    <div className={`
      rounded-xl border ${colors.border} ${colors.bg} 
      backdrop-blur-sm shadow-lg ${colors.glow}
      overflow-hidden
    `}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/10 bg-black/20">
        <div className="flex items-center justify-between">
          <div>
            <h3 className={`font-bold ${colors.text}`}>{mineName}</h3>
            <p className="text-xs text-gray-400">Round Progress</p>
          </div>
          <div className="text-right">
            <div className={`text-lg font-bold ${colors.text}`}>
              {(hashrate / 1000).toFixed(1)} KH/s
            </div>
            <p className="text-xs text-gray-400">Your Hashrate</p>
          </div>
        </div>
      </div>
      
      {/* Timer Section */}
      {maxTime && (
        <div className="px-4 py-3 border-b border-white/10">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-400">Time Remaining</span>
            <span className={`text-xl font-bold tabular-nums ${
              timeRemaining && timeRemaining < 60000 ? 'text-red-400 animate-pulse' : colors.text
            }`}>
              {timeDisplay}
            </span>
          </div>
          
          {/* Progress Bar */}
          <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
            <div 
              className={`h-full transition-all duration-1000 ${
                progressPercent && progressPercent > 80 
                  ? 'bg-gradient-to-r from-red-500 to-orange-500' 
                  : 'bg-gradient-to-r from-green-500 to-emerald-500'
              }`}
              style={{ width: `${progressPercent || 0}%` }}
            />
          </div>
          
          {!maxTime && (
            <p className="text-xs text-gray-500 mt-1 text-center">
              Gold mines have no time limit - pure mining!
            </p>
          )}
        </div>
      )}
      
      {/* Pot & Jackpot */}
      <div className="px-4 py-3 border-b border-white/10 bg-black/10">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider">Current Pot</p>
            <p className={`text-xl font-bold ${colors.text}`}>
              {totalPot.toLocaleString()} COAL
            </p>
          </div>
          {rolloverAmount > 0 && (
            <div className="text-right">
              <p className="text-xs text-yellow-400 uppercase tracking-wider">🎰 Jackpot</p>
              <p className="text-lg font-bold text-yellow-400">
                +{rolloverAmount.toLocaleString()}
              </p>
            </div>
          )}
        </div>
      </div>
      
      {/* Leaderboard */}
      <div className="px-4 py-3">
        <h4 className="text-sm font-semibold text-gray-300 mb-2 flex items-center gap-2">
          <span>🏆</span> Closest Hash Leaderboard
        </h4>
        
        {leaderboard.length === 0 ? (
          <p className="text-xs text-gray-500 text-center py-2">
            No qualified miners yet
          </p>
        ) : (
          <div className="space-y-1">
            {leaderboard.slice(0, 5).map((entry, index) => (
              <div 
                key={entry.wallet}
                className={`
                  flex items-center justify-between py-1.5 px-2 rounded
                  ${index === 0 ? 'bg-yellow-900/30 border border-yellow-500/30' : 'bg-white/5'}
                `}
              >
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold ${
                    index === 0 ? 'text-yellow-400' :
                    index === 1 ? 'text-gray-300' :
                    index === 2 ? 'text-orange-400' :
                    'text-gray-500'
                  }`}>
                    #{index + 1}
                  </span>
                  <span className="text-sm text-gray-300 font-mono">
                    {entry.wallet}
                  </span>
                </div>
                <span className="text-xs text-gray-400">
                  {entry.submissions} subs
                </span>
              </div>
            ))}
          </div>
        )}
        
        {/* Your Stats */}
        {yourBestHash && (
          <div className={`mt-3 pt-3 border-t border-white/10 ${colors.bg} rounded px-2 py-2`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-400">Your Rank</p>
                <p className={`text-lg font-bold ${colors.text}`}>
                  #{yourBestHash.rank}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400">Submissions</p>
                <p className="text-sm text-gray-300">{yourBestHash.submissions}</p>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Footer Note */}
      {maxTime && (
        <div className="px-4 py-2 bg-black/20 border-t border-white/10">
          <p className="text-xs text-gray-500 text-center">
            {timeRemaining && timeRemaining > 0 
              ? 'Find the solution to win 70%, or closest hash wins 35% at timeout'
              : 'Timeout imminent - closest hash wins!'
            }
          </p>
        </div>
      )}
    </div>
  );
}

export default MiningStatus;
