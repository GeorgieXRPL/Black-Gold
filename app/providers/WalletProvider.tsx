/**
 * @fileoverview Wallet context provider for Black Gold
 * Provides wallet state that works during SSR and with Privy
 * 
 * This is a separate layer that safely wraps Privy hooks
 */

'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

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
}

// Default context value for SSR
const defaultContext: WalletContextValue = {
  isConnected: false,
  isReady: false,
  isLoading: false,
  walletAddress: null,
  displayAddress: null,
  connect: () => {},
  disconnect: async () => {},
  signMessage: async () => null,
};

// Create the context
const WalletContext = createContext<WalletContextValue>(defaultContext);

// Provider props
interface WalletProviderProps {
  children: ReactNode;
}

/**
 * Wallet Provider component
 * Wraps children with wallet context and handles Privy integration
 */
export function WalletProvider({ children }: WalletProviderProps) {
  const [contextValue, setContextValue] = useState<WalletContextValue>(defaultContext);
  const [isClient, setIsClient] = useState(false);

  // Mark as client-side
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Load Privy and set up wallet hooks
  useEffect(() => {
    if (!isClient) return;
    
    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
    if (!appId) {
      // No Privy configured - wallet features disabled
      setContextValue({
        ...defaultContext,
        isReady: true,
        isLoading: false,
      });
      return;
    }

    // For now, we'll provide basic state management
    // Privy hooks will be integrated once the provider is loaded
    setContextValue({
      ...defaultContext,
      isReady: true,
      isLoading: false,
    });
  }, [isClient]);

  return (
    <WalletContext.Provider value={contextValue}>
      {children}
    </WalletContext.Provider>
  );
}

/**
 * Hook to use wallet context
 */
export function useWalletContext(): WalletContextValue {
  return useContext(WalletContext);
}
