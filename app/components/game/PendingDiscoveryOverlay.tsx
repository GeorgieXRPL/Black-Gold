'use client';

import { useState, useEffect } from 'react';

interface PendingDiscoveryOverlayProps {
  isVisible: boolean;
  discoveryNumber: number;
  mineName: string;
  resource: string;
  announceAt: number; // Unix timestamp
  onComplete?: () => void;
}

const RESOURCE_COLORS: Record<string, string> = {
  coal: 'from-orange-600 to-red-600',
  gold: 'from-yellow-500 to-amber-600',
  silver: 'from-gray-400 to-slate-500',
  oil: 'from-blue-600 to-cyan-600',
};

const RESOURCE_EMOJIS: Record<string, string> = {
  coal: '⛏️',
  gold: '🥇',
  silver: '🥈',
  oil: '🛢️',
};

export function PendingDiscoveryOverlay({
  isVisible,
  discoveryNumber,
  mineName,
  resource,
  announceAt,
  onComplete,
}: PendingDiscoveryOverlayProps) {
  const [countdown, setCountdown] = useState(0);
  const [totalSeconds, setTotalSeconds] = useState(30);

  useEffect(() => {
    if (!isVisible || !announceAt) return;

    const updateCountdown = () => {
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((announceAt - now) / 1000));
      setCountdown(remaining);
      
      if (remaining === 0) {
        onComplete?.();
      }
    };

    // Calculate initial total for progress bar
    const initialRemaining = Math.ceil((announceAt - Date.now()) / 1000);
    setTotalSeconds(initialRemaining > 0 ? initialRemaining : 30);
    
    updateCountdown();
    const interval = setInterval(updateCountdown, 100);
    
    return () => clearInterval(interval);
  }, [isVisible, announceAt, onComplete]);

  if (!isVisible) return null;

  const emoji = RESOURCE_EMOJIS[resource] || '⛏️';
  const gradientColors = RESOURCE_COLORS[resource] || RESOURCE_COLORS.coal;
  const progress = totalSeconds > 0 ? (countdown / totalSeconds) * 100 : 0;

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center pointer-events-none">
      {/* Semi-transparent overlay */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      
      {/* Countdown Card */}
      <div className="relative bg-coal-900/95 border-2 border-orange-500/50 rounded-2xl p-8 shadow-2xl shadow-orange-500/20 max-w-sm mx-4">
        {/* Pulsing glow effect */}
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-orange-500/20 to-yellow-500/20 animate-pulse" />
        
        <div className="relative text-center">
          {/* Emoji with animation */}
          <div className="text-6xl mb-4 animate-bounce">
            {emoji}
          </div>
          
          {/* Title */}
          <h2 className="text-xl font-bold text-orange-400 mb-2">
            Discovery Found!
          </h2>
          
          <p className="text-gray-300 mb-1">
            Discovery #{discoveryNumber} at
          </p>
          <p className="text-white font-semibold mb-6">
            {mineName}
          </p>
          
          {/* Countdown */}
          <div className="mb-4">
            <div className="text-sm text-gray-400 mb-2">
              Winner revealed in
            </div>
            <div className={`text-6xl font-bold bg-gradient-to-r ${gradientColors} bg-clip-text text-transparent tabular-nums`}>
              {countdown}
            </div>
            <div className="text-sm text-gray-500 mt-1">seconds</div>
          </div>
          
          {/* Progress bar */}
          <div className="w-full bg-gray-800 rounded-full h-3 overflow-hidden">
            <div 
              className={`h-full bg-gradient-to-r ${gradientColors} transition-all duration-100 ease-linear`}
              style={{ width: `${progress}%` }}
            />
          </div>
          
          {/* Suspense text */}
          <p className="text-sm text-gray-400 mt-4 animate-pulse">
            🎲 Who will it be...?
          </p>
        </div>
      </div>
    </div>
  );
}

export default PendingDiscoveryOverlay;
