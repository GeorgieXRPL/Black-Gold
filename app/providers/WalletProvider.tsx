/**
 * @fileoverview Wallet context provider for Black Gold
 * Provides wallet state that works during SSR and integrates with Privy
 * 
 * IMPORTANT: This provider must be rendered INSIDE PrivyProvider
 */

'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

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
  connect: () => {
    console.log('[Wallet] Connect called before Privy loaded');
  },
  disconnect: async () => {
    console.log('[Wallet] Disconnect called before Privy loaded');
  },
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
  const [privyLoaded, setPrivyLoaded] = useState(false);

  // Mark as client-side
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Check if Privy should be loaded
  useEffect(() => {
    if (!isClient) return;
    
    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
    if (!appId) {
      setContextValue({
        ...defaultContext,
        isReady: true,
        isLoading: false,
      });
      return;
    }

    setPrivyLoaded(true);
  }, [isClient]);

  return (
    <WalletContext.Provider value={contextValue}>
      {isClient && privyLoaded ? (
        <PrivyHooksBridge setContextValue={setContextValue}>
          {children}
        </PrivyHooksBridge>
      ) : (
        children
      )}
    </WalletContext.Provider>
  );
}

/**
 * Bridge component that can safely call Privy hooks
 */
function PrivyHooksBridge({ 
  children, 
  setContextValue 
}: { 
  children: ReactNode; 
  setContextValue: (value: WalletContextValue) => void;
}) {
  const [HooksComponent, setHooksComponent] = useState<React.ComponentType<{
    children: ReactNode;
    setContextValue: (value: WalletContextValue) => void;
  }> | null>(null);

  useEffect(() => {
    const createHooksComponent = async () => {
      try {
        // Import only the core Privy hooks (avoid solana-specific imports that may not exist)
        const { usePrivy, useLogin, useLogout } = await import('@privy-io/react-auth');

        // Create a component that uses the hooks
        const HooksUser = ({ children, setContextValue }: {
          children: ReactNode;
          setContextValue: (value: WalletContextValue) => void;
        }) => {
          const { ready, authenticated, user } = usePrivy();
          const { login } = useLogin();
          const { logout } = useLogout();

          // Get wallet from user object - Privy stores linked wallets here
          const linkedWallet = user?.linkedAccounts?.find(
            (account: any) => account.type === 'wallet' && account.chainType === 'solana'
          ) as { address?: string } | undefined;
          
          const walletAddress = linkedWallet?.address || null;
          const displayAddress = walletAddress 
            ? `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`
            : null;

          // Update context when state changes
          useEffect(() => {
            setContextValue({
              isConnected: authenticated && !!walletAddress,
              isReady: ready,
              isLoading: !ready,
              walletAddress,
              displayAddress,
              connect: () => {
                console.log('[Wallet] Connecting via Privy...');
                login();
              },
              disconnect: async () => {
                console.log('[Wallet] Disconnecting...');
                await logout();
              },
              signMessage: async (message: string) => {
                // For now, return null - message signing requires additional setup
                console.warn('[Wallet] Message signing not yet implemented');
                return null;
              },
            });
          }, [ready, authenticated, walletAddress, displayAddress, login, logout, setContextValue]);

          return <>{children}</>;
        };

        setHooksComponent(() => HooksUser);
      } catch (error) {
        console.error('[Wallet] Failed to create hooks component:', error);
      }
    };

    createHooksComponent();
  }, []);

  if (!HooksComponent) {
    return <>{children}</>;
  }

  return (
    <HooksComponent setContextValue={setContextValue}>
      {children}
    </HooksComponent>
  );
}

/**
 * Hook to use wallet context
 */
export function useWalletContext(): WalletContextValue {
  return useContext(WalletContext);
}
