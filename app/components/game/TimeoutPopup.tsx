'use client';

/**
 * @fileoverview Timeout winner popup for when round ends by time limit
 */

import { useState, useEffect } from 'react';

interface MinerShare {
  walletAddress: string;
  sharePercent: number;
  reward: number;
}

interface TimeoutPopupProps {
  isOpen: boolean;
  onClose: () => void;
  /** Whether current user was the winner */
  isWinner: boolean;
  /** Timeout data from server */
  data: {
    mineId: string;
    mineName: string;
    resource: string;
    winner: string | null;
    winnerHash?: string;
    totalReward: number;
    finderShare: number;
    vaultShare: number;
    rolloverAmount: number;
    participantCount: number;
    shares?: MinerShare[];
    nextRoundIn: number;
  } | null;
}

const RESOURCE_COLORS: Record<string, { bg: string; border: string; text: string; glow: string }> = {
  coal: { bg: 'from-orange-900/90 to-gray-900/90', border: 'border-orange-500', text: 'text-orange-400', glow: 'shadow-orange-500/50' },
  gold: { bg: 'from-yellow-900/90 to-amber-900/90', border: 'border-yellow-500', text: 'text-yellow-400', glow: 'shadow-yellow-500/50' },
  oil: { bg: 'from-blue-900/90 to-slate-900/90', border: 'border-blue-500', text: 'text-blue-400', glow: 'shadow-blue-500/50' },
  silver: { bg: 'from-gray-700/90 to-slate-800/90', border: 'border-gray-400', text: 'text-gray-300', glow: 'shadow-gray-400/50' },
};

const RESOURCE_EMOJIS: Record<string, string> = {
  coal: '⛏️',
  gold: '🥇',
  oil: '🛢️',
  silver: '🥈',
};

export function TimeoutPopup({ isOpen, onClose, isWinner, data }: TimeoutPopupProps) {
  const [countdown, setCountdown] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (isOpen && data) {
      setCountdown(Math.ceil(data.nextRoundIn / 1000));
      setIsAnimating(true);
    }
  }, [isOpen, data]);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    } else if (countdown === 0 && isOpen) {
      // Auto-close when countdown reaches 0
      const closeTimer = setTimeout(onClose, 500);
      return () => clearTimeout(closeTimer);
    }
  }, [countdown, isOpen, onClose]);

  if (!isOpen || !data) return null;

  const resource = data.resource || 'coal';
  const colors = RESOURCE_COLORS[resource] || RESOURCE_COLORS.coal;
  const emoji = RESOURCE_EMOJIS[resource] || '⏰';

  const formatAddress = (addr: string | null) => {
    if (!addr) return 'No Winner';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Popup Content */}
      <div className={`
        relative w-full max-w-md mx-4 rounded-2xl overflow-hidden
        bg-gradient-to-br ${colors.bg} ${colors.border} border-2
        shadow-2xl ${colors.glow}
        transform transition-all duration-500
        ${isAnimating ? 'scale-100 opacity-100' : 'scale-90 opacity-0'}
      `}>
        {/* Header */}
        <div className="p-6 text-center bg-gradient-to-b from-white/10 to-transparent">
          <div className="text-5xl mb-3">⏰</div>
          
          <h2 className={`text-2xl font-bold ${colors.text} mb-1`}>
            TIME'S UP!
          </h2>
          
          <p className="text-gray-300">
            {data.winner ? 'Closest Hash Wins' : 'No Qualified Winners'}
          </p>
          
          <p className="text-sm text-gray-400 mt-1">
            at {data.mineName}
          </p>
        </div>

        {/* Winner Section */}
        <div className="px-6 pb-4">
          {data.winner ? (
            <div className={`
              ${isWinner ? 'bg-yellow-900/40 border-yellow-500/50' : 'bg-black/30 border-white/10'}
              rounded-xl p-4 border text-center
            `}>
              {isWinner ? (
                <>
                  <p className="text-yellow-400 font-bold text-lg mb-1">🎉 YOU WON!</p>
                  <p className="text-sm text-gray-300">Closest hash to target</p>
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-400">Winner</p>
                  <p className={`text-lg font-mono ${colors.text}`}>
                    {formatAddress(data.winner)}
                  </p>
                </>
              )}
              
              {data.winnerHash && (
                <p className="text-xs text-gray-500 mt-2 font-mono">
                  Hash: {data.winnerHash}
                </p>
              )}
            </div>
          ) : (
            <div className="bg-black/30 rounded-xl p-4 border border-white/10 text-center">
              <p className="text-gray-400">No miners met minimum requirements</p>
              <p className="text-sm text-gray-500 mt-1">
                (10+ submissions, 50%+ round time)
              </p>
            </div>
          )}
        </div>

        {/* Rewards Breakdown */}
        <div className="px-6 pb-4 space-y-3">
          {/* Winner Reward */}
          {data.winner && (
            <div className="bg-black/30 rounded-xl p-4 border border-white/10">
              <h3 className="text-sm text-gray-400 uppercase tracking-wider mb-2">
                {isWinner ? 'Your Reward' : 'Winner Reward'} (35%)
              </h3>
              <p className={`text-2xl font-bold ${colors.text}`}>
                {data.finderShare.toLocaleString()} COAL
              </p>
              <p className="text-xs text-gray-500 mt-1">
                vs. 70% for finding actual solution
              </p>
            </div>
          )}
          
          {/* Rollover */}
          <div className="bg-yellow-900/20 rounded-xl p-4 border border-yellow-500/30">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm text-yellow-400 uppercase tracking-wider">
                  🎰 Rolling Over
                </h3>
                <p className="text-xs text-gray-400">Added to next round</p>
              </div>
              <p className="text-xl font-bold text-yellow-400">
                +{data.rolloverAmount.toLocaleString()} COAL
              </p>
            </div>
          </div>
          
          {/* Participants */}
          <div className="text-center text-sm text-gray-400">
            {data.participantCount} miners participated
          </div>
        </div>

        {/* Countdown */}
        <div className="px-6 pb-4 text-center">
          <div className="text-sm text-gray-400 mb-2">New round starting in</div>
          <div className={`text-4xl font-bold ${colors.text} tabular-nums`}>
            {countdown}s
          </div>
          <div className="mt-2 w-full bg-gray-700 rounded-full h-2 overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all duration-1000"
              style={{ 
                width: `${data.nextRoundIn > 0 ? (countdown / (data.nextRoundIn / 1000)) * 100 : 0}%` 
              }}
            />
          </div>
        </div>

        {/* Continue Button */}
        <div className="px-6 pb-6">
          <button
            onClick={onClose}
            className={`
              w-full py-3 rounded-xl font-bold text-lg
              bg-gradient-to-r from-gray-600 to-gray-700
              hover:from-gray-500 hover:to-gray-600
              text-white shadow-lg transform transition-all
              hover:scale-105 active:scale-95
            `}
          >
            Continue Mining
          </button>
        </div>
      </div>
    </div>
  );
}

export default TimeoutPopup;
