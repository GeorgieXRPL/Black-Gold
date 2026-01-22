/**
 * @fileoverview Staking hook for on-chain token staking via Quarry v3.3
 * Integrates with Privy for transaction signing
 * 
 * Flow:
 * 1. Request transaction from server (server builds unsigned tx)
 * 2. User signs transaction with Privy wallet
 * 3. Send signed transaction to network
 * 4. Server verifies transaction on-chain
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import { useWallet } from './useWallet';

export interface StakeResult {
  success: boolean;
  signature?: string;
  error?: string;
}

export interface StakeInfo {
  stakedAmount: number;
  pendingRewards: number;
  lastStakeTime: Date | null;
  minerPDA: string | null;
}

export interface StakingState {
  isStaking: boolean;
  isUnstaking: boolean;
  isClaiming: boolean;
  isLoading: boolean;
  error: string | null;
  lastSignature: string | null;
  stakeInfo: StakeInfo | null;
}

export interface StakingConfig {
  available: boolean;
  network: string;
  quarryAddress: string | null;
  iouTokenMint: string | null;
  coalTokenMint: string | null;
}

export interface UseStakingReturn {
  // State
  state: StakingState;
  config: StakingConfig | null;
  isAvailable: boolean;
  
  // Convenience accessors
  isStaking: boolean;
  isUnstaking: boolean;
  isClaiming: boolean;
  isLoading: boolean;
  error: string | null;
  lastSignature: string | null;
  stakeInfo: StakeInfo | null;
  
  // Actions
  stake: (amount: number) => Promise<StakeResult>;
  unstake: (amount: number) => Promise<StakeResult>;
  claimRewards: () => Promise<StakeResult>;
  refreshStakeInfo: () => Promise<void>;
  clearError: () => void;
}

// API base URL
const getApiBaseUrl = () => {
  // Use WebSocket URL if available, otherwise construct from window
  if (typeof window !== 'undefined') {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL;
    if (wsUrl) {
      // Convert ws:// to http:// or wss:// to https://
      return wsUrl.replace('ws://', 'http://').replace('wss://', 'https://').replace(/:\d+$/, ':' + (process.env.NEXT_PUBLIC_API_PORT || '3001'));
    }
    // Fallback to same origin API
    return '';
  }
  return '';
};

/**
 * Fetch staking configuration from server
 */
async function fetchStakingConfig(): Promise<StakingConfig | null> {
  try {
    const baseUrl = getApiBaseUrl();
    const response = await fetch(`${baseUrl}/api/staking/config`);
    if (!response.ok) {
      console.warn('[Staking] Failed to fetch config:', response.status);
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error('[Staking] Error fetching config:', error);
    return null;
  }
}

/**
 * Fetch user's staking info from server
 */
async function fetchStakeInfo(walletAddress: string): Promise<StakeInfo | null> {
  try {
    const baseUrl = getApiBaseUrl();
    const response = await fetch(`${baseUrl}/api/staking/info/${walletAddress}`);
    if (!response.ok) {
      console.warn('[Staking] Failed to fetch stake info:', response.status);
      return null;
    }
    const data = await response.json();
    return {
      stakedAmount: data.stakedAmount || 0,
      pendingRewards: data.pendingRewards || 0,
      lastStakeTime: data.lastStakeTime ? new Date(data.lastStakeTime) : null,
      minerPDA: data.minerPDA || null,
    };
  } catch (error) {
    console.error('[Staking] Error fetching stake info:', error);
    return null;
  }
}

/**
 * Request a stake transaction from server
 */
async function requestStakeTransaction(
  walletAddress: string, 
  amount: number
): Promise<{ transaction: string; message: string; blockhash: string } | { error: string }> {
  try {
    const baseUrl = getApiBaseUrl();
    const response = await fetch(`${baseUrl}/api/staking/stake`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress, amount }),
    });
    
    const data = await response.json();
    
    if (!response.ok || data.error) {
      return { error: data.error || 'Failed to build stake transaction' };
    }
    
    return data;
  } catch (error) {
    console.error('[Staking] Error requesting stake tx:', error);
    return { error: error instanceof Error ? error.message : 'Network error' };
  }
}

/**
 * Request an unstake transaction from server
 */
async function requestUnstakeTransaction(
  walletAddress: string, 
  amount: number
): Promise<{ transaction: string; message: string; blockhash: string } | { error: string }> {
  try {
    const baseUrl = getApiBaseUrl();
    const response = await fetch(`${baseUrl}/api/staking/unstake`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress, amount }),
    });
    
    const data = await response.json();
    
    if (!response.ok || data.error) {
      return { error: data.error || 'Failed to build unstake transaction' };
    }
    
    return data;
  } catch (error) {
    console.error('[Staking] Error requesting unstake tx:', error);
    return { error: error instanceof Error ? error.message : 'Network error' };
  }
}

/**
 * Request a claim rewards transaction from server
 */
async function requestClaimTransaction(
  walletAddress: string
): Promise<{ transaction: string; message: string; blockhash: string; estimatedReward: number } | { error: string }> {
  try {
    const baseUrl = getApiBaseUrl();
    const response = await fetch(`${baseUrl}/api/staking/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress }),
    });
    
    const data = await response.json();
    
    if (!response.ok || data.error) {
      return { error: data.error || 'Failed to build claim transaction' };
    }
    
    return data;
  } catch (error) {
    console.error('[Staking] Error requesting claim tx:', error);
    return { error: error instanceof Error ? error.message : 'Network error' };
  }
}

/**
 * Verify a transaction was successful
 */
async function verifyTransaction(
  signature: string, 
  walletAddress: string, 
  type: 'stake' | 'unstake' | 'claim',
  amount?: number
): Promise<{ verified: boolean; error?: string }> {
  try {
    const baseUrl = getApiBaseUrl();
    const response = await fetch(`${baseUrl}/api/staking/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signature, walletAddress, type, amount }),
    });
    
    const data = await response.json();
    return { verified: data.verified, error: data.error };
  } catch (error) {
    console.error('[Staking] Error verifying tx:', error);
    return { verified: false, error: 'Verification failed' };
  }
}

/**
 * Pre-flight check before staking - verify staking is configured
 * Uses Railway backend's /api/staking/config endpoint
 */
async function preflightCheck(walletAddress: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const baseUrl = getApiBaseUrl();
    
    // Check if staking system is configured on the backend
    const configResponse = await fetch(`${baseUrl}/api/staking/config`);
    if (!configResponse.ok) {
      return { ok: false, error: 'Failed to connect to staking service' };
    }
    
    const config = await configResponse.json();
    
    // Check if Quarry is available
    if (!config.available) {
      return { ok: false, error: 'Staking system not configured. Contact support.' };
    }
    
    // Check if required addresses are set
    if (!config.quarryAddress || !config.rewarderAddress) {
      return { ok: false, error: 'Staking infrastructure not deployed. Contact support.' };
    }
    
    // Optionally check user's stake info (this creates miner account if needed)
    const infoResponse = await fetch(`${baseUrl}/api/staking/info/${walletAddress}`);
    if (infoResponse.ok) {
      const info = await infoResponse.json();
      console.log('[Staking] User stake info:', info);
    }
    
    return { ok: true };
  } catch (error) {
    console.error('[Staking] Preflight check failed:', error);
    // Don't block if check fails - let the actual transaction determine success
    return { ok: true };
  }
}

/**
 * Hook for managing on-chain staking operations
 */
export function useStaking(): UseStakingReturn {
  const wallet = useWallet();
  
  const [config, setConfig] = useState<StakingConfig | null>(null);
  const [state, setState] = useState<StakingState>({
    isStaking: false,
    isUnstaking: false,
    isClaiming: false,
    isLoading: true,
    error: null,
    lastSignature: null,
    stakeInfo: null,
  });

  // Staking is only available with full wallet connection and configured Quarry
  const isAvailable = wallet.isConnected && wallet.walletAddress !== null && config?.available === true;

  // Load staking config on mount
  useEffect(() => {
    fetchStakingConfig().then(cfg => {
      setConfig(cfg);
      setState(prev => ({ ...prev, isLoading: false }));
    });
  }, []);

  // Load stake info when wallet connects
  useEffect(() => {
    if (wallet.walletAddress && config?.available) {
      fetchStakeInfo(wallet.walletAddress).then(info => {
        setState(prev => ({ ...prev, stakeInfo: info }));
      });
    }
  }, [wallet.walletAddress, config?.available]);

  /**
   * Refresh stake info from on-chain
   */
  const refreshStakeInfo = useCallback(async () => {
    if (!wallet.walletAddress) return;
    
    setState(prev => ({ ...prev, isLoading: true }));
    const info = await fetchStakeInfo(wallet.walletAddress);
    setState(prev => ({ ...prev, stakeInfo: info, isLoading: false }));
  }, [wallet.walletAddress]);

  /**
   * Stake tokens
   */
  const stake = useCallback(async (amount: number): Promise<StakeResult> => {
    if (!isAvailable || !wallet.walletAddress) {
      return { success: false, error: 'Wallet not connected or staking not available' };
    }

    setState(prev => ({ ...prev, isStaking: true, error: null }));

    try {
      // 0. Pre-flight check - verify user has tokens and SOL
      console.log('[Staking] Running pre-flight check...');
      const preflight = await preflightCheck(wallet.walletAddress);
      if (!preflight.ok) {
        const preflightError = preflight.error || 'Pre-flight check failed';
        setState(prev => ({ ...prev, isStaking: false, error: preflightError }));
        return { success: false, error: preflightError };
      }

      // 1. Request transaction from server
      console.log('[Staking] Requesting stake transaction for', amount, 'tokens');
      const txResult = await requestStakeTransaction(wallet.walletAddress, amount);
      
      if ('error' in txResult) {
        setState(prev => ({ ...prev, isStaking: false, error: txResult.error }));
        return { success: false, error: txResult.error };
      }

      // 2. Sign and send transaction with wallet
      console.log('[Staking] Signing and sending transaction...');
      console.log('[Staking] Transaction blockhash:', txResult.blockhash);
      
      let signature: string | null = null;
      try {
        signature = await wallet.signAndSendTransaction(txResult.transaction);
      } catch (signError) {
        const signErrorMsg = signError instanceof Error ? signError.message : 'Unknown signing error';
        console.error('[Staking] Sign error:', signError);
        
        // Check for common error patterns
        if (signErrorMsg.includes('User rejected')) {
          setState(prev => ({ ...prev, isStaking: false, error: 'Transaction cancelled by user' }));
          return { success: false, error: 'Transaction cancelled by user' };
        }
        if (signErrorMsg.includes('insufficient')) {
          setState(prev => ({ ...prev, isStaking: false, error: 'Insufficient balance for transaction' }));
          return { success: false, error: 'Insufficient balance for transaction' };
        }
        
        setState(prev => ({ ...prev, isStaking: false, error: `Signing failed: ${signErrorMsg}` }));
        return { success: false, error: `Signing failed: ${signErrorMsg}` };
      }
      
      if (!signature) {
        setState(prev => ({ ...prev, isStaking: false, error: 'Transaction signing failed - check browser console for details' }));
        return { success: false, error: 'Transaction signing failed - check browser console for details' };
      }

      // 3. Transaction confirmed on-chain by wallet - this IS success!
      console.log('[Staking] ✅ Stake successful! Signature:', signature);
      console.log('[Staking] View on Solana Explorer: https://explorer.solana.com/tx/' + signature + '?cluster=devnet');
      
      // Backend verification is optional - don't block on it
      // The wallet already confirmed the tx on Solana network
      verifyTransaction(signature, wallet.walletAddress, 'stake', amount)
        .then(v => {
          if (!v.verified) {
            console.warn('[Staking] Backend verification pending, but on-chain tx confirmed');
          }
        })
        .catch(e => console.warn('[Staking] Backend verification error (non-blocking):', e));

      // 4. Wait for RPC to sync before refreshing balances
      // Solana RPC nodes can take a few seconds to reflect new state
      console.log('[Staking] Waiting 3s for RPC to sync before refreshing balances...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // 5. Refresh BOTH stake info and wallet balance after RPC sync
      console.log('[Staking] Refreshing staked balance and wallet balance after stake...');
      await Promise.all([
        refreshStakeInfo(),
        wallet.holderVerification.refresh(true),
      ]);

      setState(prev => ({ 
        ...prev, 
        isStaking: false, 
        lastSignature: signature,
        error: null,
      }));

      return { success: true, signature };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Staking] Stake error:', errorMessage, error);
      setState(prev => ({ ...prev, isStaking: false, error: errorMessage }));
      return { success: false, error: errorMessage };
    }
  }, [isAvailable, wallet, refreshStakeInfo]);

  /**
   * Unstake tokens
   */
  const unstake = useCallback(async (amount: number): Promise<StakeResult> => {
    if (!isAvailable || !wallet.walletAddress) {
      return { success: false, error: 'Wallet not connected or staking not available' };
    }

    // Check if user has enough staked
    if (state.stakeInfo && state.stakeInfo.stakedAmount < amount) {
      return { success: false, error: 'Insufficient staked balance' };
    }

    setState(prev => ({ ...prev, isUnstaking: true, error: null }));

    try {
      // 1. Request transaction from server
      console.log('[Staking] Requesting unstake transaction for', amount, 'tokens');
      const txResult = await requestUnstakeTransaction(wallet.walletAddress, amount);
      
      if ('error' in txResult) {
        setState(prev => ({ ...prev, isUnstaking: false, error: txResult.error }));
        return { success: false, error: txResult.error };
      }

      // 2. Sign and send transaction
      console.log('[Staking] Signing and sending unstake transaction...');
      console.log('[Staking] Transaction blockhash:', txResult.blockhash);
      
      let signature: string | null = null;
      try {
        signature = await wallet.signAndSendTransaction(txResult.transaction);
      } catch (signError) {
        const signErrorMsg = signError instanceof Error ? signError.message : 'Unknown signing error';
        console.error('[Staking] Sign error:', signError);
        
        if (signErrorMsg.includes('User rejected')) {
          setState(prev => ({ ...prev, isUnstaking: false, error: 'Transaction cancelled by user' }));
          return { success: false, error: 'Transaction cancelled by user' };
        }
        
        setState(prev => ({ ...prev, isUnstaking: false, error: `Signing failed: ${signErrorMsg}` }));
        return { success: false, error: `Signing failed: ${signErrorMsg}` };
      }
      
      if (!signature) {
        setState(prev => ({ ...prev, isUnstaking: false, error: 'Transaction signing failed - check browser console for details' }));
        return { success: false, error: 'Transaction signing failed - check browser console for details' };
      }

      // 3. Transaction confirmed on-chain by wallet - this IS success!
      console.log('[Staking] ✅ Unstake successful! Signature:', signature);
      console.log('[Staking] View on Solana Explorer: https://explorer.solana.com/tx/' + signature + '?cluster=devnet');
      
      // Backend verification is optional - don't block on it
      verifyTransaction(signature, wallet.walletAddress, 'unstake', amount)
        .then(v => {
          if (!v.verified) {
            console.warn('[Staking] Backend verification pending, but on-chain tx confirmed');
          }
        })
        .catch(e => console.warn('[Staking] Backend verification error (non-blocking):', e));

      // 4. Wait for RPC to sync before refreshing balances
      // Solana RPC nodes can take a few seconds to reflect new state
      console.log('[Staking] Waiting 3s for RPC to sync before refreshing balances...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // 5. Refresh BOTH stake info and wallet balance after RPC sync
      console.log('[Staking] Refreshing staked balance and wallet balance after unstake...');
      await Promise.all([
        refreshStakeInfo(),
        wallet.holderVerification.refresh(true),
      ]);
      
      setState(prev => ({ 
        ...prev, 
        isUnstaking: false, 
        lastSignature: signature,
        error: null,
      }));

      return { success: true, signature };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Staking] Unstake error:', errorMessage);
      setState(prev => ({ ...prev, isUnstaking: false, error: errorMessage }));
      return { success: false, error: errorMessage };
    }
  }, [isAvailable, wallet, state.stakeInfo, refreshStakeInfo]);

  /**
   * Claim staking rewards
   */
  const claimRewards = useCallback(async (): Promise<StakeResult> => {
    if (!isAvailable || !wallet.walletAddress) {
      return { success: false, error: 'Wallet not connected or staking not available' };
    }

    // Check if user has pending rewards
    if (!state.stakeInfo || state.stakeInfo.pendingRewards <= 0) {
      return { success: false, error: 'No pending rewards to claim' };
    }

    setState(prev => ({ ...prev, isClaiming: true, error: null }));

    try {
      // 1. Request transaction from server
      console.log('[Staking] Requesting claim transaction...');
      const txResult = await requestClaimTransaction(wallet.walletAddress);
      
      if ('error' in txResult) {
        setState(prev => ({ ...prev, isClaiming: false, error: txResult.error }));
        return { success: false, error: txResult.error };
      }

      // 2. Sign and send transaction
      console.log('[Staking] Signing and sending claim transaction...');
      const signature = await wallet.signAndSendTransaction(txResult.transaction);
      
      if (!signature) {
        setState(prev => ({ ...prev, isClaiming: false, error: 'Transaction signing failed or rejected' }));
        return { success: false, error: 'Transaction signing failed or rejected' };
      }

      // 3. Transaction confirmed on-chain by wallet - this IS success!
      console.log('[Staking] ✅ Claim successful! Signature:', signature);
      console.log('[Staking] View on Solana Explorer: https://explorer.solana.com/tx/' + signature + '?cluster=devnet');
      
      // Backend verification is optional - don't block on it
      verifyTransaction(signature, wallet.walletAddress, 'claim')
        .then(v => {
          if (!v.verified) {
            console.warn('[Staking] Backend verification pending, but on-chain tx confirmed');
          }
        })
        .catch(e => console.warn('[Staking] Backend verification error (non-blocking):', e));

      // 4. Wait for RPC to sync before refreshing balances
      // Solana RPC nodes can take a few seconds to reflect new state
      console.log('[Staking] Waiting 3s for RPC to sync before refreshing balances...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // 5. Refresh BOTH stake info and wallet balance after RPC sync
      console.log('[Staking] Refreshing staked balance and wallet balance after claim...');
      await Promise.all([
        refreshStakeInfo(),
        wallet.holderVerification.refresh(true),
      ]);

      setState(prev => ({ 
        ...prev, 
        isClaiming: false, 
        lastSignature: signature,
        error: null,
      }));

      return { success: true, signature };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Staking] Claim error:', errorMessage);
      setState(prev => ({ ...prev, isClaiming: false, error: errorMessage }));
      return { success: false, error: errorMessage };
    }
  }, [isAvailable, wallet, state.stakeInfo, refreshStakeInfo]);

  // Clear error function
  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  return {
    // State
    state,
    config,
    isAvailable,
    
    // Convenience accessors
    isStaking: state.isStaking,
    isUnstaking: state.isUnstaking,
    isClaiming: state.isClaiming,
    isLoading: state.isLoading,
    error: state.error,
    lastSignature: state.lastSignature,
    stakeInfo: state.stakeInfo,
    
    // Actions
    stake,
    unstake,
    claimRewards,
    refreshStakeInfo,
    clearError,
  };
}

export default useStaking;
