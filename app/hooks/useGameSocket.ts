/**
 * @fileoverview Game WebSocket hook for Black Gold v2
 * Handles connection to the multi-mine game server
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { MineStats, ResourceType } from '../lib/mines';

/** Connection status */
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

/** Game event types */
export interface GameEvent {
  id: string;
  type: 'raid_started' | 'raid_won' | 'raid_lost' | 'discovery_found' | 'discovery_pending' | 'jackpot' | 'vault_payout' | 'spoils_distributed' | 'round_status' | 'timeout_winner' | 'rollover_update' | 'best_hash_update' | 'round_restart';
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
  connect: () => void;
  disconnect: () => void;
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
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentMineIdRef = useRef<string | null>(null);
  const isMiningRef = useRef<boolean>(isMining);
  
  // Keep isMiningRef in sync with prop
  useEffect(() => {
    isMiningRef.current = isMining;
  }, [isMining]);

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
          if (data.payload?.homeMineId && onHomeMineRestored) {
            console.log('[WS] Restored home mine from server:', data.payload.homeMineId);
            onHomeMineRestored(data.payload.homeMineId);
          }
          break;

        case 'work':
          // Work assignment from pool
          console.log('[WS] Work received:', data.payload);
          if (onWork) {
            onWork(data.payload as WorkUnit);
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
          if (onEvent) {
            onEvent({
              id: Date.now().toString(),
              type: 'discovery_found',
              ...data.payload,
              targetMine: data.payload.mineName,
              targetResource: data.payload.resource,
              winner: data.payload.winner,
              reward: data.payload.totalReward,
              finderShare: data.payload.finderShare,
              vaultShare: data.payload.vaultShare,
              discoveryName: data.payload.discoveryName,
              timestamp: new Date(),
            });
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

        case 'timeout_winner':
          // Timeout winner announcement
          console.log('[WS] Timeout winner:', data.payload);
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

    setStatus('connecting');

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus('connected');
        // Send connect message
        send('connect', { walletAddress, cores });
        
        // Re-join previous mine after reconnection
        if (currentMineIdRef.current) {
          console.log('[Game] Reconnected, re-joining mine:', currentMineIdRef.current);
          setTimeout(() => {
            send('join_mine', { mineId: currentMineIdRef.current });
            
            // If we were mining, explicitly request new work
            // This ensures mining continues after reconnection
            if (isMiningRef.current) {
              console.log('[Game] Was mining, requesting work after reconnect...');
              setTimeout(() => {
                send('request_work', {});
              }, 100); // Wait for join_mine to be processed
            }
          }, 100); // Small delay to ensure connect is processed first
        }
      };

      ws.onmessage = handleMessage;

      ws.onclose = () => {
        setStatus('disconnected');
        wsRef.current = null;
        
        // Auto-reconnect after 3 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          if (walletAddress) {
            connect();
          }
        }, 3000);
      };

      ws.onerror = () => {
        setStatus('error');
      };
    } catch (err) {
      console.error('[WS] Connection error:', err);
      setStatus('error');
    }
  }, [url, walletAddress, cores, send, handleMessage]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setStatus('disconnected');
  }, []);

  const joinMine = useCallback((mineId: string) => {
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
    connect,
    disconnect,
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
