/**
 * @fileoverview Staking hook for on-chain token staking via Quarry
 * Integrates with Privy for transaction signing
 */

'use client';

import { useState, useCallback } from 'react';
import { useWallet } from './useWallet';

export interface StakeResult {
  success: boolean;
  signature?: string;
  error?: string;
}

export interface StakingState {
  isStaking: boolean;
  isUnstaking: boolean;
  error: string | null;
  lastSignature: string | null;
}

export interface UseStakingReturn {
  state: StakingState;
  stake: (mineId: string, amount: number) => Promise<StakeResult>;
  unstake: (mineId: string, amount: number) => Promise<StakeResult>;
  isAvailable: boolean;
}

/**
 * Hook for managing on-chain staking operations
 */
export function useStaking(): UseStakingReturn {
  const wallet = useWallet();
  
  const [state, setState] = useState<StakingState>({
    isStaking: false,
    isUnstaking: false,
    error: null,
    lastSignature: null,
  });

  // Staking is only available with full wallet connection
  const isAvailable = wallet.isConnected && wallet.walletAddress !== null;

  /**
   * Stake tokens at a mine
   */
  const stake = useCallback(async (mineId: string, amount: number): Promise<StakeResult> => {
    if (!isAvailable || !wallet.walletAddress) {
      return { success: false, error: 'Wallet not connected' };
    }

    setState(prev => ({ ...prev, isStaking: true, error: null }));

    try {
      // 1. Create stake message for signing
      const timestamp = Date.now();
      const message = `Stake ${amount} COAL at mine ${mineId}\nTimestamp: ${timestamp}`;
      
      // 2. Sign the message with Privy
      const signature = await wallet.signMessage(message);
      
      if (!signature) {
        setState(prev => ({ ...prev, isStaking: false, error: 'Signature rejected' }));
        return { success: false, error: 'User rejected signature' };
      }

      // 3. Send stake request to server (server will verify signature)
      // For now, we'll simulate the server call
      console.log('[Staking] Stake request:', {
        wallet: wallet.walletAddress,
        mineId,
        amount,
        signature: signature.slice(0, 20) + '...',
        timestamp,
      });

      // In production, this would be an API call:
      // const response = await fetch('/api/stake', {
      //   method: 'POST',
      //   body: JSON.stringify({ mineId, amount, signature, timestamp }),
      // });

      setState(prev => ({ 
        ...prev, 
        isStaking: false, 
        lastSignature: signature,
        error: null,
      }));

      return { success: true, signature };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setState(prev => ({ ...prev, isStaking: false, error: errorMessage }));
      return { success: false, error: errorMessage };
    }
  }, [isAvailable, wallet]);

  /**
   * Unstake tokens from a mine
   */
  const unstake = useCallback(async (mineId: string, amount: number): Promise<StakeResult> => {
    if (!isAvailable || !wallet.walletAddress) {
      return { success: false, error: 'Wallet not connected' };
    }

    setState(prev => ({ ...prev, isUnstaking: true, error: null }));

    try {
      // 1. Create unstake message for signing
      const timestamp = Date.now();
      const message = `Unstake ${amount} COAL from mine ${mineId}\nTimestamp: ${timestamp}`;
      
      // 2. Sign the message with Privy
      const signature = await wallet.signMessage(message);
      
      if (!signature) {
        setState(prev => ({ ...prev, isUnstaking: false, error: 'Signature rejected' }));
        return { success: false, error: 'User rejected signature' };
      }

      // 3. Send unstake request to server
      console.log('[Staking] Unstake request:', {
        wallet: wallet.walletAddress,
        mineId,
        amount,
        signature: signature.slice(0, 20) + '...',
        timestamp,
      });

      setState(prev => ({ 
        ...prev, 
        isUnstaking: false, 
        lastSignature: signature,
        error: null,
      }));

      return { success: true, signature };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setState(prev => ({ ...prev, isUnstaking: false, error: errorMessage }));
      return { success: false, error: errorMessage };
    }
  }, [isAvailable, wallet]);

  return {
    state,
    stake,
    unstake,
    isAvailable,
  };
}

export default useStaking;
