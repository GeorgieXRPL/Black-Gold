/**
 * @fileoverview WebSocket hook for mining pool connection
 */

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { 
  WSMessage, 
  WorkUnit, 
  NetworkStats, 
  BarrelResult,
  ErrorPayload 
} from '../../server/types';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface UseWebSocketOptions {
  url: string;
  walletAddress: string;
  cores: number;
  onWork?: (work: WorkUnit) => void;
  onStats?: (stats: NetworkStats) => void;
  onBarrelFound?: (result: BarrelResult) => void;
  onError?: (error: ErrorPayload) => void;
}

interface UseWebSocketReturn {
  status: ConnectionStatus;
  connect: () => void;
  disconnect: () => void;
  sendHashrate: (hashrate: number) => void;
  submitProof: (workUnitId: string, nonce: number, hash: string) => void;
  networkStats: NetworkStats | null;
  lastBarrel: BarrelResult | null;
}

/**
 * Custom hook for WebSocket mining pool connection
 */
export function useWebSocket(options: UseWebSocketOptions): UseWebSocketReturn {
  const { url, walletAddress, cores, onWork, onStats, onBarrelFound, onError } = options;
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [networkStats, setNetworkStats] = useState<NetworkStats | null>(null);
  const [lastBarrel, setLastBarrel] = useState<BarrelResult | null>(null);

  /**
   * Handle incoming WebSocket messages
   */
  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const message: WSMessage = JSON.parse(event.data);
      
      switch (message.type) {
        case 'work':
          onWork?.(message.payload as WorkUnit);
          break;
          
        case 'stats':
          const stats = message.payload as NetworkStats;
          setNetworkStats(stats);
          onStats?.(stats);
          break;
          
        case 'barrel_found':
          const barrel = message.payload as BarrelResult;
          setLastBarrel(barrel);
          onBarrelFound?.(barrel);
          break;
          
        case 'error':
          onError?.(message.payload as ErrorPayload);
          break;
      }
    } catch (err) {
      console.error('[WebSocket] Failed to parse message:', err);
    }
  }, [onWork, onStats, onBarrelFound, onError]);

  /**
   * Connect to the mining pool
   */
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }
    
    setStatus('connecting');
    
    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;
      
      ws.onopen = () => {
        setStatus('connected');
        console.log('[WebSocket] Connected to pool');
        
        // Send connect message
        const connectMessage: WSMessage = {
          type: 'connect',
          payload: { walletAddress, cores },
          timestamp: Date.now(),
        };
        ws.send(JSON.stringify(connectMessage));
      };
      
      ws.onmessage = handleMessage;
      
      ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
        setStatus('error');
      };
      
      ws.onclose = (event) => {
        setStatus('disconnected');
        console.log('[WebSocket] Disconnected:', event.code, event.reason);
        
        // Attempt reconnection after 5 seconds (unless intentionally closed)
        if (event.code !== 1000) {
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log('[WebSocket] Attempting reconnection...');
            connect();
          }, 5000);
        }
      };
    } catch (err) {
      console.error('[WebSocket] Connection failed:', err);
      setStatus('error');
    }
  }, [url, walletAddress, cores, handleMessage]);

  /**
   * Disconnect from the mining pool
   */
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (wsRef.current) {
      wsRef.current.close(1000, 'User disconnected');
      wsRef.current = null;
    }
    
    setStatus('disconnected');
  }, []);

  /**
   * Send hashrate update
   */
  const sendHashrate = useCallback((hashrate: number) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) {
      return;
    }
    
    const message: WSMessage = {
      type: 'hashrate',
      payload: { walletAddress, hashrate },
      timestamp: Date.now(),
    };
    
    wsRef.current.send(JSON.stringify(message));
  }, [walletAddress]);

  /**
   * Submit proof to pool
   */
  const submitProof = useCallback((workUnitId: string, nonce: number, hash: string) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) {
      return;
    }
    
    const message: WSMessage = {
      type: 'submit',
      payload: {
        walletAddress,
        workUnitId,
        nonce,
        hash,
        timestamp: Date.now(),
      },
      timestamp: Date.now(),
    };
    
    wsRef.current.send(JSON.stringify(message));
  }, [walletAddress]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    status,
    connect,
    disconnect,
    sendHashrate,
    submitProof,
    networkStats,
    lastBarrel,
  };
}
