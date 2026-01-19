'use client';

/**
 * @fileoverview Staking Panel for managing on-chain token stakes at mines
 * Uses Quarry staking protocol for actual blockchain transactions
 */

import { useState, useCallback, useEffect } from 'react';
import { Mine, STAKE_TIERS, getStakeTier, RESOURCE_COLORS } from '../../lib/mines';
import { useWallet } from '../../hooks/useWallet';
import { useStaking } from '../../hooks/useStaking';

interface StakingPanelProps {
  mine: Mine;
  currentStake: number;
  walletBalance: number;
  onStakeSuccess?: (amount: number, signature: string) => void;
  onUnstakeSuccess?: (amount: number, signature: string) => void;
  onClose: () => void;
}

export default function StakingPanel({
  mine,
  currentStake,
  walletBalance,
  onStakeSuccess,
  onUnstakeSuccess,
  onClose,
}: StakingPanelProps) {
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<'stake' | 'unstake'>('stake');
  
  const { isConnected, displayAddress } = useWallet();
  const staking = useStaking();
  
  const colors = RESOURCE_COLORS[mine.resource];
  const currentTier = getStakeTier(currentStake);
  const previewTier = mode === 'stake' 
    ? getStakeTier(currentStake + Number(amount || 0))
    : getStakeTier(Math.max(0, currentStake - Number(amount || 0)));

  const maxAmount = mode === 'stake' ? walletBalance : currentStake;
  
  // Track if we're in a transaction
  const isProcessing = staking.isStaking || staking.isUnstaking;

  /**
   * Handle stake/unstake submission - uses actual on-chain staking
   */
  const handleSubmit = useCallback(async () => {
    const numAmount = Number(amount);
    if (numAmount <= 0 || numAmount > maxAmount) return;
    
    if (!isConnected) {
      return;
    }

    try {
      if (mode === 'stake') {
        console.log('[StakingPanel] Initiating stake of', numAmount, 'tokens...');
        const result = await staking.stake(numAmount);
        
        if (result.success && result.signature) {
          console.log('[StakingPanel] Stake successful:', result.signature);
          onStakeSuccess?.(numAmount, result.signature);
          setAmount('');
        }
      } else {
        console.log('[StakingPanel] Initiating unstake of', numAmount, 'tokens...');
        const result = await staking.unstake(numAmount);
        
        if (result.success && result.signature) {
          console.log('[StakingPanel] Unstake successful:', result.signature);
          onUnstakeSuccess?.(numAmount, result.signature);
          setAmount('');
        }
      }
    } catch (err) {
      console.error('[StakingPanel] Error:', err);
    }
  }, [amount, maxAmount, mode, isConnected, staking, onStakeSuccess, onUnstakeSuccess]);

  const setQuickAmount = (percent: number) => {
    setAmount(Math.floor(maxAmount * percent).toString());
  };

  const isSubmitDisabled = Number(amount) <= 0 || Number(amount) > maxAmount || isProcessing || !isConnected || !staking.isAvailable;

  // Clear error when switching modes
  useEffect(() => {
    staking.clearError();
  }, [mode]);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-coal-900 border border-coal-700 rounded-xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div 
          className="p-4 border-b border-coal-700"
          style={{ 
            background: `linear-gradient(135deg, ${colors.primary}40, transparent)`,
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">Stake at {mine.name}</h2>
              <p className="text-sm text-coal-400">{mine.countryName}</p>
            </div>
            <button 
              onClick={onClose}
              disabled={isProcessing}
              className="p-2 hover:bg-coal-800 rounded-lg transition-colors disabled:opacity-50"
            >
              <span className="text-coal-400">✕</span>
            </button>
          </div>
        </div>

        {/* Wallet Status */}
        {isConnected && displayAddress && (
          <div className="px-4 py-2 bg-coal-800/50 border-b border-coal-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-400 rounded-full" />
              <span className="text-xs text-coal-400">Connected:</span>
              <span className="text-xs text-coal-300 font-mono">{displayAddress}</span>
            </div>
            {staking.isAvailable ? (
              <span className="text-xs text-green-500">On-chain staking ready</span>
            ) : (
              <span className="text-xs text-yellow-500">Staking loading...</span>
            )}
          </div>
        )}

        {/* Current status */}
        <div className="p-4 border-b border-coal-700">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-xs text-coal-400 uppercase">Current Stake</div>
              <div className="text-xl font-bold text-ember-400">{currentStake.toLocaleString()} COAL</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-coal-400 uppercase">Current Tier</div>
              <div className="text-xl font-bold text-gold-400">{currentTier.name}</div>
            </div>
          </div>
          
          {/* Tier progress */}
          <div className="space-y-2">
            {STAKE_TIERS.map((tier, i) => {
              const isActive = currentStake >= tier.minStake;
              const isNext = !isActive && (i === 0 || currentStake >= STAKE_TIERS[i - 1].minStake);
              
              return (
                <div key={tier.name} className="flex items-center gap-3">
                  <div 
                    className={`w-3 h-3 rounded-full ${isActive ? 'bg-ember-500' : 'bg-coal-700'}`}
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className={`text-sm ${isActive ? 'text-white' : 'text-coal-500'}`}>
                        {tier.name}
                      </span>
                      <span className="text-xs text-coal-400">
                        {tier.minStake.toLocaleString()} COAL
                      </span>
                    </div>
                    <div className="text-xs text-coal-500">
                      {tier.hashrateMultiplier}x hashrate
                    </div>
                  </div>
                  {isNext && (
                    <span className="text-xs text-ember-400">
                      +{(tier.minStake - currentStake).toLocaleString()} to unlock
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Mode toggle */}
        <div className="p-4 border-b border-coal-700">
          <div className="flex gap-2">
            <button
              onClick={() => setMode('stake')}
              disabled={isProcessing}
              className={`flex-1 py-2 rounded-lg font-semibold transition-colors ${
                mode === 'stake' 
                  ? 'bg-green-600 text-white' 
                  : 'bg-coal-800 text-coal-400 hover:bg-coal-700'
              } disabled:opacity-50`}
            >
              Stake
            </button>
            <button
              onClick={() => setMode('unstake')}
              disabled={isProcessing}
              className={`flex-1 py-2 rounded-lg font-semibold transition-colors ${
                mode === 'unstake' 
                  ? 'bg-red-600 text-white' 
                  : 'bg-coal-800 text-coal-400 hover:bg-coal-700'
              } disabled:opacity-50`}
            >
              Unstake
            </button>
          </div>
        </div>

        {/* Amount input */}
        <div className="p-4 space-y-4">
          <div>
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-coal-400">Amount</span>
              <span className="text-coal-500">
                Available: {maxAmount.toLocaleString()} COAL
              </span>
            </div>
            <div className="relative">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                disabled={isProcessing}
                className="w-full bg-coal-800 border border-coal-600 rounded-lg px-4 py-3 text-white text-lg focus:outline-none focus:border-ember-500 disabled:opacity-50"
              />
              <button
                onClick={() => setAmount(maxAmount.toString())}
                disabled={isProcessing}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ember-400 hover:text-ember-300 disabled:opacity-50"
              >
                MAX
              </button>
            </div>
          </div>

          {/* Quick amounts */}
          <div className="flex gap-2">
            {[0.25, 0.5, 0.75, 1].map((pct) => (
              <button
                key={pct}
                onClick={() => setQuickAmount(pct)}
                disabled={isProcessing}
                className="flex-1 py-2 bg-coal-800 hover:bg-coal-700 text-coal-300 rounded-lg text-sm transition-colors disabled:opacity-50"
              >
                {pct * 100}%
              </button>
            ))}
          </div>

          {/* Preview */}
          {Number(amount) > 0 && (
            <div className="bg-coal-800/50 rounded-lg p-3">
              <div className="text-xs text-coal-400 mb-1">After {mode}:</div>
              <div className="flex items-center justify-between">
                <span className="text-white">
                  {mode === 'stake' 
                    ? (currentStake + Number(amount)).toLocaleString()
                    : Math.max(0, currentStake - Number(amount)).toLocaleString()
                  } COAL
                </span>
                {previewTier.name !== currentTier.name && (
                  <span className={mode === 'stake' ? 'text-green-400' : 'text-red-400'}>
                    {mode === 'stake' ? '↑' : '↓'} {previewTier.name}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Error message */}
          {staking.error && (
            <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 text-sm">
              <span className="text-red-400">❌ {staking.error}</span>
            </div>
          )}

          {/* Success message */}
          {staking.lastSignature && !staking.error && (
            <div className="bg-green-900/30 border border-green-700 rounded-lg p-3 text-sm">
              <span className="text-green-400">✅ Transaction sent!</span>
              <a 
                href={`https://explorer.solana.com/tx/${staking.lastSignature}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-xs text-green-500 hover:text-green-400 mt-1 truncate"
              >
                View on Solana Explorer →
              </a>
            </div>
          )}

          {/* Warning for unstaking */}
          {mode === 'unstake' && Number(amount) > 0 && !staking.error && (
            <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-3 text-sm">
              <span className="text-yellow-400">⚠️ Unstaking removes all boosts immediately</span>
            </div>
          )}

          {/* Transaction info */}
          <div className="bg-coal-800/30 rounded-lg p-3 text-xs text-coal-500 flex items-start gap-2">
            <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>
              This is an on-chain transaction that requires SOL for fees. Your wallet will prompt you to approve the transaction.
            </span>
          </div>

          {/* Submit button */}
          <button
            onClick={handleSubmit}
            disabled={isSubmitDisabled}
            className={`w-full py-3 rounded-lg font-bold transition-colors flex items-center justify-center gap-2 ${
              mode === 'stake'
                ? 'bg-green-600 hover:bg-green-500 disabled:bg-green-900 disabled:text-green-700'
                : 'bg-red-600 hover:bg-red-500 disabled:bg-red-900 disabled:text-red-700'
            } text-white disabled:cursor-not-allowed`}
          >
            {isProcessing ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Processing Transaction...
              </>
            ) : !isConnected ? (
              'Connect Wallet First'
            ) : !staking.isAvailable ? (
              'Staking Not Available'
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                        d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                {mode === 'stake' ? 'Stake' : 'Unstake'} {Number(amount).toLocaleString()} COAL
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
