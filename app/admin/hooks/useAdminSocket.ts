/**
 * @fileoverview Admin WebSocket hook for Black Gold Admin Console
 * Connects to game server with admin authentication for real-time dashboard updates
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  AdminStats,
  AdminUser,
  AdminMine,
  AdminRaid,
  AdminLog,
} from '../../../server/types';

/** Connection status */
export type AdminConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'authenticated' | 'error';

/** Hook options */
interface UseAdminSocketOptions {
  /** WebSocket URL */
  url?: string;
  /** Admin password (from sessionStorage) */
  password: string | null;
  /** Auto-connect when password is available */
  autoConnect?: boolean;
}

/** Hook return type */
interface UseAdminSocketReturn {
  /** Current connection status */
  status: AdminConnectionStatus;
  /** Whether admin is authenticated */
  isAuthenticated: boolean;
  /** Admin dashboard statistics */
  stats: AdminStats | null;
  /** List of connected users */
  users: AdminUser[];
  /** Mine statistics */
  mines: AdminMine[];
  /** Raid logs */
  raids: AdminRaid[];
  /** Server logs */
  logs: AdminLog[];
  /** Connect to WebSocket */
  connect: () => void;
  /** Disconnect from WebSocket */
  disconnect: () => void;
  /** Authenticate as admin */
  authenticate: (password: string) => void;
  /** Subscribe to admin updates */
  subscribe: () => void;
  /** Execute admin action */
  executeAction: (action: string, params?: Record<string, unknown>) => void;
  /** Authentication error message */
  authError: string | null;
}

/** Default WebSocket URL */
const DEFAULT_WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080';

export function useAdminSocket({
  url = DEFAULT_WS_URL,
  password,
  autoConnect = true,
}: UseAdminSocketOptions): UseAdminSocketReturn {
  const [status, setStatus] = useState<AdminConnectionStatus>('disconnected');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [mines, setMines] = useState<AdminMine[]>([]);
  const [raids, setRaids] = useState<AdminRaid[]>([]);
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [authError, setAuthError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const passwordRef = useRef<string | null>(password);

  // Keep password ref in sync
  useEffect(() => {
    passwordRef.current = password;
  }, [password]);

  const send = useCallback((type: string, payload: object = {}) => {
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
        case 'admin_auth':
          if (data.payload.success) {
            setIsAuthenticated(true);
            setStatus('authenticated');
            setAuthError(null);
            // Auto-subscribe after authentication
            send('admin_subscribe', {});
          } else {
            setAuthError(data.payload.message || 'Authentication failed');
            setIsAuthenticated(false);
          }
          break;

        case 'admin_stats':
          setStats(data.payload);
          break;

        case 'admin_users':
          setUsers(data.payload);
          break;

        case 'admin_mines':
          setMines(data.payload);
          break;

        case 'admin_raids':
          setRaids(data.payload);
          break;

        case 'admin_logs':
          setLogs(data.payload);
          break;

        case 'result':
          // Action result - could show toast notification
          console.log('[Admin] Action result:', data.payload);
          break;

        case 'error':
          console.error('[Admin] Error:', data.payload);
          break;
      }
    } catch (err) {
      console.error('[Admin] Failed to parse message:', err);
    }
  }, [send]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setStatus('connecting');
    setAuthError(null);

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus('connected');
        console.log('[Admin] WebSocket connected');
        
        // Auto-authenticate if password is available
        if (passwordRef.current) {
          send('admin_auth', { password: passwordRef.current });
        }
      };

      ws.onmessage = handleMessage;

      ws.onclose = () => {
        setStatus('disconnected');
        setIsAuthenticated(false);
        wsRef.current = null;

        // Auto-reconnect after 5 seconds if password is available
        if (passwordRef.current && autoConnect) {
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, 5000);
        }
      };

      ws.onerror = () => {
        setStatus('error');
      };
    } catch (err) {
      console.error('[Admin] Connection error:', err);
      setStatus('error');
    }
  }, [url, handleMessage, autoConnect, send]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setStatus('disconnected');
    setIsAuthenticated(false);
  }, []);

  const authenticate = useCallback((pwd: string) => {
    passwordRef.current = pwd;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      send('admin_auth', { password: pwd });
    } else {
      // Connect first, will auto-auth on open
      connect();
    }
  }, [send, connect]);

  const subscribe = useCallback(() => {
    send('admin_subscribe', {});
  }, [send]);

  const executeAction = useCallback((action: string, params?: Record<string, unknown>) => {
    send('admin_action', { action, ...params });
  }, [send]);

  // Auto-connect when password becomes available
  useEffect(() => {
    if (autoConnect && password && status === 'disconnected') {
      connect();
    }
  }, [autoConnect, password, status, connect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    status,
    isAuthenticated,
    stats,
    users,
    mines,
    raids,
    logs,
    connect,
    disconnect,
    authenticate,
    subscribe,
    executeAction,
    authError,
  };
}
