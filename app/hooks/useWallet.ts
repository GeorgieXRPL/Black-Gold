/**
 * @fileoverview Wallet state management hook for Black Gold
 * Provides unified wallet connection state
 * 
 * SSR-safe: Returns default values during server-side rendering
 */

'use client';

import { useState, useEffect } from 'react';
import { useHolderVerification } from './useHolderVerification';
import { useWalletContext, WalletContextValue } from '../providers/WalletProvider';

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
  /** Holder verification status */
  holderVerification: ReturnType<typeof useHolderVerification>;
}

export interface WalletActions {
  /** Connect wallet */
  connect: () => void;
  /** Disconnect wallet */
  disconnect: () => Promise<void>;
  /** Sign a message with the connected wallet */
  signMessage: (message: string) => Promise<string | null>;
}

export interface UseWalletReturn extends WalletState, WalletActions {}

/**
 * Custom hook for wallet state and actions
 * Uses WalletContext for SSR-safe wallet management
 */
export function useWallet(): UseWalletReturn {
  const context = useWalletContext();
  
  // Holder verification for the connected wallet
  const holderVerification = useHolderVerification(context.walletAddress);

  return {
    ...context,
    holderVerification,
  };
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
