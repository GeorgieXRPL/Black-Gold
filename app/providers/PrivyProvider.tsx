/**
 * @fileoverview Privy authentication provider for Black Gold
 * Wraps the app with Privy for wallet connection and authentication
 * 
 * Uses dynamic import to prevent SSR issues with wallet connectors
 */

'use client';

import { useEffect, useState, ReactNode } from 'react';

interface PrivyProviderProps {
  children: ReactNode;
}

/**
 * Privy authentication provider component
 * Loads Privy dynamically on the client side only to prevent SSR errors
 */
export function PrivyProvider({ children }: PrivyProviderProps) {
  const [PrivyWrapper, setPrivyWrapper] = useState<React.ComponentType<{ children: ReactNode }> | null>(null);
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  useEffect(() => {
    // Only load Privy on the client side when app ID is configured
    if (!appId) {
      console.warn('[Privy] NEXT_PUBLIC_PRIVY_APP_ID not set - wallet features disabled');
      return;
    }

    // Dynamically import Privy to avoid SSR issues
    const loadPrivy = async () => {
      try {
        const { PrivyProvider: PrivyProviderLib } = await import('@privy-io/react-auth');
        const { toSolanaWalletConnectors } = await import('@privy-io/react-auth/solana');

        // Create Solana connectors
        const solanaConnectors = toSolanaWalletConnectors({
          shouldAutoConnect: true,
        });

        // Create wrapper component with Privy config
        const Wrapper = ({ children }: { children: ReactNode }) => (
          <PrivyProviderLib
            appId={appId}
            config={{
              appearance: {
                theme: 'dark',
                accentColor: '#F59E0B',
                logo: '/globe.svg',
                showWalletLoginFirst: true,
                walletChainType: 'solana-only',
              },
              loginMethods: ['wallet'],
              externalWallets: {
                solana: {
                  connectors: solanaConnectors,
                },
              },
            }}
          >
            {children}
          </PrivyProviderLib>
        );

        setPrivyWrapper(() => Wrapper);
      } catch (error) {
        console.error('[Privy] Failed to load:', error);
      }
    };

    loadPrivy();
  }, [appId]);

  // If no app ID or Privy not loaded yet, just render children
  if (!appId || !PrivyWrapper) {
    return <>{children}</>;
  }

  return <PrivyWrapper>{children}</PrivyWrapper>;
}
