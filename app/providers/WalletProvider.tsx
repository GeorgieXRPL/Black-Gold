/**
 * @fileoverview Wallet context provider for Black Gold v3.3
 * Provides wallet state that works during SSR and integrates with Privy
 * Supports both message signing and transaction signing for on-chain staking
 * 
 * IMPORTANT: This provider must be rendered INSIDE PrivyProvider
 * 
 * v3.3.14: Added shared holder verification to prevent multiple instances
 */

'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import dynamic from 'next/dynamic';
import type { HolderVerification } from '../../server/types';

// Holder verification state
export interface HolderVerificationState {
  verification: HolderVerification | null;
  loading: boolean;
  error: string | null;
  refresh: (force?: boolean) => Promise<void>;
}

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
  // Shared holder verification - single instance for all consumers
  holderVerification: HolderVerificationState;
}

// Default holder verification state
const defaultHolderVerification: HolderVerificationState = {
  verification: null,
  loading: false,
  error: null,
  refresh: async () => {},
};

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
  holderVerification: defaultHolderVerification,
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
 * 
 * IMPORTANT: Holder verification is managed here as a SINGLE instance
 * to prevent multiple hook instances from overwriting each other's data
 */
export function WalletProvider({ children }: WalletProviderProps) {
  // Extract base context properties (exclude holderVerification)
  const { holderVerification: _, ...defaultBaseContext } = defaultContext;
  const [baseContext, setBaseContext] = useState<Omit<WalletContextValue, 'holderVerification'>>(defaultBaseContext);
  const [isClient, setIsClient] = useState(false);
  const [shouldLoadPrivy, setShouldLoadPrivy] = useState(false);
  
  // Holder verification state - SINGLE instance for entire app
  const [verification, setVerification] = useState<HolderVerification | null>(null);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  
  // Refs for managing fetch state
  const lastForceRefreshRef = useRef<number>(0);
  const fetchingRef = useRef<boolean>(false);
  const initialFetchDoneRef = useRef<boolean>(false);

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
      setBaseContext(prev => ({
        ...prev,
        isReady: true,
        isLoading: false,
      }));
      return;
    }

    setShouldLoadPrivy(true);
  }, [isClient]);

  // Holder verification fetch function
  const fetchVerification = useCallback(async (force: boolean = false) => {
    const walletAddress = baseContext.walletAddress;
    
    if (!walletAddress) {
      setVerification(null);
      setVerificationError(null);
      return;
    }

    // IMMEDIATELY mark force refresh timestamp to prevent race conditions
    if (force) {
      lastForceRefreshRef.current = Date.now();
      console.log(`[HolderVerification] Force refresh initiated at ${lastForceRefreshRef.current}`);
    }

    // If this is a non-force refresh and a force refresh was done in the last 30 seconds, skip it
    if (!force && lastForceRefreshRef.current > 0) {
      const timeSinceForce = Date.now() - lastForceRefreshRef.current;
      if (timeSinceForce < 30000) {
        console.log(`[HolderVerification] Skipping non-force refresh (force refresh was ${timeSinceForce}ms ago)`);
        return;
      }
    }

    // Prevent concurrent fetches - force refresh always wins
    if (fetchingRef.current && !force) {
      console.log('[HolderVerification] Skipping - another fetch is in progress');
      return;
    }

    fetchingRef.current = true;
    setVerificationLoading(true);
    setVerificationError(null);

    try {
      const forceParam = force ? '&force=true' : '';
      const timestamp = `&_t=${Date.now()}`;
      console.log(`[HolderVerification] Fetching balance for ${walletAddress.slice(0,8)}...${force ? ' (force refresh)' : ''}`);
      
      const response = await fetch(
        `/api/verify-holder?wallet=${encodeURIComponent(walletAddress)}${forceParam}${timestamp}`,
        { cache: 'no-store' }
      );
      
      if (!response.ok) {
        throw new Error(`Verification failed: ${response.status}`);
      }

      const data = await response.json();
      
      console.log(`[HolderVerification] Got balance: ${data.balance?.toLocaleString() ?? 'null'}${force ? ' (from force refresh)' : ''}`);
      
      const verificationResult: HolderVerification = {
        walletAddress: data.walletAddress,
        balance: data.balance,
        percentOfSupply: data.percentOfSupply,
        requiredPercent: data.requiredPercent,
        isEligible: data.isEligible,
        cachedAt: new Date(data.cachedAt),
        marketCap: data.marketCap,
      };

      setVerification(verificationResult);
    } catch (err) {
      console.error('[HolderVerification] Error:', err);
      setVerificationError(err instanceof Error ? err.message : 'Verification failed');
      setVerification(null);
    } finally {
      setVerificationLoading(false);
      fetchingRef.current = false;
    }
  }, [baseContext.walletAddress]);

  // Initial fetch when wallet connects
  useEffect(() => {
    if (baseContext.walletAddress && !initialFetchDoneRef.current) {
      initialFetchDoneRef.current = true;
      const timer = setTimeout(() => {
        fetchVerification();
      }, 100);
      return () => clearTimeout(timer);
    } else if (!baseContext.walletAddress) {
      initialFetchDoneRef.current = false;
      lastForceRefreshRef.current = 0;
      setVerification(null);
    }
  }, [baseContext.walletAddress, fetchVerification]);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    if (!baseContext.walletAddress) return;

    const interval = setInterval(() => {
      fetchVerification();
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [baseContext.walletAddress, fetchVerification]);

  // Build complete context value with holder verification
  const contextValue: WalletContextValue = {
    ...baseContext,
    holderVerification: {
      verification,
      loading: verificationLoading,
      error: verificationError,
      refresh: fetchVerification,
    },
  };

  // Handler for PrivyBridge to update base context (without holderVerification)
  // PrivyBridge only sets the base wallet properties, holderVerification is managed here
  const handleSetContextValue = useCallback((value: Omit<WalletContextValue, 'holderVerification'>) => {
    setBaseContext(value);
  }, []);

  return (
    <WalletContext.Provider value={contextValue}>
      {isClient && shouldLoadPrivy ? (
        <PrivyBridge setContextValue={handleSetContextValue}>
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
