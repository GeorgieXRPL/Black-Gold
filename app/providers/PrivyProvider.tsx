/**
 * @fileoverview Privy authentication provider for Black Gold
 * Wraps the app with Privy for wallet connection and authentication
 */

'use client';

import { useMemo } from 'react';
import { PrivyProvider as PrivyProviderLib } from '@privy-io/react-auth';
import { toSolanaWalletConnectors } from '@privy-io/react-auth/solana';

interface PrivyProviderProps {
  children: React.ReactNode;
}

/**
 * Privy authentication provider component
 * Configures Privy for Solana wallet authentication
 */
export function PrivyProvider({ children }: PrivyProviderProps) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  // Initialize Solana connectors only on client-side
  // This prevents SSR/build errors from wallet connectors accessing browser APIs
  const solanaConnectors = useMemo(() => {
    if (typeof window === 'undefined') return undefined;
    try {
      return toSolanaWalletConnectors({
        shouldAutoConnect: true,
      });
    } catch (error) {
      console.warn('[Privy] Failed to initialize Solana connectors:', error);
      return undefined;
    }
  }, []);

  // Fallback for development if no app ID configured
  if (!appId) {
    console.warn('[Privy] NEXT_PUBLIC_PRIVY_APP_ID not set - wallet features disabled');
    return <>{children}</>;
  }

  return (
    <PrivyProviderLib
      appId={appId}
      config={{
        // Appearance configuration matching Black Gold theme
        appearance: {
          theme: 'dark',
          accentColor: '#F59E0B', // Gold/amber accent
          logo: '/globe.svg',
          showWalletLoginFirst: true,
          // Show only Solana wallets since Black Gold is Solana-based
          walletChainType: 'solana-only',
        },
        // Login methods - prioritize wallet connection
        loginMethods: ['wallet'],
        // External wallet connectors for Solana (only if available)
        ...(solanaConnectors && {
          externalWallets: {
            solana: {
              connectors: solanaConnectors,
            },
          },
        }),
      }}
    >
      {children}
    </PrivyProviderLib>
  );
}
