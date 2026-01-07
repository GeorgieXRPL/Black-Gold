/**
 * @fileoverview Hook for holder verification status
 * Fetches and caches holder verification from the API
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import type { HolderVerification } from '../../server/types';

interface UseHolderVerificationReturn {
  /** Verification result */
  verification: HolderVerification | null;
  /** Whether verification is loading */
  loading: boolean;
  /** Error message if verification failed */
  error: string | null;
  /** Refresh the verification */
  refresh: () => Promise<void>;
}

/**
 * Hook for fetching holder verification status
 * @param walletAddress - The wallet address to verify
 */
export function useHolderVerification(walletAddress: string | null): UseHolderVerificationReturn {
  const [verification, setVerification] = useState<HolderVerification | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchVerification = useCallback(async () => {
    if (!walletAddress) {
      setVerification(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/verify-holder?wallet=${encodeURIComponent(walletAddress)}`);
      
      if (!response.ok) {
        throw new Error(`Verification failed: ${response.status}`);
      }

      const data = await response.json();
      
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

      setVerification(verificationResult);
    } catch (err) {
      console.error('[HolderVerification] Error:', err);
      setError(err instanceof Error ? err.message : 'Verification failed');
      setVerification(null);
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  // Fetch verification when wallet changes
  useEffect(() => {
    fetchVerification();
  }, [fetchVerification]);

  // Auto-refresh every 5 minutes
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
