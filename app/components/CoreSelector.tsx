'use client';

/**
 * @fileoverview Core selection modal for mining
 * Allows users to choose how many CPU cores to use for mining
 */

import { useState, useEffect } from 'react';

interface CoreSelectorProps {
  /** Callback when user confirms selection */
  onConfirm: (cores: number) => void;
  /** Callback when user cancels */
  onCancel: () => void;
  /** Current core count */
  currentCores?: number;
}

export function CoreSelector({ onConfirm, onCancel, currentCores }: CoreSelectorProps) {
  const [maxCores, setMaxCores] = useState(4);
  const [selectedCores, setSelectedCores] = useState(currentCores || 2);
  
  useEffect(() => {
    // Detect available cores
    if (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) {
      const available = navigator.hardwareConcurrency;
      setMaxCores(available);
      // Default to half of available cores (balanced performance)
      if (!currentCores) {
        setSelectedCores(Math.max(1, Math.floor(available / 2)));
      }
    }
  }, [currentCores]);

  const getCoreDescription = (cores: number) => {
    const percentage = Math.round((cores / maxCores) * 100);
    if (percentage <= 25) return 'Light - minimal impact on device';
    if (percentage <= 50) return 'Balanced - good for background mining';
    if (percentage <= 75) return 'Performance - noticeable device usage';
    return 'Maximum - may affect device responsiveness';
  };

  const getHashrateEstimate = (cores: number) => {
    // Rough estimate: ~15-25 KH/s per core for SHA-256 in JavaScript
    const lowEstimate = cores * 15;
    const highEstimate = cores * 25;
    return `${lowEstimate}-${highEstimate} KH/s`;
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div className="bg-coal-900 border border-coal-700 rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl">
        <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
          <span className="text-2xl">⚙️</span>
          Mining Settings
        </h2>
        
        <p className="text-coal-400 text-sm mb-6">
          Choose how many CPU cores to dedicate to mining. More cores = higher hashrate but more device usage.
        </p>
        
        {/* Core count display */}
        <div className="text-center mb-4">
          <div className="text-5xl font-bold text-ember-400">
            {selectedCores}
          </div>
          <div className="text-coal-400 text-sm">
            of {maxCores} cores
          </div>
        </div>
        
        {/* Slider */}
        <div className="mb-4">
          <input
            type="range"
            min={1}
            max={maxCores}
            value={selectedCores}
            onChange={(e) => setSelectedCores(parseInt(e.target.value))}
            className="w-full h-3 rounded-lg appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, 
                #f97316 0%, 
                #f97316 ${(selectedCores / maxCores) * 100}%, 
                #374151 ${(selectedCores / maxCores) * 100}%, 
                #374151 100%)`
            }}
          />
        </div>
        
        {/* Quick select buttons */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setSelectedCores(1)}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
              selectedCores === 1 
                ? 'bg-ember-600 text-white' 
                : 'bg-coal-800 text-coal-300 hover:bg-coal-700'
            }`}
          >
            1 Core
          </button>
          <button
            onClick={() => setSelectedCores(Math.max(1, Math.floor(maxCores / 2)))}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
              selectedCores === Math.floor(maxCores / 2) 
                ? 'bg-ember-600 text-white' 
                : 'bg-coal-800 text-coal-300 hover:bg-coal-700'
            }`}
          >
            Half
          </button>
          <button
            onClick={() => setSelectedCores(maxCores)}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
              selectedCores === maxCores 
                ? 'bg-ember-600 text-white' 
                : 'bg-coal-800 text-coal-300 hover:bg-coal-700'
            }`}
          >
            Max
          </button>
        </div>
        
        {/* Info box */}
        <div className="bg-coal-800/50 border border-coal-700 rounded-lg p-4 mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-coal-400 text-sm">Estimated Hashrate:</span>
            <span className="text-ember-400 font-mono">{getHashrateEstimate(selectedCores)}</span>
          </div>
          <div className="text-coal-500 text-xs">
            {getCoreDescription(selectedCores)}
          </div>
        </div>
        
        {/* Warning for max cores */}
        {selectedCores === maxCores && (
          <div className="bg-yellow-900/30 border border-yellow-700/50 rounded-lg p-3 mb-6">
            <div className="text-yellow-400 text-sm flex items-center gap-2">
              <span>⚠️</span>
              Using all cores may make your device less responsive while mining.
            </div>
          </div>
        )}
        
        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 px-4 rounded-lg font-semibold bg-coal-800 text-coal-300 hover:bg-coal-700 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(selectedCores)}
            className="flex-1 py-3 px-4 rounded-lg font-semibold bg-gradient-to-r from-ember-600 to-ember-500 text-white hover:from-ember-500 hover:to-ember-400 transition-all shadow-lg shadow-ember-900/30"
          >
            Start Mining
          </button>
        </div>
      </div>
    </div>
  );
}
