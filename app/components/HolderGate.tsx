/**
 * @fileoverview Holder verification gate component
 * Shows holder requirements and verification status
 */

'use client';

import { motion } from 'framer-motion';
import type { HolderVerification } from '../../server/types';

interface HolderGateProps {
  verification: HolderVerification | null;
  loading?: boolean;
  onRefresh?: () => void;
}

/**
 * Format token balance
 */
function formatBalance(balance: number): string {
  if (balance === Infinity) return '∞';
  if (balance >= 1_000_000) {
    return `${(balance / 1_000_000).toFixed(2)}M`;
  }
  if (balance >= 1_000) {
    return `${(balance / 1_000).toFixed(2)}K`;
  }
  return balance.toFixed(2);
}

export function HolderGate({ verification, loading, onRefresh }: HolderGateProps) {
  if (loading) {
    return (
      <div className="coal-panel p-6">
        <div className="flex items-center justify-center gap-3 text-coal-500">
          <div className="w-5 h-5 border-2 border-coal-500 border-t-transparent rounded-full animate-spin" />
          Verifying holder status...
        </div>
      </div>
    );
  }

  if (!verification) {
    return (
      <div className="coal-panel p-6 text-center">
        <div className="text-4xl mb-4">🔒</div>
        <h3 className="font-heading text-xl text-white mb-2">Holder Verification Required</h3>
        <p className="text-coal-500 text-sm mb-4">
          You must hold COAL tokens to participate in mining.
          Enter your wallet address to check eligibility.
        </p>
      </div>
    );
  }

  const progressPercent = Math.min(
    100,
    (verification.percentOfSupply / verification.requiredPercent) * 100
  );

  return (
    <div className={`coal-panel p-6 border-2 ${
      verification.isEligible ? 'border-green-500/50' : 'border-red-500/50'
    }`}>
      {/* Status Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`text-2xl ${verification.isEligible ? '' : 'grayscale opacity-50'}`}>
            {verification.isEligible ? '✅' : '❌'}
          </div>
          <div>
            <h3 className="font-heading text-lg text-white">
              {verification.isEligible ? 'Eligible to Mine' : 'Not Eligible'}
            </h3>
            <p className="text-coal-500 text-xs font-mono">
              {verification.walletAddress.slice(0, 8)}...{verification.walletAddress.slice(-6)}
            </p>
          </div>
        </div>
        
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="text-coal-500 hover:text-white transition-colors p-2"
            title="Refresh"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        )}
      </div>

      {/* Balance Info */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <div className="stat-label">Your Balance</div>
          <div className="stat-value text-2xl">
            {formatBalance(verification.balance)}
          </div>
          <div className="text-coal-500 text-xs">COAL</div>
        </div>
        <div>
          <div className="stat-label">% of Supply</div>
          <div className={`text-2xl font-mono ${
            verification.isEligible ? 'text-green-400' : 'text-red-400'
          }`}>
            {verification.percentOfSupply.toFixed(4)}%
          </div>
          <div className="text-coal-500 text-xs">
            Need: {verification.requiredPercent}%
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs">
          <span className="text-coal-500">Progress to Eligibility</span>
          <span className={verification.isEligible ? 'text-green-400' : 'text-coal-500'}>
            {progressPercent.toFixed(1)}%
          </span>
        </div>
        <div className="progress-ember h-3">
          <motion.div
            className="progress-ember-fill"
            initial={{ width: 0 }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>
      </div>

      {/* Not Eligible Message */}
      {!verification.isEligible && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 p-3 bg-red-900/30 border border-red-500/50 rounded text-sm"
        >
          <p className="text-red-400 mb-2">
            You need to hold at least {verification.requiredPercent}% of supply to mine.
          </p>
          <a
            href="https://pump.fun"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-ember hover:text-gold transition-colors"
          >
            Buy COAL on Pump.fun
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </motion.div>
      )}

      {/* Market Cap Info */}
      <div className="mt-4 pt-4 border-t border-coal-700 text-center">
        <span className="text-coal-500 text-xs">
          Current Market Cap: ${verification.marketCap.toLocaleString()}
        </span>
      </div>
    </div>
  );
}
