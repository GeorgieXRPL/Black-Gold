/**
 * @fileoverview Wallet context provider for Black Gold v3.3
 * Provides wallet state that works during SSR and integrates with Privy
 * Supports both message signing and transaction signing for on-chain staking
 * 
 * IMPORTANT: This provider must be rendered INSIDE PrivyProvider
 */

'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import dynamic from 'next/dynamic';

// Define the wallet context shape
export interface WalletContextValue {
  isConnected: boolean;
  isReady: boolean;
  isLoading: boolean;
  walletAddress: string | null;
  displayAddress: string | null;
  connect: () => void;
  disconnect: () => Promise<void>;
  signMessage: (message: string) => Promise<string | null>;
  signTransaction: (serializedTx: string) => Promise<string | null>;
  signAndSendTransaction: (serializedTx: string) => Promise<string | null>;
}

// Default context value for SSR
const defaultContext: WalletContextValue = {
  isConnected: false,
  isReady: false,
  isLoading: false,
  walletAddress: null,
  displayAddress: null,
  connect: () => {
    console.log('[Wallet] Connect called before Privy loaded');
  },
  disconnect: async () => {
    console.log('[Wallet] Disconnect called before Privy loaded');
  },
  signMessage: async () => {
    console.log('[Wallet] Sign message called before Privy loaded');
    return null;
  },
  signTransaction: async () => {
    console.log('[Wallet] Sign transaction called before Privy loaded');
    return null;
  },
  signAndSendTransaction: async () => {
    console.log('[Wallet] Sign and send transaction called before Privy loaded');
    return null;
  },
};

// Create the context
const WalletContext = createContext<WalletContextValue>(defaultContext);

// Provider props
interface WalletProviderProps {
  children: ReactNode;
}

// Dynamically import PrivyBridge to ensure it's only loaded client-side
// This also ensures Privy hooks are called within proper context
const PrivyBridge = dynamic(
  () => import('./PrivyBridge'),
  { 
    ssr: false,
    loading: () => null, // Don't show loading state, just render children
  }
);

/**
 * Wallet Provider component
 * Wraps children with wallet context and handles Privy integration
 */
export function WalletProvider({ children }: WalletProviderProps) {
  const [contextValue, setContextValue] = useState<WalletContextValue>(defaultContext);
  const [isClient, setIsClient] = useState(false);
  const [shouldLoadPrivy, setShouldLoadPrivy] = useState(false);

  // Mark as client-side
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Check if Privy should be loaded
  useEffect(() => {
    if (!isClient) return;
    
    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
    if (!appId) {
      // No Privy app ID - set as ready but without wallet features
      setContextValue({
        ...defaultContext,
        isReady: true,
        isLoading: false,
      });
      return;
    }

    setShouldLoadPrivy(true);
  }, [isClient]);

  return (
    <WalletContext.Provider value={contextValue}>
      {isClient && shouldLoadPrivy ? (
        <PrivyBridge setContextValue={setContextValue}>
          {children}
        </PrivyBridge>
      ) : (
        children
      )}
    </WalletContext.Provider>
  );
}

/**
 * Hook to use wallet context
 */
export function useWalletContext(): WalletContextValue {
  return useContext(WalletContext);
}
