/**
 * @fileoverview Privy authentication provider for Black Gold
 * Wraps the app with Privy for wallet connection and authentication
 */

'use client';

import { PrivyProvider as PrivyProviderLib } from '@privy-io/react-auth';
import { toSolanaWalletConnectors } from '@privy-io/react-auth/solana';

interface PrivyProviderProps {
  children: React.ReactNode;
}

// Solana wallet connectors for Privy
const solanaConnectors = toSolanaWalletConnectors({
  // Enable popular Solana wallets with auto-connect
  shouldAutoConnect: true,
});

/**
 * Privy authentication provider component
 * Configures Privy for Solana wallet authentication
 */
export function PrivyProvider({ children }: PrivyProviderProps) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

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
        // External wallet connectors for Solana
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
}
