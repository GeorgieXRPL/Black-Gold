/**
 * @fileoverview Holder verification gate component
 * Shows holder requirements and verification status with Privy wallet connection
 */

'use client';

import { motion } from 'framer-motion';
import { useWallet, usePrivyConfigured } from '../hooks/useWallet';
import type { HolderVerification } from '../../server/types';

interface HolderGateProps {
  /** Override verification (for testing) */
  verification?: HolderVerification | null;
  /** Override loading state (for testing) */
  loading?: boolean;
  /** Callback when refresh is requested */
  onRefresh?: () => void;
}

/**
 * Format token balance for display
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

/**
 * Connect Wallet Button Component
 */
function ConnectWalletButton({ onClick, isLoading }: { onClick: () => void; isLoading: boolean }) {
  return (
    <motion.button
      onClick={onClick}
      disabled={isLoading}
      className="w-full py-4 px-6 bg-gradient-to-r from-ember-600 to-gold-600 hover:from-ember-500 hover:to-gold-500 text-white font-bold rounded-lg transition-all duration-200 shadow-lg shadow-ember-500/25 hover:shadow-ember-500/40 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      {isLoading ? (
        <>
          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          Connecting...
        </>
      ) : (
        <>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          Connect Wallet
        </>
      )}
    </motion.button>
  );
}

/**
 * Disconnect Button Component
 */
function DisconnectButton({ onClick, displayAddress }: { onClick: () => void; displayAddress: string }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-1.5 bg-coal-800 hover:bg-coal-700 border border-coal-600 rounded-lg transition-colors text-sm"
    >
      <div className="w-2 h-2 bg-green-400 rounded-full" />
      <span className="text-coal-300 font-mono">{displayAddress}</span>
      <svg className="w-4 h-4 text-coal-500 hover:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
      </svg>
    </button>
  );
}

export function HolderGate({ verification: overrideVerification, loading: overrideLoading, onRefresh }: HolderGateProps) {
  const wallet = useWallet();
  const isPrivyConfigured = usePrivyConfigured();
  
  // Use override props or wallet state
  const verification = overrideVerification ?? wallet.holderVerification.verification;
  const loading = overrideLoading ?? wallet.holderVerification.loading ?? wallet.isLoading;
  const refresh = onRefresh ?? wallet.holderVerification.refresh;

  // Not connected state - show connect button
  if (!wallet.isConnected) {
    return (
      <div className="coal-panel p-6 text-center">
        <div className="text-5xl mb-4">🔐</div>
        <h3 className="font-heading text-xl text-white mb-2">Connect Your Wallet</h3>
        <p className="text-coal-500 text-sm mb-6">
          Connect your Solana wallet to verify your COAL holdings and start mining.
        </p>
        
        {isPrivyConfigured ? (
          <ConnectWalletButton onClick={wallet.connect} isLoading={wallet.isLoading} />
        ) : (
          <div className="p-4 bg-yellow-900/30 border border-yellow-700 rounded-lg">
            <p className="text-yellow-400 text-sm">
              ⚠️ Wallet connection not configured. Set <code className="font-mono bg-coal-800 px-1 rounded">NEXT_PUBLIC_PRIVY_APP_ID</code> in your environment.
            </p>
          </div>
        )}

        <p className="text-coal-600 text-xs mt-4">
          Supports Phantom, Solflare, Backpack, and more
        </p>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="coal-panel p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3 text-coal-500">
            <div className="w-5 h-5 border-2 border-coal-500 border-t-transparent rounded-full animate-spin" />
            Verifying holder status...
          </div>
          {wallet.displayAddress && (
            <DisconnectButton onClick={wallet.disconnect} displayAddress={wallet.displayAddress} />
          )}
        </div>
      </div>
    );
  }

  // Error or no verification state
  if (!verification) {
    return (
      <div className="coal-panel p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="text-4xl">⚠️</div>
          {wallet.displayAddress && (
            <DisconnectButton onClick={wallet.disconnect} displayAddress={wallet.displayAddress} />
          )}
        </div>
        <h3 className="font-heading text-xl text-white mb-2">Verification Failed</h3>
        <p className="text-coal-500 text-sm mb-4">
          Could not verify your token holdings. Please try again.
        </p>
        <button
          onClick={refresh}
          className="w-full py-3 bg-coal-800 hover:bg-coal-700 text-coal-300 rounded-lg transition-colors"
        >
          Retry Verification
        </button>
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
        
        <div className="flex items-center gap-2">
          {refresh && (
            <button
              onClick={refresh}
              className="text-coal-500 hover:text-white transition-colors p-2"
              title="Refresh"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          )}
          {wallet.displayAddress && (
            <DisconnectButton onClick={wallet.disconnect} displayAddress={wallet.displayAddress} />
          )}
        </div>
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
