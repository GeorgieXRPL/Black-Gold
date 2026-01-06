/**
 * @fileoverview Black Gold Mining Pool WebSocket Server
 * Entry point for the mining pool server using the 'ws' library
 */

import { WebSocket, WebSocketServer, RawData } from 'ws';
import { IncomingMessage } from 'http';
import {
  WSMessage,
  ConnectPayload,
  HashratePayload,
  ProofSubmission,
  BarrelResult,
  NetworkStats,
} from './types';
import { PoolManager } from './pool/manager';
import { POOL_CONFIG } from '../config/constants';

/**
 * Client connection metadata
 */
interface ClientConnection {
  /** Client IP address */
  ip: string;
  /** Associated wallet address (set after connect message) */
  walletAddress?: string;
  /** Whether the connection is authenticated */
  authenticated: boolean;
}

/** Map of WebSocket to client metadata */
const clientConnections = new Map<WebSocket, ClientConnection>();

/** Pool manager instance */
let poolManager: PoolManager;

/** WebSocket server instance */
let wss: WebSocketServer;

/**
 * Extracts the client IP address from the request
 * Handles proxied connections via X-Forwarded-For header
 * @param req - The HTTP upgrade request
 * @returns Client IP address
 */
function getClientIP(req: IncomingMessage): string {
  // Check for proxy headers first
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    return ips.trim();
  }

  // Fall back to socket remote address
  return req.socket.remoteAddress || 'unknown';
}

/**
 * Parses and validates an incoming WebSocket message
 * @param data - Raw WebSocket data
 * @returns Parsed message or null if invalid
 */
function parseMessage(data: RawData): WSMessage | null {
  try {
    const str = data.toString('utf-8');
    const parsed = JSON.parse(str);

    // Validate required fields
    if (!parsed.type || parsed.payload === undefined) {
      console.log('[WS] Invalid message format: missing type or payload');
      return null;
    }

    return parsed as WSMessage;
  } catch (error) {
    console.log('[WS] Failed to parse message:', error);
    return null;
  }
}

/**
 * Sends a JSON message to a WebSocket client
 * @param ws - WebSocket connection
 * @param type - Message type
 * @param payload - Message payload
 */
function sendMessage<T>(ws: WebSocket, type: string, payload: T): void {
  if (ws.readyState !== WebSocket.OPEN) return;

  const message: WSMessage<T> = {
    type: type as WSMessage['type'],
    payload,
    timestamp: Date.now(),
  };

  ws.send(JSON.stringify(message));
}

/**
 * Sends an error message to a client
 * @param ws - WebSocket connection
 * @param code - Error code
 * @param message - Error message description
 */
function sendError(ws: WebSocket, code: string, message: string): void {
  sendMessage(ws, 'error', { code, message });
}

/**
 * Handles the 'connect' message from a client
 * @param ws - WebSocket connection
 * @param payload - Connection payload
 * @param clientInfo - Client connection metadata
 */
function handleConnect(
  ws: WebSocket,
  payload: ConnectPayload,
  clientInfo: ClientConnection
): void {
  // Validate payload
  if (!payload.walletAddress || typeof payload.cores !== 'number') {
    sendError(ws, 'INVALID_PAYLOAD', 'Missing walletAddress or cores');
    return;
  }

  // Validate wallet address format (basic Solana address check)
  if (
    payload.walletAddress.length < 32 ||
    payload.walletAddress.length > 44
  ) {
    sendError(ws, 'INVALID_WALLET', 'Invalid wallet address format');
    return;
  }

  // Validate core count
  if (payload.cores < 1 || payload.cores > 128) {
    sendError(ws, 'INVALID_CORES', 'Core count must be between 1 and 128');
    return;
  }

  // Attempt to register with pool manager
  const success = poolManager.handleConnect(ws, payload, clientInfo.ip);

  if (success) {
    clientInfo.walletAddress = payload.walletAddress;
    clientInfo.authenticated = true;

    // Send confirmation
    sendMessage(ws, 'result', {
      success: true,
      message: 'Connected to mining pool',
      barrelNumber: poolManager.getDifficultyState().current,
    });

    console.log(`[WS] Client authenticated: ${payload.walletAddress}`);
  } else {
    ws.close(1008, 'Connection rejected');
  }
}

/**
 * Handles the 'hashrate' message from a client
 * @param ws - WebSocket connection
 * @param payload - Hashrate payload
 * @param clientInfo - Client connection metadata
 */
function handleHashrate(
  ws: WebSocket,
  payload: HashratePayload,
  clientInfo: ClientConnection
): void {
  if (!clientInfo.authenticated) {
    sendError(ws, 'NOT_AUTHENTICATED', 'Must send connect message first');
    return;
  }

  // Validate payload
  if (typeof payload.hashrate !== 'number' || payload.hashrate < 0) {
    sendError(ws, 'INVALID_PAYLOAD', 'Invalid hashrate value');
    return;
  }

  // Update hashrate
  poolManager.handleHashrateUpdate({
    walletAddress: clientInfo.walletAddress!,
    hashrate: payload.hashrate,
  });
}

/**
 * Handles the 'submit' message (proof submission) from a client
 * @param ws - WebSocket connection
 * @param payload - Proof submission payload
 * @param clientInfo - Client connection metadata
 */
async function handleSubmit(
  ws: WebSocket,
  payload: ProofSubmission,
  clientInfo: ClientConnection
): Promise<void> {
  if (!clientInfo.authenticated) {
    sendError(ws, 'NOT_AUTHENTICATED', 'Must send connect message first');
    return;
  }

  // Validate payload
  if (
    typeof payload.nonce !== 'number' ||
    !payload.hash ||
    !payload.workUnitId
  ) {
    sendError(ws, 'INVALID_PAYLOAD', 'Missing nonce, hash, or workUnitId');
    return;
  }

  // Ensure wallet matches
  payload.walletAddress = clientInfo.walletAddress!;
  payload.timestamp = Date.now();

  // Process submission
  const success = await poolManager.handleSubmission(payload);

  if (success) {
    sendMessage(ws, 'result', {
      success: true,
      message: 'Proof accepted!',
    });
  } else {
    sendMessage(ws, 'result', {
      success: false,
      message: 'Proof rejected',
    });
  }
}

/**
 * Handles incoming WebSocket messages
 * @param ws - WebSocket connection
 * @param data - Raw message data
 * @param clientInfo - Client connection metadata
 */
async function handleMessage(
  ws: WebSocket,
  data: RawData,
  clientInfo: ClientConnection
): Promise<void> {
  const message = parseMessage(data);
  if (!message) {
    sendError(ws, 'PARSE_ERROR', 'Failed to parse message');
    return;
  }

  console.log(`[WS] Received ${message.type} from ${clientInfo.walletAddress || clientInfo.ip}`);

  switch (message.type) {
    case 'connect':
      handleConnect(ws, message.payload as ConnectPayload, clientInfo);
      break;

    case 'hashrate':
      handleHashrate(ws, message.payload as HashratePayload, clientInfo);
      break;

    case 'submit':
      await handleSubmit(ws, message.payload as ProofSubmission, clientInfo);
      break;

    case 'stats':
      // Client requesting stats
      const stats = poolManager.getNetworkStats();
      sendMessage(ws, 'stats', stats);
      break;

    default:
      sendError(ws, 'UNKNOWN_TYPE', `Unknown message type: ${message.type}`);
  }
}

/**
 * Handles WebSocket connection close
 * @param ws - WebSocket connection
 * @param clientInfo - Client connection metadata
 */
function handleClose(ws: WebSocket, clientInfo: ClientConnection): void {
  console.log(
    `[WS] Client disconnected: ${clientInfo.walletAddress || clientInfo.ip}`
  );

  if (clientInfo.walletAddress) {
    poolManager.handleDisconnect(clientInfo.walletAddress);
  }

  clientConnections.delete(ws);
}

/**
 * Handles WebSocket errors
 * @param ws - WebSocket connection
 * @param error - The error that occurred
 * @param clientInfo - Client connection metadata
 */
function handleError(
  ws: WebSocket,
  error: Error,
  clientInfo: ClientConnection
): void {
  console.error(
    `[WS] Error for ${clientInfo.walletAddress || clientInfo.ip}:`,
    error.message
  );
}

/**
 * Handles barrel found events
 * @param result - The barrel result
 */
function onBarrelFound(result: BarrelResult): void {
  console.log('═'.repeat(60));
  console.log(`🛢️  BARREL #${result.barrelNumber} DISCOVERED!`);
  console.log(`   Winner: ${result.winner}`);
  console.log(`   Hash:   ${result.hash.substring(0, 16)}...`);
  console.log(`   Nonce:  ${result.nonce}`);
  console.log(`   Time:   ${result.timestamp.toISOString()}`);
  console.log('═'.repeat(60));

  // TODO: Trigger reward distribution via Solana module
}

/**
 * Handles network stats updates
 * @param stats - Updated network statistics
 */
function onStatsUpdate(stats: NetworkStats): void {
  console.log(
    `[Stats] Miners: ${stats.totalMiners} | ` +
      `Hashrate: ${(stats.networkHashrate / 1000).toFixed(2)} kH/s | ` +
      `Difficulty: ${stats.difficulty} | ` +
      `Barrels: ${stats.totalBarrels}`
  );
}

/**
 * Starts the WebSocket mining pool server
 * @returns Promise that resolves when server is ready
 */
export async function startServer(): Promise<WebSocketServer> {
  const port = POOL_CONFIG.PORT;

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║           BLACK GOLD MINING POOL SERVER                  ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`[Server] Starting on port ${port}...`);

  // Initialize pool manager
  poolManager = new PoolManager({
    onBarrelFound,
    onMinerConnect: (miner) => {
      console.log(`[Pool] Miner joined: ${miner.walletAddress}`);
    },
    onMinerDisconnect: (wallet) => {
      console.log(`[Pool] Miner left: ${wallet}`);
    },
    onStatsUpdate,
  });

  // Create WebSocket server
  wss = new WebSocketServer({
    port,
    perMessageDeflate: false, // Disable compression for lower latency
    maxPayload: 64 * 1024, // 64KB max message size
  });

  // Handle new connections
  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const ip = getClientIP(req);
    console.log(`[WS] New connection from ${ip}`);

    // Store client metadata
    const clientInfo: ClientConnection = {
      ip,
      authenticated: false,
    };
    clientConnections.set(ws, clientInfo);

    // Set up message handler
    ws.on('message', (data: RawData) => {
      handleMessage(ws, data, clientInfo).catch((error) => {
        console.error('[WS] Message handler error:', error);
        sendError(ws, 'INTERNAL_ERROR', 'Internal server error');
      });
    });

    // Set up close handler
    ws.on('close', () => {
      handleClose(ws, clientInfo);
    });

    // Set up error handler
    ws.on('error', (error: Error) => {
      handleError(ws, error, clientInfo);
    });

    // Set ping/pong for connection health
    ws.on('pong', () => {
      // Connection is alive
    });
  });

  // Ping all clients every 30 seconds
  const pingInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    });
  }, 30000);

  // Handle server errors
  wss.on('error', (error: Error) => {
    console.error('[Server] WebSocket server error:', error);
  });

  // Start pool manager
  poolManager.start();

  // Wait for server to be listening
  await new Promise<void>((resolve) => {
    wss.on('listening', () => {
      console.log(`[Server] WebSocket server listening on ws://localhost:${port}`);
      console.log('[Server] Pool manager started');
      console.log('[Server] Ready for miners!');
      resolve();
    });
  });

  // Handle graceful shutdown
  const shutdown = () => {
    console.log('\n[Server] Shutting down...');
    clearInterval(pingInterval);
    poolManager.stop();
    wss.close(() => {
      console.log('[Server] Server closed');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return wss;
}

/**
 * Stops the WebSocket server
 */
export async function stopServer(): Promise<void> {
  if (poolManager) {
    poolManager.stop();
  }
  if (wss) {
    return new Promise((resolve) => {
      wss.close(() => {
        console.log('[Server] Server stopped');
        resolve();
      });
    });
  }
}

/**
 * Gets the pool manager instance
 * @returns The pool manager instance
 */
export function getPoolManager(): PoolManager {
  return poolManager;
}

// Run server if this file is executed directly
if (require.main === module) {
  startServer().catch((error) => {
    console.error('[Server] Failed to start:', error);
    process.exit(1);
  });
}
