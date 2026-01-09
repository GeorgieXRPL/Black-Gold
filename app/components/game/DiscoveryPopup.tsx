'use client';

import { useState, useEffect } from 'react';

interface DiscoveryPopupProps {
  isOpen: boolean;
  onClose: () => void;
  isWinner: boolean;
  discoveryData: {
    discoveryNumber: number;
    discoveryName: string;
    resource: string;
    mineName: string;
    winner?: string;
    finderReward?: number;
    vaultReward?: number;
    hash?: string;
  } | null;
  countdownSeconds?: number;
}

const RESOURCE_EMOJIS: Record<string, string> = {
  coal: '⛏️',
  gold: '🥇',
  silver: '🥈',
  oil: '🛢️',
};

const RESOURCE_COLORS: Record<string, { bg: string; border: string; text: string; glow: string }> = {
  coal: { bg: 'from-orange-900/90 to-gray-900/90', border: 'border-orange-500', text: 'text-orange-400', glow: 'shadow-orange-500/50' },
  gold: { bg: 'from-yellow-900/90 to-amber-900/90', border: 'border-yellow-500', text: 'text-yellow-400', glow: 'shadow-yellow-500/50' },
  silver: { bg: 'from-gray-700/90 to-slate-800/90', border: 'border-gray-400', text: 'text-gray-300', glow: 'shadow-gray-400/50' },
  oil: { bg: 'from-blue-900/90 to-slate-900/90', border: 'border-blue-500', text: 'text-blue-400', glow: 'shadow-blue-500/50' },
};

export function DiscoveryPopup({ isOpen, onClose, isWinner, discoveryData, countdownSeconds = 0 }: DiscoveryPopupProps) {
  const [countdown, setCountdown] = useState(countdownSeconds);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setCountdown(countdownSeconds);
      setIsAnimating(true);
      
      // Auto-close after animation if not winner
      if (!isWinner && countdownSeconds === 0) {
        const timer = setTimeout(() => {
          onClose();
        }, 5000);
        return () => clearTimeout(timer);
      }
    }
  }, [isOpen, countdownSeconds, isWinner, onClose]);

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
    }
  }, [countdown]);

  if (!isOpen || !discoveryData) return null;

  const resource = discoveryData.resource || 'coal';
  const colors = RESOURCE_COLORS[resource] || RESOURCE_COLORS.coal;
  const emoji = RESOURCE_EMOJIS[resource] || '⛏️';

  // Format wallet address for display
  const formatAddress = (addr: string) => {
    if (!addr) return 'Unknown';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={isWinner ? onClose : undefined}
      />

      {/* Popup Content */}
      <div className={`
        relative w-full max-w-md mx-4 rounded-2xl overflow-hidden
        bg-gradient-to-br ${colors.bg} ${colors.border} border-2
        shadow-2xl ${colors.glow}
        transform transition-all duration-500
        ${isAnimating ? 'scale-100 opacity-100' : 'scale-90 opacity-0'}
      `}>
        {/* Confetti effect for winner */}
        {isWinner && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {[...Array(20)].map((_, i) => (
              <div
                key={i}
                className="absolute w-2 h-2 rounded-full animate-confetti"
                style={{
                  left: `${Math.random() * 100}%`,
                  backgroundColor: ['#FFD700', '#FFA500', '#FF6B6B', '#4ECDC4', '#45B7D1'][i % 5],
                  animationDelay: `${Math.random() * 2}s`,
                  animationDuration: `${2 + Math.random() * 2}s`,
                }}
              />
            ))}
          </div>
        )}

        {/* Header */}
        <div className={`p-6 text-center ${isWinner ? 'bg-gradient-to-b from-yellow-500/20 to-transparent' : ''}`}>
          <div className="text-6xl mb-4 animate-bounce">
            {isWinner ? '🎉' : emoji}
          </div>
          
          <h2 className={`text-2xl font-bold ${colors.text} mb-2`}>
            {isWinner ? 'YOU FOUND IT!' : 'Discovery Found!'}
          </h2>
          
          <p className="text-lg text-gray-300">
            {discoveryData.discoveryName || 'Discovery'} #{discoveryData.discoveryNumber}
          </p>
          
          <p className="text-sm text-gray-400 mt-1">
            at {discoveryData.mineName}
          </p>
        </div>

        {/* Body */}
        <div className="px-6 pb-6 space-y-4">
          {/* Winner gets reward details */}
          {isWinner && discoveryData.finderReward !== undefined && (
            <div className="bg-black/30 rounded-xl p-4 border border-white/10">
              <h3 className="text-sm text-gray-400 uppercase tracking-wider mb-3">Your Rewards</h3>
              
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-300">Finder Reward (70%)</span>
                <span className={`text-xl font-bold ${colors.text}`}>
                  +{discoveryData.finderReward.toLocaleString()} COAL
                </span>
              </div>
              
              {discoveryData.vaultReward !== undefined && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">Added to Vault (30%)</span>
                  <span className="text-gray-400">
                    +{discoveryData.vaultReward.toLocaleString()} COAL
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Non-winners see who found it */}
          {!isWinner && discoveryData.winner && (
            <div className="bg-black/30 rounded-xl p-4 border border-white/10 text-center">
              <p className="text-gray-400 text-sm">Found by</p>
              <p className={`text-lg font-mono ${colors.text}`}>
                {formatAddress(discoveryData.winner)}
              </p>
            </div>
          )}

          {/* Countdown for non-winners */}
          {!isWinner && countdown > 0 && (
            <div className="text-center py-4">
              <div className="text-sm text-gray-400 mb-2">New mining session starts in</div>
              <div className={`text-5xl font-bold ${colors.text} tabular-nums`}>
                {countdown}s
              </div>
              <div className="mt-2 w-full bg-gray-700 rounded-full h-2 overflow-hidden">
                <div 
                  className={`h-full bg-gradient-to-r from-orange-500 to-yellow-500 transition-all duration-1000`}
                  style={{ width: `${(countdown / countdownSeconds) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Hash preview */}
          {discoveryData.hash && (
            <div className="text-center">
              <p className="text-xs text-gray-500 font-mono">
                Hash: {discoveryData.hash.slice(0, 16)}...
              </p>
            </div>
          )}
        </div>

        {/* Close button for winner */}
        {isWinner && (
          <div className="px-6 pb-6">
            <button
              onClick={onClose}
              className={`
                w-full py-3 rounded-xl font-bold text-lg
                bg-gradient-to-r from-orange-600 to-yellow-600
                hover:from-orange-500 hover:to-yellow-500
                text-white shadow-lg transform transition-all
                hover:scale-105 active:scale-95
              `}
            >
              Continue Mining
            </button>
          </div>
        )}

        {/* Auto-close indicator for non-winners */}
        {!isWinner && countdown === 0 && (
          <div className="px-6 pb-4 text-center">
            <p className="text-xs text-gray-500">Closing automatically...</p>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes confetti {
          0% {
            transform: translateY(-100%) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(500%) rotate(720deg);
            opacity: 0;
          }
        }
        .animate-confetti {
          animation: confetti 3s ease-out forwards;
        }
      `}</style>
    </div>
  );
}

export default DiscoveryPopup;
