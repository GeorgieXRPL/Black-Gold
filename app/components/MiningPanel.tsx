/**
 * @fileoverview Mining control panel component
 * Start/stop mining, core selection, hashrate display
 */

'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface MiningPanelProps {
  isMining: boolean;
  hashrate: number;
  cores: number;
  maxCores: number;
  onStartMining: (walletAddress: string, cores: number) => void;
  onStopMining: () => void;
  onCoresChange: (cores: number) => void;
  disabled?: boolean;
  error?: string;
}

/**
 * Format hashrate with appropriate units
 */
function formatHashrate(hashrate: number): string {
  if (hashrate >= 1_000_000) {
    return `${(hashrate / 1_000_000).toFixed(2)} MH/s`;
  }
  if (hashrate >= 1_000) {
    return `${(hashrate / 1_000).toFixed(2)} KH/s`;
  }
  return `${Math.round(hashrate)} H/s`;
}

export function MiningPanel({
  isMining,
  hashrate,
  cores,
  maxCores,
  onStartMining,
  onStopMining,
  onCoresChange,
  disabled = false,
  error,
}: MiningPanelProps) {
  const [walletAddress, setWalletAddress] = useState('');
  const [showModal, setShowModal] = useState(false);

  const handleStartClick = useCallback(() => {
    if (isMining) {
      onStopMining();
    } else {
      setShowModal(true);
    }
  }, [isMining, onStopMining]);

  const handleConfirmStart = useCallback(() => {
    if (walletAddress.length >= 32) {
      onStartMining(walletAddress, cores);
      setShowModal(false);
    }
  }, [walletAddress, cores, onStartMining]);

  const corePercentage = Math.round((cores / maxCores) * 100);

  return (
    <>
      <div className="coal-panel p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-2xl text-white">Mining Status</h2>
          <div className={`w-3 h-3 rounded-full ${
            isMining ? 'bg-ember animate-pulse' : 'bg-coal-600'
          }`} />
        </div>

        {/* Hashrate Display */}
        <div className="text-center py-8">
          <div className="stat-label mb-2">{isMining ? 'Your Hashrate' : 'Status'}</div>
          <motion.div
            className="stat-value text-5xl font-mono"
            key={hashrate}
            initial={{ scale: 1.1 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.2 }}
          >
            {isMining ? formatHashrate(hashrate) : 'Idle'}
          </motion.div>
        </div>

        {/* Core Selection */}
        {!isMining && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="stat-label">CPU Cores</span>
              <span className="font-mono text-white">
                {cores} / {maxCores} ({corePercentage}%)
              </span>
            </div>
            
            <div className="flex items-center gap-4">
              <button
                onClick={() => onCoresChange(Math.max(1, cores - 1))}
                className="btn-mine w-12 h-12 text-2xl"
                disabled={cores <= 1}
              >
                -
              </button>
              
              <input
                type="range"
                min={1}
                max={maxCores}
                value={cores}
                onChange={(e) => onCoresChange(Number(e.target.value))}
                className="flex-1 accent-ember"
              />
              
              <button
                onClick={() => onCoresChange(Math.min(maxCores, cores + 1))}
                className="btn-mine w-12 h-12 text-2xl"
                disabled={cores >= maxCores}
              >
                +
              </button>
            </div>

            {corePercentage === 100 && (
              <p className="text-ember text-sm text-center">
                Using all cores may slow down your computer
              </p>
            )}
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="bg-red-900/30 border border-red-500 rounded p-3 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Main Action Button */}
        <button
          onClick={handleStartClick}
          disabled={disabled}
          className={`btn-mine w-full text-xl ${isMining ? 'mining' : ''}`}
        >
          {isMining ? (
            <span className="flex items-center justify-center gap-3">
              <span className="w-4 h-4 border-2 border-ember border-t-transparent rounded-full animate-spin" />
              STOP DRILLING
            </span>
          ) : (
            'START DRILLING'
          )}
        </button>

        {/* Mining Tips */}
        {isMining && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-coal-500 text-sm text-center"
          >
            Keep this tab open for mining to continue
          </motion.div>
        )}
      </div>

      {/* Wallet Address Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
            onClick={() => setShowModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="coal-panel p-8 max-w-md w-full space-y-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="font-heading text-2xl text-white text-center">
                Enter Your Wallet
              </h3>
              
              <p className="text-coal-500 text-sm text-center">
                Paste your Solana wallet address to receive COAL rewards.
                No wallet connection required.
              </p>

              <input
                type="text"
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                placeholder="Your Solana wallet address..."
                className="w-full bg-coal-900 border border-coal-600 rounded px-4 py-3 
                         text-white font-mono text-sm placeholder:text-coal-600
                         focus:outline-none focus:border-ember transition-colors"
                autoFocus
              />

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-coal-500">CPU Cores:</span>
                  <span className="text-white font-mono">{cores}</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={maxCores}
                  value={cores}
                  onChange={(e) => onCoresChange(Number(e.target.value))}
                  className="w-full accent-ember"
                />
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-3 bg-coal-800 border border-coal-600 text-coal-500 
                           font-heading text-lg hover:border-coal-500 transition-colors"
                >
                  CANCEL
                </button>
                <button
                  onClick={handleConfirmStart}
                  disabled={walletAddress.length < 32}
                  className="flex-1 btn-mine"
                >
                  START DRILLING
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
