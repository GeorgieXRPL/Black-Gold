/**
 * @fileoverview Game WebSocket hook for Black Gold v2
 * Handles connection to the multi-mine game server
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { MineStats, ResourceType } from '../lib/mines';

/** Connection status */
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error' | 'failed';

/** Reconnection configuration */
const RECONNECT_CONFIG = {
  INITIAL_DELAY_MS: 1000,    // Start with 1 second
  MAX_DELAY_MS: 30000,       // Max 30 seconds between retries
  MAX_RETRIES: 10,           // Give up after 10 attempts
  BACKOFF_MULTIPLIER: 2,     // Double delay each time
};

/** Game event types */
export interface GameEvent {
  id: string;
  type: 'raid_started' | 'raid_won' | 'raid_lost' | 'discovery_found' | 'discovery_pending' | 'jackpot' | 'vault_payout' | 'spoils_distributed' | 'round_status' | 'timeout_pending' | 'timeout_winner' | 'rollover_update' | 'best_hash_update' | 'round_restart';
  sourceMine?: string;
  targetMine?: string;
  sourceResource?: ResourceType;
  targetResource?: ResourceType;
  attackers?: string[];
  winner?: string;
  reward?: number;
  finderShare?: number;
  vaultShare?: number;
  discoveryName?: string;
  spoilsAmount?: number;
  burnedAmount?: number;
  timestamp: Date;
  // Discovery pending specific fields
  discoveryNumber?: number;
  mineId?: string;
  resource?: string;
  announceAt?: number;
  countdownSeconds?: number;
  message?: string;
  hash?: string;
  // Timeout system fields
  roundStartTime?: number;
  maxTime?: number | null;
  timeRemaining?: number | null;
  rolloverAmount?: number;
  leaderboard?: Array<{ wallet: string; distance: string; submissions: number }>;
  winnerHash?: string;
  totalReward?: number;
  participantCount?: number;
  shares?: Array<{ walletAddress: string; sharePercent: number; reward: number }>;
  nextRoundIn?: number;
  mineName?: string;
}

/** Raid result from server */
export interface RaidResult {
  expeditionId: string;
  mineId: string;
  attackersWon: boolean;
  stolenRewards: number;
  defensePower: number;
  attackPower: number;
}

/** Global stats from server */
export interface GlobalStats {
  totalMiners: number;
  totalHashrate: number;
  totalStake: number;
  totalDiscoveries: number;
  mineStats: MineStats[];
  activeExpeditions: number;
  activeRaids: number;
}

/** Work unit from server */
export interface WorkUnit {
  id: string;
  discoveryHeader: string;
  target: string;
  nonceStart: number;
  nonceEnd: number;
  timestamp: number;
  discoveryNumber: number;
  mineId: string;
}

/** Hook options */
interface UseGameSocketOptions {
  url: string;
  walletAddress: string | null;
  cores?: number;
  isMining?: boolean;  // Pass current mining state for reconnect logic
  onEvent?: (event: GameEvent) => void;
  onRaidResult?: (result: RaidResult) => void;
  onWork?: (work: WorkUnit) => void;
  onHomeMineRestored?: (mineId: string) => void;
}

/** Hook return type */
interface UseGameSocketReturn {
  status: ConnectionStatus;
  globalStats: GlobalStats | null;
  mineStats: Map<string, MineStats>;
  currentMineId: string | null;
  connectionError: string | null;
  retryCount: number;
  connect: () => void;
  disconnect: () => void;
  reconnect: () => void;  // Manual reconnect (resets backoff)
  joinMine: (mineId: string) => void;
  leaveMine: () => void;
  setHomeBase: (mineId: string) => void;
  stake: (mineId: string, amount: number) => void;
  unstake: (mineId: string, amount: number) => void;
  startExpedition: (targetMineId: string, betAmount?: number) => void;
  rallyDefense: (mineId: string, tokenCost: number) => void;
  sendHashrate: (hashrate: number) => void;
  submitProof: (workUnitId: string, nonce: number, hash: string) => void;
  requestWork: () => void;  // Explicitly request new work from server
}

export function useGameSocket({
  url,
  walletAddress,
  cores = 1,
  isMining = false,
  onEvent,
  onRaidResult,
  onWork,
  onHomeMineRestored,
}: UseGameSocketOptions): UseGameSocketReturn {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [globalStats, setGlobalStats] = useState<GlobalStats | null>(null);
  const [mineStats, setMineStats] = useState<Map<string, MineStats>>(new Map());
  const [currentMineId, setCurrentMineId] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentMineIdRef = useRef<string | null>(null);
  const isMiningRef = useRef<boolean>(isMining);
  const reconnectDelayRef = useRef<number>(RECONNECT_CONFIG.INITIAL_DELAY_MS);
  const retryCountRef = useRef<number>(0);
  
  // Keep isMiningRef in sync with prop
  useEffect(() => {
    isMiningRef.current = isMining;
  }, [isMining]);

  // Reset backoff on successful connection or manual reconnect
  const resetBackoff = useCallback(() => {
    reconnectDelayRef.current = RECONNECT_CONFIG.INITIAL_DELAY_MS;
    retryCountRef.current = 0;
    setRetryCount(0);
    setConnectionError(null);
  }, []);

  const send = useCallback((type: string, payload: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type,
        payload,
        timestamp: Date.now(),
      }));
    }
  }, []);

  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);
      
      // Log all non-stats messages for debugging
      if (data.type !== 'stats' && data.type !== 'round_status') {
        console.log('[WS] 📩 Message received:', data.type, data.payload?.mineId || '');
      }
      
      switch (data.type) {
        case 'stats':
          setGlobalStats(data.payload);
          if (data.payload.mineStats) {
            const newStats = new Map<string, MineStats>();
            data.payload.mineStats.forEach((s: MineStats) => {
              newStats.set(s.mineId, s);
            });
            setMineStats(newStats);
          }
          break;

        case 'result':
          // Handle result messages (confirmations)
          console.log('[WS] Result:', data.payload);
          // Check if this is a connect result with restored home mine
          if (data.payload?.homeMineId) {
            console.log('[WS] 🏠 Home mine restored from server:', data.payload.homeMineId);
            
            // Update currentMineIdRef for future reconnections
            currentMineIdRef.current = data.payload.homeMineId;
            setCurrentMineId(data.payload.homeMineId);
            
            // Send join_mine as belt-and-suspenders (server may have already auto-joined)
            // This ensures the client state is in sync and work will be assigned
            console.log('[WS] 📍 Sending join_mine to ensure registration...');
            send('join_mine', { mineId: data.payload.homeMineId });
            
            // Notify the callback
            if (onHomeMineRestored) {
              onHomeMineRestored(data.payload.homeMineId);
            }
          }
          break;

        case 'work':
          // Work assignment from pool
          console.log('[WS] 📦 Work assignment received:', {
            id: data.payload?.id,
            mineId: data.payload?.mineId,
            discoveryNumber: data.payload?.discoveryNumber,
          });
          if (onWork) {
            console.log('[WS] 📦 Calling onWork callback...');
            onWork(data.payload as WorkUnit);
          } else {
            console.warn('[WS] ⚠️ Work received but onWork is null!');
          }
          break;

        case 'discovery_pending':
          // A discovery was found but winner not yet revealed (30s countdown)
          console.log('[WS] Discovery pending:', data.payload);
          if (onEvent) {
            onEvent({
              id: Date.now().toString(),
              type: 'discovery_pending',
              ...data.payload,
              timestamp: new Date(),
            });
          }
          break;

        case 'discovery_found':
          console.log('[WS] 🎉 discovery_found received, calling onEvent...');
          if (onEvent) {
            const eventData = {
              id: Date.now().toString(),
              type: 'discovery_found' as const,
              ...data.payload,
              targetMine: data.payload.mineName,
              targetResource: data.payload.resource,
              winner: data.payload.winner,
              reward: data.payload.totalReward,
              finderShare: data.payload.finderShare,
              vaultShare: data.payload.vaultShare,
              discoveryName: data.payload.discoveryName,
              timestamp: new Date(),
            };
            console.log('[WS] 🎉 Calling onEvent with:', eventData);
            onEvent(eventData);
          } else {
            console.warn('[WS] ⚠️ discovery_found received but onEvent is null!');
          }
          break;

        case 'vault_distribution':
          if (onEvent) {
            onEvent({
              id: Date.now().toString(),
              type: 'vault_payout',
              targetMine: data.payload.mineName,
              reward: data.payload.totalDistributed,
              timestamp: new Date(),
            });
          }
          break;

        case 'spoils_distribution':
          if (onEvent) {
            onEvent({
              id: Date.now().toString(),
              type: 'spoils_distributed',
              targetMine: data.payload.mineName,
              spoilsAmount: data.payload.spoilsAmount,
              burnedAmount: data.payload.burnedAmount,
              timestamp: new Date(),
            });
          }
          break;

        case 'game_event':
          if (onEvent) {
            onEvent({
              id: Date.now().toString(),
              ...data.payload,
              timestamp: new Date(),
            });
          }
          break;

        case 'round_status':
          // Round status update for timeout system
          if (onEvent) {
            onEvent({
              id: `round_status_${Date.now()}`,
              type: 'round_status',
              ...data.payload,
              timestamp: new Date(),
            });
          }
          break;

        case 'timeout_pending':
          // Timeout pending - show 30s countdown overlay (like discovery_pending)
          console.log('[WS] ⏱️ Timeout pending:', data.payload);
          if (onEvent) {
            onEvent({
              id: `timeout_pending_${Date.now()}`,
              type: 'timeout_pending',
              ...data.payload,
              timestamp: new Date(),
            });
          }
          break;

        case 'timeout_winner':
          // Timeout winner announcement (after countdown)
          console.log('[WS] 🏆 Timeout winner:', data.payload);
          if (onEvent) {
            onEvent({
              id: `timeout_${Date.now()}`,
              type: 'timeout_winner',
              ...data.payload,
              targetMine: data.payload.mineName,
              targetResource: data.payload.resource,
              winner: data.payload.winner,
              timestamp: new Date(),
            });
          }
          break;

        case 'round_restart':
          // Round is restarting after discovery/timeout
          console.log('[WS] Round restart:', data.payload);
          if (onEvent) {
            onEvent({
              id: `round_restart_${Date.now()}`,
              type: 'round_restart',
              ...data.payload,
              timestamp: new Date(),
            });
          }
          break;

        case 'raid_result':
          if (onRaidResult) {
            onRaidResult(data.payload);
          }
          break;

        case 'error':
          console.error('[WS] Error:', data.payload);
          break;
      }
    } catch (err) {
      console.error('[WS] Failed to parse message:', err);
    }
  }, [onEvent, onRaidResult, onWork]);

  const connect = useCallback(() => {
    if (!walletAddress) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    if (wsRef.current?.readyState === WebSocket.CONNECTING) return;

    // Check if we've exceeded max retries
    if (retryCountRef.current >= RECONNECT_CONFIG.MAX_RETRIES) {
      console.error('[WS] ❌ Max reconnection attempts reached. Giving up.');
      setStatus('failed');
      setConnectionError('Unable to connect to game server after multiple attempts. Please check your connection and try again.');
      return;
    }

    setStatus('connecting');
    setConnectionError(null);

    try {
      console.log(`[WS] 🔌 Connecting... (attempt ${retryCountRef.current + 1}/${RECONNECT_CONFIG.MAX_RETRIES})`);
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus('connected');
        // Reset backoff on successful connection
        resetBackoff();
        
        console.log('[WS] 🔌 WebSocket OPEN - sending connect message');
        console.log('[WS] 🔌 State at connect:', {
          walletAddress: walletAddress?.slice(0, 8),
          cores,
          currentMineIdRef: currentMineIdRef.current,
          isMiningRef: isMiningRef.current,
        });
        
        // Send connect message
        send('connect', { walletAddress, cores });
        
        // Re-join previous mine after reconnection (belt-and-suspenders with server auto-join)
        if (currentMineIdRef.current) {
          console.log('[WS] 📍 Reconnecting - will re-join mine:', currentMineIdRef.current);
          setTimeout(() => {
            console.log('[WS] 📍 Sending join_mine for:', currentMineIdRef.current);
            send('join_mine', { mineId: currentMineIdRef.current });
            
            // If we were mining, explicitly request new work
            // This ensures mining continues after reconnection
            if (isMiningRef.current) {
              console.log('[WS] ⛏️ Was mining, requesting work after reconnect...');
              setTimeout(() => {
                send('request_work', {});
              }, 100); // Wait for join_mine to be processed
            }
          }, 100); // Small delay to ensure connect is processed first
        } else {
          console.log('[WS] ⚠️ No currentMineIdRef - waiting for server to restore home mine');
        }
      };

      ws.onmessage = handleMessage;

      ws.onclose = (event) => {
        setStatus('disconnected');
        wsRef.current = null;
        
        // Don't auto-reconnect if closed intentionally (code 1000) or we've given up
        if (event.code === 1000 || retryCountRef.current >= RECONNECT_CONFIG.MAX_RETRIES) {
          console.log('[WS] Connection closed intentionally or max retries reached');
          return;
        }
        
        // Increment retry count
        retryCountRef.current += 1;
        setRetryCount(retryCountRef.current);
        
        // Calculate delay with exponential backoff
        const delay = Math.min(
          reconnectDelayRef.current,
          RECONNECT_CONFIG.MAX_DELAY_MS
        );
        
        console.log(`[WS] 🔄 Reconnecting in ${delay / 1000}s (attempt ${retryCountRef.current}/${RECONNECT_CONFIG.MAX_RETRIES})`);
        
        // Double delay for next attempt
        reconnectDelayRef.current = Math.min(
          reconnectDelayRef.current * RECONNECT_CONFIG.BACKOFF_MULTIPLIER,
          RECONNECT_CONFIG.MAX_DELAY_MS
        );
        
        // Schedule reconnection
        reconnectTimeoutRef.current = setTimeout(() => {
          if (walletAddress) {
            connect();
          }
        }, delay);
      };

      ws.onerror = (err) => {
        console.error('[WS] Connection error:', err);
        setStatus('error');
        setConnectionError('Connection error. Will retry automatically.');
      };
    } catch (err) {
      console.error('[WS] Connection error:', err);
      setStatus('error');
      setConnectionError(err instanceof Error ? err.message : 'Unknown connection error');
    }
  }, [url, walletAddress, cores, send, handleMessage, resetBackoff]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close(1000, 'User disconnected'); // Code 1000 prevents auto-reconnect
      wsRef.current = null;
    }
    setStatus('disconnected');
    resetBackoff();
  }, [resetBackoff]);

  // Manual reconnect - resets backoff and tries again
  const reconnect = useCallback(() => {
    console.log('[WS] 🔄 Manual reconnect triggered - resetting backoff');
    resetBackoff();
    disconnect();
    // Small delay to ensure cleanup completes
    setTimeout(() => {
      connect();
    }, 100);
  }, [resetBackoff, disconnect, connect]);

  const joinMine = useCallback((mineId: string) => {
    console.log('[WS] 📍 joinMine called:', mineId, {
      previousMineId: currentMineIdRef.current,
      wsState: wsRef.current?.readyState,
    });
    send('join_mine', { mineId });
    setCurrentMineId(mineId);
    currentMineIdRef.current = mineId; // Track for reconnection
  }, [send]);

  const leaveMine = useCallback(() => {
    send('leave_mine', {});
    setCurrentMineId(null);
    currentMineIdRef.current = null; // Clear for reconnection
  }, [send]);

  const setHomeBase = useCallback((mineId: string) => {
    send('set_home', { mineId });
  }, [send]);

  const stake = useCallback((mineId: string, amount: number) => {
    send('stake', { mineId, amount });
  }, [send]);

  const unstake = useCallback((mineId: string, amount: number) => {
    send('unstake', { mineId, amount });
  }, [send]);

  const startExpedition = useCallback((targetMineId: string, betAmount?: number) => {
    send('start_expedition', { targetMineId, betAmount: betAmount || 0 });
  }, [send]);

  const rallyDefense = useCallback((mineId: string, tokenCost: number) => {
    send('rally_defense', { mineId, tokenCost });
  }, [send]);

  const sendHashrate = useCallback((hashrate: number) => {
    if (walletAddress) {
      send('hashrate', { walletAddress, hashrate });
    }
  }, [send, walletAddress]);

  const submitProof = useCallback((workUnitId: string, nonce: number, hash: string) => {
    if (walletAddress) {
      send('submit', { workUnitId, nonce, hash });
    }
  }, [send, walletAddress]);

  const requestWork = useCallback(() => {
    if (currentMineIdRef.current) {
      console.log('[Game] Requesting work from server...');
      send('request_work', {});
    }
  }, [send]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    status,
    globalStats,
    mineStats,
    currentMineId,
    connectionError,
    retryCount,
    connect,
    disconnect,
    reconnect,
    joinMine,
    leaveMine,
    setHomeBase,
    stake,
    unstake,
    startExpedition,
    rallyDefense,
    sendHashrate,
    submitProof,
    requestWork,
  };
}
