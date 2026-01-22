/**
 * @fileoverview Wallet state management hook for Black Gold v3.3
 * Provides unified wallet connection state
 * Supports both message signing and transaction signing
 * 
 * SSR-safe: Returns default values during server-side rendering
 * 
 * v3.3.14: Holder verification is now managed in WalletProvider context
 * to ensure a SINGLE instance across all components (prevents stale data overwrites)
 */

'use client';

import { useState, useEffect } from 'react';
import { useWalletContext, WalletContextValue, HolderVerificationState } from '../providers/WalletProvider';

export interface WalletState {
  /** Whether a wallet is connected */
  isConnected: boolean;
  /** Whether wallet provider is ready/initialized */
  isReady: boolean;
  /** Whether authentication is in progress */
  isLoading: boolean;
  /** Connected wallet address (Solana) */
  walletAddress: string | null;
  /** Shortened wallet address for display */
  displayAddress: string | null;
  /** Holder verification status (shared instance from context) */
  holderVerification: HolderVerificationState;
}

export interface WalletActions {
  /** Connect wallet */
  connect: () => void;
  /** Disconnect wallet */
  disconnect: () => Promise<void>;
  /** Sign a message with the connected wallet */
  signMessage: (message: string) => Promise<string | null>;
  /** Sign a serialized transaction (returns signed tx as base64) */
  signTransaction: (serializedTx: string) => Promise<string | null>;
  /** Sign and send a serialized transaction (returns signature) */
  signAndSendTransaction: (serializedTx: string) => Promise<string | null>;
}

export interface UseWalletReturn extends WalletState, WalletActions {}

/**
 * Custom hook for wallet state and actions
 * Uses WalletContext for SSR-safe wallet management
 * 
 * IMPORTANT: holderVerification is now a SHARED instance from context
 * This prevents multiple components from creating separate instances
 * that could overwrite each other's data
 */
export function useWallet(): UseWalletReturn {
  const context = useWalletContext();
  
  // holderVerification is now part of context - single instance for entire app
  return context;
}

/**
 * Hook to check if Privy is configured
 * Returns false during SSR, checks on client
 */
export function usePrivyConfigured(): boolean {
  const [configured, setConfigured] = useState(false);
  
  useEffect(() => {
    setConfigured(!!process.env.NEXT_PUBLIC_PRIVY_APP_ID);
  }, []);
  
  return configured;
}
