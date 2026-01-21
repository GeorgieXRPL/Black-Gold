/**
 * @fileoverview Hook for holder verification status
 * Fetches and caches holder verification from the API
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { HolderVerification } from '../../server/types';

interface UseHolderVerificationReturn {
  /** Verification result */
  verification: HolderVerification | null;
  /** Whether verification is loading */
  loading: boolean;
  /** Error message if verification failed */
  error: string | null;
  /** 
   * Refresh the verification
   * @param force - If true, bypasses all caching to get fresh on-chain data
   */
  refresh: (force?: boolean) => Promise<void>;
}

/**
 * Hook for fetching holder verification status
 * @param walletAddress - The wallet address to verify
 */
export function useHolderVerification(walletAddress: string | null): UseHolderVerificationReturn {
  const [verification, setVerification] = useState<HolderVerification | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Track when a force refresh was done to prevent non-force from overwriting
  const lastForceRefreshRef = useRef<number>(0);
  // Track if initial fetch has been done
  const initialFetchDoneRef = useRef<boolean>(false);

  const fetchVerification = useCallback(async (force: boolean = false) => {
    if (!walletAddress) {
      setVerification(null);
      setError(null);
      return;
    }

    // If this is a non-force refresh and a force refresh was done in the last 10 seconds, skip it
    // This prevents stale cached data from overwriting fresh data
    if (!force && lastForceRefreshRef.current > 0) {
      const timeSinceForce = Date.now() - lastForceRefreshRef.current;
      if (timeSinceForce < 10000) {
        console.log(`[HolderVerification] Skipping non-force refresh (force refresh was ${timeSinceForce}ms ago)`);
        return;
      }
    }

    setLoading(true);
    setError(null);

    try {
      // Use force=true to bypass API cache when needed (e.g., after staking/unstaking)
      const forceParam = force ? '&force=true' : '';
      // Add timestamp to prevent any browser caching
      const timestamp = force ? `&_t=${Date.now()}` : '';
      console.log(`[HolderVerification] Fetching balance for ${walletAddress.slice(0,8)}...${force ? ' (force refresh)' : ''}`);
      
      const response = await fetch(
        `/api/verify-holder?wallet=${encodeURIComponent(walletAddress)}${forceParam}${timestamp}`,
        force ? { cache: 'no-store' } : undefined
      );
      
      if (!response.ok) {
        throw new Error(`Verification failed: ${response.status}`);
      }

      const data = await response.json();
      
      console.log(`[HolderVerification] Got balance: ${data.balance?.toLocaleString() ?? 'null'}${force ? ' (from force refresh)' : ''}`);
      
      // Map API response to HolderVerification type
      const verificationResult: HolderVerification = {
        walletAddress: data.walletAddress,
        balance: data.balance,
        percentOfSupply: data.percentOfSupply,
        requiredPercent: data.requiredPercent,
        isEligible: data.isEligible,
        cachedAt: new Date(data.cachedAt),
        marketCap: data.marketCap,
      };

      // Update the force refresh timestamp
      if (force) {
        lastForceRefreshRef.current = Date.now();
      }

      setVerification(verificationResult);
    } catch (err) {
      console.error('[HolderVerification] Error:', err);
      setError(err instanceof Error ? err.message : 'Verification failed');
      setVerification(null);
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  // Initial fetch when wallet connects (only once)
  useEffect(() => {
    if (walletAddress && !initialFetchDoneRef.current) {
      initialFetchDoneRef.current = true;
      fetchVerification();
    } else if (!walletAddress) {
      initialFetchDoneRef.current = false;
    }
  }, [walletAddress, fetchVerification]);

  // Auto-refresh every 5 minutes (only if no recent force refresh)
  useEffect(() => {
    if (!walletAddress) return;

    const interval = setInterval(() => {
      fetchVerification();
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [walletAddress, fetchVerification]);

  return {
    verification,
    loading,
    error,
    refresh: fetchVerification,
  };
}
