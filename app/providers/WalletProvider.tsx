/**
 * @fileoverview Wallet context provider for Black Gold v3.3
 * Provides wallet state that works during SSR and integrates with Privy
 * Supports both message signing and transaction signing for on-chain staking
 * 
 * IMPORTANT: This provider must be rendered INSIDE PrivyProvider
 */

'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { Transaction, VersionedTransaction, Connection } from '@solana/web3.js';

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

// RPC endpoint for sending transactions
const getRpcEndpoint = () => {
  const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet';
  if (network === 'mainnet' || network === 'mainnet-beta') {
    return process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  }
  return process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
};

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
        // Import Privy hooks - including useWallets for Solana wallet access
        const { usePrivy, useLogin, useLogout, useWallets } = await import('@privy-io/react-auth');

        // Create a component that uses the hooks
        const HooksUser = ({ children, setContextValue }: {
          children: ReactNode;
          setContextValue: (value: WalletContextValue) => void;
        }) => {
          const { ready, authenticated, user } = usePrivy();
          const { login } = useLogin();
          const { logout } = useLogout();
          const { wallets } = useWallets();

          // Find the Solana wallet from Privy's wallet list
          // This handles both embedded wallets and external wallets (Phantom, etc.)
          const solanaWallet = wallets.find(
            (w: any) => w.walletClientType === 'solana' || w.chainType === 'solana'
          );

          // Also check linked accounts for wallet address (backup)
          const linkedWallet = user?.linkedAccounts?.find(
            (account: any) => account.type === 'wallet' && account.chainType === 'solana'
          ) as { address?: string } | undefined;
          
          const walletAddress = solanaWallet?.address || linkedWallet?.address || null;
          const displayAddress = walletAddress 
            ? `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`
            : null;

          // Sign message function using Privy Solana wallet
          const handleSignMessage = useCallback(async (message: string): Promise<string | null> => {
            if (!authenticated || !walletAddress) {
              console.warn('[Wallet] Cannot sign: not authenticated');
              return null;
            }

            try {
              // Use Privy's Solana wallet for signing
              if (solanaWallet) {
                console.log('[Wallet] Signing message with Privy Solana wallet...');
                const provider = await (solanaWallet as any).getProvider();
                if (provider?.signMessage) {
                  const encodedMessage = new TextEncoder().encode(message);
                  const signedMessage = await provider.signMessage(encodedMessage);
                  // Convert signature to base64 or hex string
                  const signature = Buffer.from(signedMessage.signature || signedMessage).toString('base64');
                  return signature;
                }
              }

              // Fallback: Use window.solana if Phantom or other wallet is connected
              if (typeof window !== 'undefined' && (window as any).solana?.signMessage) {
                console.log('[Wallet] Signing message with window.solana...');
                const encodedMessage = new TextEncoder().encode(message);
                const { signature } = await (window as any).solana.signMessage(encodedMessage, 'utf8');
                return Buffer.from(signature).toString('base64');
              }
              
              console.warn('[Wallet] signMessage not available from any wallet');
              return null;
            } catch (error) {
              console.error('[Wallet] Sign message error:', error);
              return null;
            }
          }, [authenticated, walletAddress, solanaWallet]);

          // Sign transaction function (returns signed but not sent)
          const handleSignTransaction = useCallback(async (serializedTx: string): Promise<string | null> => {
            if (!authenticated || !walletAddress) {
              console.warn('[Wallet] Cannot sign: not authenticated');
              return null;
            }

            try {
              // Deserialize the transaction
              const txBuffer = Buffer.from(serializedTx, 'base64');
              let transaction: Transaction | VersionedTransaction;
              
              try {
                // Try as versioned transaction first
                transaction = VersionedTransaction.deserialize(txBuffer);
              } catch {
                // Fall back to legacy transaction
                transaction = Transaction.from(txBuffer);
              }

              // Use Privy's Solana wallet for signing
              if (solanaWallet) {
                console.log('[Wallet] Signing transaction with Privy Solana wallet...');
                const provider = await (solanaWallet as any).getProvider();
                if (provider?.signTransaction) {
                  const signedTx = await provider.signTransaction(transaction);
                  return Buffer.from(signedTx.serialize()).toString('base64');
                }
              }

              // Fallback: Use window.solana if Phantom or other wallet is connected
              if (typeof window !== 'undefined' && (window as any).solana?.signTransaction) {
                console.log('[Wallet] Signing transaction with window.solana...');
                const signedTx = await (window as any).solana.signTransaction(transaction);
                return Buffer.from(signedTx.serialize()).toString('base64');
              }

              console.warn('[Wallet] No transaction signing method available');
              return null;
            } catch (error) {
              console.error('[Wallet] Sign transaction error:', error);
              return null;
            }
          }, [authenticated, walletAddress, solanaWallet]);

          // Sign and send transaction function
          const handleSignAndSendTransaction = useCallback(async (serializedTx: string): Promise<string | null> => {
            if (!authenticated || !walletAddress) {
              console.warn('[Wallet] Cannot sign: not authenticated');
              return null;
            }

            try {
              // Deserialize the transaction
              const txBuffer = Buffer.from(serializedTx, 'base64');
              let transaction: Transaction | VersionedTransaction;
              
              try {
                transaction = VersionedTransaction.deserialize(txBuffer);
              } catch {
                transaction = Transaction.from(txBuffer);
              }

              // Create connection
              const connection = new Connection(getRpcEndpoint(), 'confirmed');

              // Use Privy's Solana wallet for signing and sending
              if (solanaWallet) {
                console.log('[Wallet] Signing and sending with Privy Solana wallet...');
                const provider = await (solanaWallet as any).getProvider();
                
                // Try signAndSendTransaction if available
                if (provider?.signAndSendTransaction) {
                  const { signature } = await provider.signAndSendTransaction(transaction);
                  console.log('[Wallet] Transaction sent via Privy Solana wallet:', signature);
                  return signature;
                }
                
                // Otherwise sign and send manually
                if (provider?.signTransaction) {
                  const signedTx = await provider.signTransaction(transaction);
                  const signature = await connection.sendRawTransaction(signedTx.serialize(), {
                    skipPreflight: false,
                    preflightCommitment: 'confirmed',
                  });
                  
                  // Wait for confirmation
                  const confirmation = await connection.confirmTransaction(signature, 'confirmed');
                  if (confirmation.value.err) {
                    console.error('[Wallet] Transaction failed:', confirmation.value.err);
                    return null;
                  }
                  
                  console.log('[Wallet] Transaction confirmed via Privy:', signature);
                  return signature;
                }
              }

              // Fallback: Try window.solana (Phantom/other wallets)
              if (typeof window !== 'undefined' && (window as any).solana) {
                console.log('[Wallet] Trying window.solana fallback...');
                const windowSolana = (window as any).solana;
                
                if (windowSolana.signAndSendTransaction) {
                  const { signature } = await windowSolana.signAndSendTransaction(transaction);
                  console.log('[Wallet] Transaction sent via window.solana:', signature);
                  return signature;
                }
                
                if (windowSolana.signTransaction) {
                  const signedTx = await windowSolana.signTransaction(transaction);
                  const signature = await connection.sendRawTransaction(signedTx.serialize(), {
                    skipPreflight: false,
                    preflightCommitment: 'confirmed',
                  });
                  
                  const confirmation = await connection.confirmTransaction(signature, 'confirmed');
                  if (confirmation.value.err) {
                    console.error('[Wallet] Transaction failed:', confirmation.value.err);
                    return null;
                  }
                  
                  console.log('[Wallet] Transaction confirmed via window.solana:', signature);
                  return signature;
                }
              }

              console.error('[Wallet] No wallet signing method available');
              return null;
            } catch (error) {
              console.error('[Wallet] Sign and send transaction error:', error);
              return null;
            }
          }, [authenticated, walletAddress, solanaWallet]);

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
              signMessage: handleSignMessage,
              signTransaction: handleSignTransaction,
              signAndSendTransaction: handleSignAndSendTransaction,
            });
          }, [
            ready, 
            authenticated, 
            walletAddress, 
            displayAddress, 
            login, 
            logout, 
            setContextValue, 
            handleSignMessage, 
            handleSignTransaction, 
            handleSignAndSendTransaction
          ]);

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
