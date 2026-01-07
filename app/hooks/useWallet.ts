/**
 * @fileoverview Wallet state management hook for Black Gold
 * Provides unified wallet connection state using Privy
 */

'use client';

import { useCallback, useMemo } from 'react';
import { usePrivy, useLogin, useLogout, useWallets } from '@privy-io/react-auth';
import { useSignMessage as useSolanaSignMessage, useWallets as useSolanaWallets } from '@privy-io/react-auth/solana';
import { useHolderVerification } from './useHolderVerification';

export interface WalletState {
  /** Whether a wallet is connected */
  isConnected: boolean;
  /** Whether Privy is ready/initialized */
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
  /** Connect wallet via Privy */
  connect: () => void;
  /** Disconnect wallet */
  disconnect: () => Promise<void>;
  /** Sign a message with the connected wallet */
  signMessage: (message: string) => Promise<string | null>;
}

export interface UseWalletReturn extends WalletState, WalletActions {}

/**
 * Custom hook for wallet state and actions
 * Integrates Privy authentication with holder verification
 */
export function useWallet(): UseWalletReturn {
  const { ready, authenticated } = usePrivy();
  const { login } = useLogin();
  const { logout } = useLogout();
  const { wallets: solanaWallets, ready: solanaReady } = useSolanaWallets();
  const { signMessage: signSolanaMessage } = useSolanaSignMessage();

  // Get the primary Solana wallet
  const solanaWallet = useMemo(() => {
    if (!solanaWallets || solanaWallets.length === 0) return null;
    // Return the first available wallet
    return solanaWallets[0];
  }, [solanaWallets]);

  const walletAddress = solanaWallet?.address || null;
  
  // Format display address
  const displayAddress = useMemo(() => {
    if (!walletAddress) return null;
    return `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`;
  }, [walletAddress]);

  // Holder verification for the connected wallet
  const holderVerification = useHolderVerification(walletAddress);

  /**
   * Connect wallet via Privy login flow
   */
  const connect = useCallback(() => {
    login();
  }, [login]);

  /**
   * Disconnect wallet and logout
   */
  const disconnect = useCallback(async () => {
    await logout();
  }, [logout]);

  /**
   * Sign a message with the connected Solana wallet
   * Used for authentication and staking operations
   */
  const signMessage = useCallback(async (message: string): Promise<string | null> => {
    if (!solanaWallet) {
      console.error('[Wallet] No wallet connected for signing');
      return null;
    }

    try {
      // Encode message to Uint8Array
      const messageBytes = new TextEncoder().encode(message);
      
      // Sign with the wallet using Privy's Solana hook
      const result = await signSolanaMessage({
        message: messageBytes,
        wallet: solanaWallet,
      });
      
      // Convert signature to base64 string
      const signatureBase64 = Buffer.from(result.signature).toString('base64');
      
      console.log('[Wallet] Message signed successfully');
      return signatureBase64;
    } catch (error) {
      console.error('[Wallet] Failed to sign message:', error);
      return null;
    }
  }, [solanaWallet, signSolanaMessage]);

  return {
    // State
    isConnected: authenticated && !!walletAddress,
    isReady: ready && solanaReady,
    isLoading: !ready || !solanaReady,
    walletAddress,
    displayAddress,
    holderVerification,
    // Actions
    connect,
    disconnect,
    signMessage,
  };
}

/**
 * Hook to check if Privy is configured
 */
export function usePrivyConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_PRIVY_APP_ID;
}
