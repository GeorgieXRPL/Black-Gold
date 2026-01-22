/**
 * @fileoverview Bridge component that properly uses Privy hooks
 * This file is loaded dynamically to ensure it's only imported client-side
 * and hooks are called within the PrivyProvider context
 * 
 * v3.3.14: setContextValue now accepts base context without holderVerification
 * (holderVerification is managed separately in WalletProvider)
 */

'use client';

import { ReactNode, useEffect, useCallback } from 'react';
import { usePrivy, useLogin, useLogout, useWallets } from '@privy-io/react-auth';
import { Transaction, VersionedTransaction, Connection } from '@solana/web3.js';
import type { WalletContextValue } from './WalletProvider';

// Type for setting base context (holderVerification is managed by WalletProvider)
type BaseWalletContext = Omit<WalletContextValue, 'holderVerification'>;

interface PrivyBridgeProps {
  children: ReactNode;
  setContextValue: (value: BaseWalletContext) => void;
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
 * Bridge component that uses Privy hooks and updates wallet context
 * This component is statically imported from Privy, ensuring proper context access
 */
export default function PrivyBridge({ children, setContextValue }: PrivyBridgeProps) {
  const { ready, authenticated, user } = usePrivy();
  const { login } = useLogin();
  const { logout } = useLogout();
  const { wallets } = useWallets();

  // Find the Solana wallet from Privy's wallet list
  // This handles both embedded wallets and external wallets (Phantom, etc.)
  // Log all wallets for debugging
  console.log('[Wallet] Available wallets from Privy:', wallets.map(w => ({
    address: w.address?.slice(0, 8),
    walletClientType: w.walletClientType,
    chainType: (w as any).chainType,
    connectorType: (w as any).connectorType,
  })));
  
  const solanaWallet = wallets.find(
    (w) => {
      const isSolana = w.walletClientType === 'solana' || 
                       (w as any).chainType === 'solana' ||
                       w.walletClientType === 'phantom' ||
                       (w as any).connectorType === 'solana_adapter';
      return isSolana;
    }
  );

  // Also check linked accounts for wallet address (backup)
  const linkedWallet = user?.linkedAccounts?.find(
    (account) => account.type === 'wallet' && (account as any).chainType === 'solana'
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
      throw new Error('Wallet not connected');
    }

    console.log('[Wallet] Starting sign and send transaction...');
    console.log('[Wallet] Wallet address:', walletAddress);
    console.log('[Wallet] Solana wallet found:', !!solanaWallet);
    console.log('[Wallet] Transaction length:', serializedTx?.length);

    // Deserialize the transaction
    let txBuffer: Buffer;
    try {
      txBuffer = Buffer.from(serializedTx, 'base64');
      console.log('[Wallet] Deserialized buffer length:', txBuffer.length);
    } catch (e) {
      console.error('[Wallet] Failed to decode base64:', e);
      throw new Error('Invalid transaction format');
    }

    let transaction: Transaction | VersionedTransaction;
    let isVersioned = false;
    
    // Try legacy Transaction FIRST since our server builds legacy transactions
    try {
      transaction = Transaction.from(txBuffer);
      console.log('[Wallet] Parsed as legacy Transaction');
      console.log('[Wallet] Instructions count:', transaction.instructions?.length);
      console.log('[Wallet] Fee payer:', transaction.feePayer?.toBase58()?.slice(0, 8));
      console.log('[Wallet] Recent blockhash:', transaction.recentBlockhash?.slice(0, 8));
    } catch (legacyError) {
      console.log('[Wallet] Legacy parse failed, trying VersionedTransaction...');
      try {
        transaction = VersionedTransaction.deserialize(txBuffer);
        isVersioned = true;
        console.log('[Wallet] Parsed as VersionedTransaction');
      } catch (e) {
        console.error('[Wallet] Failed to parse transaction as either type:', e);
        throw new Error('Failed to parse transaction');
      }
    }

    // Create connection
    const rpcUrl = getRpcEndpoint();
    console.log('[Wallet] Using RPC:', rpcUrl);
    const connection = new Connection(rpcUrl, 'confirmed');

    // Use Privy's Solana wallet for signing and sending
    if (solanaWallet) {
      console.log('[Wallet] Getting Privy wallet provider...');
      let provider;
      try {
        provider = await (solanaWallet as any).getProvider();
        console.log('[Wallet] Provider methods:', Object.keys(provider || {}));
      } catch (e) {
        console.error('[Wallet] Failed to get provider:', e);
        throw new Error('Failed to access wallet provider');
      }
      
      // Try signAndSendTransaction if available
      if (provider?.signAndSendTransaction) {
        console.log('[Wallet] Using signAndSendTransaction...');
        try {
          const result = await provider.signAndSendTransaction(transaction);
          const signature = result?.signature || result;
          console.log('[Wallet] Transaction sent via Privy Solana wallet:', signature);
          return signature;
        } catch (e: any) {
          console.error('[Wallet] signAndSendTransaction failed:', e);
          console.error('[Wallet] Error details:', JSON.stringify(e, null, 2));
          // Re-throw with better message
          throw new Error(e?.message || e?.error?.message || 'Transaction failed');
        }
      }
      
      // Otherwise sign and send manually
      if (provider?.signTransaction) {
        console.log('[Wallet] Using manual sign then send...');
        try {
          const signedTx = await provider.signTransaction(transaction);
          console.log('[Wallet] Transaction signed, sending to network...');
          
          const signature = await connection.sendRawTransaction(signedTx.serialize(), {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
          });
          console.log('[Wallet] Sent, waiting for confirmation:', signature);
          
          // Wait for confirmation
          const confirmation = await connection.confirmTransaction(signature, 'confirmed');
          if (confirmation.value.err) {
            console.error('[Wallet] Transaction failed on-chain:', confirmation.value.err);
            throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
          }
          
          console.log('[Wallet] Transaction confirmed via Privy:', signature);
          return signature;
        } catch (e: any) {
          console.error('[Wallet] Manual sign+send failed:', e);
          throw new Error(e?.message || 'Failed to sign and send transaction');
        }
      }
      
      console.error('[Wallet] Provider has no signing methods');
      throw new Error('Wallet does not support transaction signing');
    }

    // Fallback: Try window.solana (Phantom/other wallets)
    if (typeof window !== 'undefined' && (window as any).solana) {
      console.log('[Wallet] Trying window.solana fallback...');
      console.log('[Wallet] window.solana.isPhantom:', (window as any).solana?.isPhantom);
      console.log('[Wallet] window.solana.isConnected:', (window as any).solana?.isConnected);
      console.log('[Wallet] Transaction type:', isVersioned ? 'VersionedTransaction' : 'LegacyTransaction');
      
      const windowSolana = (window as any).solana;
      
      // Ensure Phantom is connected
      if (!windowSolana.isConnected) {
        console.log('[Wallet] Phantom not connected, attempting to connect...');
        try {
          await windowSolana.connect();
          console.log('[Wallet] Phantom connected');
        } catch (connectError) {
          console.error('[Wallet] Failed to connect Phantom:', connectError);
        }
      }
      
      // For legacy transactions, try signTransaction then send manually
      // This is more reliable than signAndSendTransaction for some wallet setups
      if (!isVersioned && windowSolana.signTransaction) {
        try {
          console.log('[Wallet] Using signTransaction for legacy tx...');
          const signedTx = await windowSolana.signTransaction(transaction);
          console.log('[Wallet] Transaction signed by Phantom');
          
          // Try sending with skipPreflight to avoid simulation issues
          const signature = await connection.sendRawTransaction(signedTx.serialize(), {
            skipPreflight: true,  // Skip simulation - let the network validate
            preflightCommitment: 'confirmed',
            maxRetries: 3,
          });
          console.log('[Wallet] Sent to network, signature:', signature);
          
          // Wait for confirmation
          const confirmation = await connection.confirmTransaction(signature, 'confirmed');
          if (confirmation.value.err) {
            console.error('[Wallet] Transaction failed on-chain:', confirmation.value.err);
            throw new Error(`Transaction failed on-chain: ${JSON.stringify(confirmation.value.err)}`);
          }
          
          console.log('[Wallet] Transaction confirmed:', signature);
          return signature;
        } catch (e: any) {
          console.error('[Wallet] signTransaction flow error:', e);
          console.error('[Wallet] Error name:', e?.name);
          console.error('[Wallet] Error message:', e?.message);
          console.error('[Wallet] Error code:', e?.code);
          
          // Check if this is an "already processed" error - might mean success!
          if (e?.message?.includes('already been processed') || e?.message?.includes('AlreadyProcessed')) {
            console.log('[Wallet] Transaction may have already succeeded! Check explorer.');
            // Try to extract signature from the error or transaction
            throw new Error('Transaction may have already been processed. Please check your wallet on Solana Explorer.');
          }
          
          // Don't throw yet, try signAndSendTransaction as fallback
        }
      }
      
      // Last resort: try signAndSendTransaction
      if (windowSolana.signAndSendTransaction) {
        try {
          console.log('[Wallet] Last resort: signAndSendTransaction...');
          const result = await windowSolana.signAndSendTransaction(transaction);
          const signature = result?.signature || result;
          console.log('[Wallet] Transaction sent via window.solana:', signature);
          return signature;
        } catch (e: any) {
          console.error('[Wallet] All signing methods failed');
          console.error('[Wallet] Final error:', e?.message);
          throw new Error(e?.message || 'Transaction signing failed');
        }
      }
      
      throw new Error('No compatible signing method found in wallet');
    }

    console.error('[Wallet] No wallet signing method available');
    throw new Error('No wallet available for signing');
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
}
