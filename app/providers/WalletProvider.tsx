/**
 * @fileoverview Wallet context provider for Black Gold
 * Provides wallet state that works during SSR and integrates with Privy
 * 
 * IMPORTANT: This provider must be rendered INSIDE PrivyProvider
 */

'use client';

import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';

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
 * Inner component that uses Privy hooks
 * This is rendered only when we're on the client and Privy is loaded
 */
function PrivyWalletBridge({ children, setContextValue }: { 
  children: ReactNode; 
  setContextValue: (value: WalletContextValue) => void;
}) {
  const [privyHooks, setPrivyHooks] = useState<{
    usePrivy: any;
    useLogin: any;
    useLogout: any;
    useSolanaWallets: any;
  } | null>(null);

  // Dynamically load Privy hooks
  useEffect(() => {
    const loadHooks = async () => {
      try {
        const privyAuth = await import('@privy-io/react-auth');
        const privySolana = await import('@privy-io/react-auth/solana');
        
        setPrivyHooks({
          usePrivy: privyAuth.usePrivy,
          useLogin: privyAuth.useLogin,
          useLogout: privyAuth.useLogout,
          useSolanaWallets: privySolana.useSolanaWallets,
        });
      } catch (error) {
        console.error('[Wallet] Failed to load Privy hooks:', error);
      }
    };
    
    loadHooks();
  }, []);

  // Use Privy hooks once loaded
  useEffect(() => {
    if (!privyHooks) return;
    
    // We need to create a component that actually calls the hooks
    // Since hooks can't be called conditionally, we use this pattern
  }, [privyHooks]);

  return <>{children}</>;
}

/**
 * Component that actually uses Privy hooks
 */
function PrivyHooksConsumer({ onUpdate }: { onUpdate: (value: WalletContextValue) => void }) {
  // These hooks will only work if we're inside PrivyProvider
  // We import them dynamically to avoid SSR issues
  const [hooks, setHooks] = useState<any>(null);
  const [walletState, setWalletState] = useState<{
    ready: boolean;
    authenticated: boolean;
    walletAddress: string | null;
  }>({ ready: false, authenticated: false, walletAddress: null });

  useEffect(() => {
    const loadAndUseHooks = async () => {
      try {
        const { usePrivy, useLogin, useLogout } = await import('@privy-io/react-auth');
        const { useSolanaWallets } = await import('@privy-io/react-auth/solana');
        setHooks({ usePrivy, useLogin, useLogout, useSolanaWallets });
      } catch (e) {
        console.error('[Wallet] Privy import failed:', e);
      }
    };
    loadAndUseHooks();
  }, []);

  // This won't work because hooks need to be called at the top level
  // We need a different approach...
  
  return null;
}

/**
 * Wallet Provider component
 * Wraps children with wallet context and handles Privy integration
 */
export function WalletProvider({ children }: WalletProviderProps) {
  const [contextValue, setContextValue] = useState<WalletContextValue>(defaultContext);
  const [isClient, setIsClient] = useState(false);
  const [privyLoaded, setPrivyLoaded] = useState(false);
  const [privyState, setPrivyState] = useState<{
    ready: boolean;
    authenticated: boolean;
    login: () => void;
    logout: () => Promise<void>;
    wallets: any[];
  } | null>(null);

  // Mark as client-side
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Try to use Privy hooks after mounting
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

    // Poll for Privy to be ready (since we can't use hooks directly here)
    // This is a workaround - ideally we'd use a proper hook
    const checkPrivy = async () => {
      try {
        // Import the hooks
        const { usePrivy, useLogin, useLogout } = await import('@privy-io/react-auth');
        const { useSolanaWallets } = await import('@privy-io/react-auth/solana');
        
        setPrivyLoaded(true);
        
        // Note: We can't actually call these hooks here because this is not a component
        // The hooks need to be called from within a React component function body
        // This is a limitation of React hooks
        
      } catch (error) {
        console.error('[Wallet] Failed to import Privy:', error);
      }
    };

    checkPrivy();
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
  // Import hooks at module level is not possible due to SSR
  // So we use a state-based approach
  const [HooksComponent, setHooksComponent] = useState<React.ComponentType<{
    children: ReactNode;
    setContextValue: (value: WalletContextValue) => void;
  }> | null>(null);

  useEffect(() => {
    const createHooksComponent = async () => {
      try {
        const { usePrivy, useLogin, useLogout } = await import('@privy-io/react-auth');
        const { useSolanaWallets } = await import('@privy-io/react-auth/solana');

        // Create a component that uses the hooks
        const HooksUser = ({ children, setContextValue }: {
          children: ReactNode;
          setContextValue: (value: WalletContextValue) => void;
        }) => {
          const { ready, authenticated } = usePrivy();
          const { login } = useLogin();
          const { logout } = useLogout();
          const { wallets } = useSolanaWallets();

          const solanaWallet = wallets?.[0] || null;
          const walletAddress = solanaWallet?.address || null;
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
                if (!solanaWallet) return null;
                try {
                  // Privy wallet signing
                  const encoder = new TextEncoder();
                  const messageBytes = encoder.encode(message);
                  const signature = await solanaWallet.signMessage(messageBytes);
                  return Buffer.from(signature).toString('base64');
                } catch (error) {
                  console.error('[Wallet] Sign message failed:', error);
                  return null;
                }
              },
            });
          }, [ready, authenticated, walletAddress, displayAddress, login, logout, solanaWallet, setContextValue]);

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
