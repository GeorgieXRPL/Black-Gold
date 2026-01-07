/**
 * @fileoverview Dual-mode wallet entry component
 * Supports two modes:
 * 1. Address-only mode: Users paste wallet address for basic mining
 * 2. Full connect mode: Users connect via Privy for staking/raids
 */

'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useWallet, usePrivyConfigured } from '../hooks/useWallet';

export type WalletMode = 'disconnected' | 'address-only' | 'full-connect';

export interface WalletEntryState {
  mode: WalletMode;
  walletAddress: string | null;
  displayAddress: string | null;
  isConnected: boolean;
  canStake: boolean;
  canRaid: boolean;
}

interface WalletEntryProps {
  /** Callback when wallet state changes */
  onWalletChange?: (state: WalletEntryState) => void;
  /** Compact mode for header display */
  compact?: boolean;
}

/**
 * Validates a Solana wallet address
 */
function isValidSolanaAddress(address: string): boolean {
  // Solana addresses are base58 encoded and 32-44 characters
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  return base58Regex.test(address);
}

/**
 * Format address for display
 */
function formatAddress(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export function WalletEntry({ onWalletChange, compact = false }: WalletEntryProps) {
  const wallet = useWallet();
  const isPrivyConfigured = usePrivyConfigured();
  
  const [showAddressInput, setShowAddressInput] = useState(false);
  const [addressInput, setAddressInput] = useState('');
  const [addressError, setAddressError] = useState<string | null>(null);
  const [manualAddress, setManualAddress] = useState<string | null>(null);

  // Determine current mode
  const getMode = (): WalletMode => {
    if (wallet.isConnected) return 'full-connect';
    if (manualAddress) return 'address-only';
    return 'disconnected';
  };

  const mode = getMode();
  const effectiveAddress = wallet.walletAddress || manualAddress;
  const displayAddress = effectiveAddress ? formatAddress(effectiveAddress) : null;

  // Build state object for parent
  const state: WalletEntryState = {
    mode,
    walletAddress: effectiveAddress,
    displayAddress,
    isConnected: mode !== 'disconnected',
    canStake: mode === 'full-connect',
    canRaid: mode === 'full-connect',
  };

  /**
   * Handle manual address submission
   */
  const handleAddressSubmit = useCallback(() => {
    const trimmed = addressInput.trim();
    
    if (!trimmed) {
      setAddressError('Please enter a wallet address');
      return;
    }
    
    if (!isValidSolanaAddress(trimmed)) {
      setAddressError('Invalid Solana wallet address');
      return;
    }
    
    setManualAddress(trimmed);
    setAddressError(null);
    setShowAddressInput(false);
    setAddressInput('');
    
    onWalletChange?.({
      mode: 'address-only',
      walletAddress: trimmed,
      displayAddress: formatAddress(trimmed),
      isConnected: true,
      canStake: false,
      canRaid: false,
    });
  }, [addressInput, onWalletChange]);

  /**
   * Handle full wallet connect via Privy
   */
  const handleFullConnect = useCallback(() => {
    if (manualAddress) {
      setManualAddress(null);
    }
    wallet.connect();
  }, [wallet, manualAddress]);

  /**
   * Handle disconnect
   */
  const handleDisconnect = useCallback(async () => {
    if (mode === 'full-connect') {
      await wallet.disconnect();
    } else {
      setManualAddress(null);
    }
    
    onWalletChange?.({
      mode: 'disconnected',
      walletAddress: null,
      displayAddress: null,
      isConnected: false,
      canStake: false,
      canRaid: false,
    });
  }, [mode, wallet, onWalletChange]);

  // Compact header display
  if (compact && mode !== 'disconnected') {
    return (
      <div className="flex items-center gap-2">
        {mode === 'address-only' && (
          <span className="text-xs text-yellow-500 bg-yellow-900/30 px-2 py-0.5 rounded">
            View Only
          </span>
        )}
        <button
          onClick={handleDisconnect}
          className="flex items-center gap-2 px-3 py-1.5 bg-coal-800 hover:bg-coal-700 border border-coal-600 rounded-lg transition-colors text-sm group"
        >
          <div className={`w-2 h-2 rounded-full ${mode === 'full-connect' ? 'bg-green-400' : 'bg-yellow-400'}`} />
          <span className="text-coal-300 font-mono">{displayAddress}</span>
          <svg className="w-4 h-4 text-coal-500 group-hover:text-red-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        </button>
        
        {/* Upgrade prompt for address-only users */}
        {mode === 'address-only' && isPrivyConfigured && (
          <button
            onClick={handleFullConnect}
            className="text-xs text-ember-400 hover:text-ember-300 underline transition-colors"
          >
            Connect for staking
          </button>
        )}
      </div>
    );
  }

  // Compact disconnected state
  if (compact && mode === 'disconnected') {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowAddressInput(true)}
          className="px-3 py-1.5 bg-coal-800 hover:bg-coal-700 border border-coal-600 rounded-lg transition-colors text-sm text-coal-300"
        >
          Enter Address
        </button>
        {isPrivyConfigured && (
          <button
            onClick={handleFullConnect}
            className="px-3 py-1.5 bg-gradient-to-r from-ember-600 to-gold-600 hover:from-ember-500 hover:to-gold-500 rounded-lg transition-colors text-sm text-white font-semibold"
          >
            Connect Wallet
          </button>
        )}
        
        {/* Address input modal */}
        <AnimatePresence>
          {showAddressInput && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
              onClick={() => setShowAddressInput(false)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-coal-900 border border-coal-700 rounded-xl p-6 max-w-md w-full mx-4"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="text-lg font-bold text-white mb-2">Enter Wallet Address</h3>
                <p className="text-coal-400 text-sm mb-4">
                  Enter your Solana wallet address to start mining. For staking and raids, you'll need to connect your wallet.
                </p>
                
                <input
                  type="text"
                  value={addressInput}
                  onChange={(e) => {
                    setAddressInput(e.target.value);
                    setAddressError(null);
                  }}
                  placeholder="Enter Solana wallet address..."
                  className="w-full px-4 py-3 bg-coal-800 border border-coal-600 rounded-lg text-white font-mono text-sm focus:outline-none focus:border-ember-500 transition-colors"
                  onKeyDown={(e) => e.key === 'Enter' && handleAddressSubmit()}
                />
                
                {addressError && (
                  <p className="text-red-400 text-sm mt-2">{addressError}</p>
                )}
                
                <div className="flex gap-3 mt-4">
                  <button
                    onClick={() => setShowAddressInput(false)}
                    className="flex-1 px-4 py-2 bg-coal-800 hover:bg-coal-700 text-coal-300 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddressSubmit}
                    className="flex-1 px-4 py-2 bg-ember-600 hover:bg-ember-500 text-white font-semibold rounded-lg transition-colors"
                  >
                    Start Mining
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // Full card display (non-compact)
  return (
    <div className="coal-panel p-6">
      {mode === 'disconnected' ? (
        <>
          <div className="text-center mb-6">
            <div className="text-5xl mb-4">⛏️</div>
            <h3 className="font-heading text-xl text-white mb-2">Start Mining</h3>
            <p className="text-coal-400 text-sm">
              Choose how you want to participate in Black Gold mining
            </p>
          </div>
          
          <div className="space-y-4">
            {/* Option 1: Address Only */}
            <div className="p-4 bg-coal-800/50 border border-coal-700 rounded-xl">
              <div className="flex items-start gap-3">
                <div className="text-2xl">👁️</div>
                <div className="flex-1">
                  <h4 className="font-semibold text-white mb-1">Watch & Mine</h4>
                  <p className="text-coal-400 text-xs mb-3">
                    Enter your wallet address to mine and receive rewards. No wallet connection required.
                  </p>
                  
                  {showAddressInput ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={addressInput}
                        onChange={(e) => {
                          setAddressInput(e.target.value);
                          setAddressError(null);
                        }}
                        placeholder="Solana wallet address..."
                        className="w-full px-3 py-2 bg-coal-900 border border-coal-600 rounded-lg text-white font-mono text-sm focus:outline-none focus:border-ember-500"
                        onKeyDown={(e) => e.key === 'Enter' && handleAddressSubmit()}
                        autoFocus
                      />
                      {addressError && (
                        <p className="text-red-400 text-xs">{addressError}</p>
                      )}
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setShowAddressInput(false);
                            setAddressInput('');
                            setAddressError(null);
                          }}
                          className="flex-1 px-3 py-1.5 bg-coal-700 text-coal-300 text-sm rounded-lg"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleAddressSubmit}
                          className="flex-1 px-3 py-1.5 bg-ember-600 hover:bg-ember-500 text-white text-sm font-semibold rounded-lg"
                        >
                          Start
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowAddressInput(true)}
                      className="w-full px-4 py-2 bg-coal-700 hover:bg-coal-600 text-coal-200 rounded-lg transition-colors text-sm"
                    >
                      Enter Address
                    </button>
                  )}
                </div>
              </div>
              
              <div className="mt-3 pt-3 border-t border-coal-700">
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-green-400">✓ Mining</span>
                  <span className="text-green-400">✓ Rewards</span>
                  <span className="text-coal-500">✗ Staking</span>
                  <span className="text-coal-500">✗ Raids</span>
                </div>
              </div>
            </div>
            
            {/* Option 2: Full Connect */}
            {isPrivyConfigured ? (
              <div className="p-4 bg-gradient-to-br from-ember-900/30 to-gold-900/30 border border-ember-700/50 rounded-xl">
                <div className="flex items-start gap-3">
                  <div className="text-2xl">🔐</div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-white mb-1">Full Access</h4>
                    <p className="text-coal-400 text-xs mb-3">
                      Connect your wallet for staking, raids, and all game features. Sign transactions securely.
                    </p>
                    
                    <motion.button
                      onClick={handleFullConnect}
                      disabled={wallet.isLoading}
                      className="w-full px-4 py-2.5 bg-gradient-to-r from-ember-600 to-gold-600 hover:from-ember-500 hover:to-gold-500 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      {wallet.isLoading ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Connecting...
                        </>
                      ) : (
                        'Connect Wallet'
                      )}
                    </motion.button>
                  </div>
                </div>
                
                <div className="mt-3 pt-3 border-t border-ember-700/50">
                  <div className="flex items-center gap-4 text-xs">
                    <span className="text-green-400">✓ Mining</span>
                    <span className="text-green-400">✓ Rewards</span>
                    <span className="text-green-400">✓ Staking</span>
                    <span className="text-green-400">✓ Raids</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-yellow-900/20 border border-yellow-700/50 rounded-xl">
                <p className="text-yellow-400 text-sm">
                  ⚠️ Full wallet connection not configured. Contact admin to enable staking and raids.
                </p>
              </div>
            )}
          </div>
          
          <p className="text-coal-600 text-xs text-center mt-4">
            Supports Phantom, Solflare, Backpack, and more
          </p>
        </>
      ) : (
        // Connected state
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className={`w-3 h-3 rounded-full ${mode === 'full-connect' ? 'bg-green-400' : 'bg-yellow-400'}`} />
            <span className="font-mono text-white">{displayAddress}</span>
            {mode === 'address-only' && (
              <span className="text-xs text-yellow-500 bg-yellow-900/30 px-2 py-0.5 rounded">
                View Only
              </span>
            )}
          </div>
          
          <div className="flex flex-col gap-2">
            {mode === 'address-only' && isPrivyConfigured && (
              <button
                onClick={handleFullConnect}
                className="w-full px-4 py-2 bg-gradient-to-r from-ember-600 to-gold-600 hover:from-ember-500 hover:to-gold-500 text-white font-semibold rounded-lg transition-colors"
              >
                Upgrade to Full Access
              </button>
            )}
            <button
              onClick={handleDisconnect}
              className="w-full px-4 py-2 bg-coal-800 hover:bg-coal-700 text-coal-300 rounded-lg transition-colors"
            >
              Disconnect
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default WalletEntry;
