/**
 * @fileoverview Black Gold v2 Mining Pool WebSocket Server
 * Entry point with multi-mine, staking, and raid support
 * Includes validation and rate limiting for all message handlers
 */

import { WebSocket, WebSocketServer, RawData } from 'ws';
import { IncomingMessage, createServer, ServerResponse } from 'http';
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
import {
  getMineRegistry,
  getStakeManager,
  getExpeditionTracker,
  getRaidEngine,
  getCooldownManager,
  GlobalNetworkStats,
} from './game';
import { MINES } from '../config/mines';
import {
  validateMessage,
  validatePayload,
  sanitizeForLog,
  ValidatedConnectPayload,
  ValidatedJoinMinePayload,
  ValidatedHashratePayload,
  ValidatedProofSubmission,
  ValidatedStakePayload,
  ValidatedExpeditionPayload,
  ValidatedRallyPayload,
} from './middleware/validate';
import { getRateLimiter, RateLimiter } from './middleware/rateLimit';

/** Extended message types for v2 */
export type GameMessageType = 
  | 'connect'
  | 'disconnect'
  | 'join_mine'
  | 'leave_mine'
  | 'hashrate'
  | 'submit'
  | 'stats'
  | 'mine_stats'
  | 'stake'
  | 'unstake'
  | 'set_home'
  | 'start_expedition'
  | 'leave_expedition'
  | 'rally_defense'
  | 'work'
  | 'result'
  | 'error'
  | 'discovery_found'
  | 'raid_result'
  | 'game_event';

/** Extended connect payload for v2 */
interface GameConnectPayload extends ConnectPayload {
  mineId?: string;
}

/** Mine join payload */
interface JoinMinePayload {
  mineId: string;
}

/** Stake payload */
interface StakePayload {
  mineId: string;
  amount: number;
}

/** Expedition payload */
interface ExpeditionPayload {
  targetMineId: string;
  betAmount?: number;
}

/** Rally payload */
interface RallyPayload {
  mineId: string;
  tokenCost: number;
}

/**
 * Client connection metadata
 */
interface ClientConnection {
  ip: string;
  walletAddress?: string;
  authenticated: boolean;
  currentMineId?: string;
}

/** Map of WebSocket to client metadata */
const clientConnections = new Map<WebSocket, ClientConnection>();

/** Pool managers per mine */
const minePoolManagers = new Map<string, PoolManager>();

/** WebSocket server instance */
let wss: WebSocketServer;

/** HTTP server instance (WebSocket attaches to this for Railway compatibility) */
let httpServer: ReturnType<typeof createServer>;

/** Rate limiter instance */
let rateLimiter: RateLimiter;

/**
 * Extracts the client IP address from the request
 */
function getClientIP(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    return ips.trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

/**
 * Parses and validates incoming WebSocket message
 * Uses Zod validation for message envelope
 */
function parseMessage(data: RawData): WSMessage | null {
  try {
    const str = data.toString('utf-8');
    
    // Validate message envelope structure
    const validation = validateMessage(str);
    if (!validation.success || !validation.data) {
      console.warn(`[WS] Invalid message format: ${validation.error}`);
      return null;
    }
    
    const parsed = JSON.parse(str);
    if (!parsed.type || parsed.payload === undefined) {
      return null;
    }
    return parsed as WSMessage;
  } catch {
    return null;
  }
}

/**
 * Sends a JSON message to a WebSocket client
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
 * Sends an error message
 */
function sendError(ws: WebSocket, code: string, message: string): void {
  sendMessage(ws, 'error', { code, message });
}

/**
 * Broadcasts a message to all clients at a specific mine
 */
function broadcastToMine<T>(mineId: string, type: string, payload: T): void {
  const registry = getMineRegistry();
  const mine = registry.getMine(mineId);
  if (!mine) return;

  for (const [ws, info] of clientConnections) {
    if (info.currentMineId === mineId && ws.readyState === WebSocket.OPEN) {
      sendMessage(ws, type, payload);
    }
  }
}

/**
 * Broadcasts to all connected clients
 */
function broadcastToAll<T>(type: string, payload: T): void {
  for (const [ws] of clientConnections) {
    if (ws.readyState === WebSocket.OPEN) {
      sendMessage(ws, type, payload);
    }
  }
}

/**
 * Handles the 'connect' message
 * Payload is pre-validated by Zod schema
 */
function handleConnect(
  ws: WebSocket,
  payload: ValidatedConnectPayload,
  clientInfo: ClientConnection
): void {
  // Payload already validated by Zod - walletAddress and cores are guaranteed valid

  clientInfo.walletAddress = payload.walletAddress;
  clientInfo.authenticated = true;

  // Initialize stake manager state for this wallet
  const stakeManager = getStakeManager();
  stakeManager.getMinerState(payload.walletAddress);

  // If a mineId was provided, join that mine
  if (payload.mineId) {
    handleJoinMine(ws, { type: 'join_mine', mineId: payload.mineId }, clientInfo);
  }

  // Send welcome response with global stats
  sendMessage(ws, 'result', {
    success: true,
    message: 'Connected to Black Gold v2',
    mines: MINES.map(m => ({ id: m.id, name: m.name, resource: m.resource })),
  });

  console.log(`[WS] Client authenticated: ${sanitizeForLog(payload.walletAddress)}`);
}

/**
 * Handles joining a specific mine
 * Payload is pre-validated by Zod schema
 */
function handleJoinMine(
  ws: WebSocket,
  payload: ValidatedJoinMinePayload,
  clientInfo: ClientConnection
): void {
  if (!clientInfo.authenticated) {
    sendError(ws, 'NOT_AUTHENTICATED', 'Must connect first');
    return;
  }

  const registry = getMineRegistry();
  const mine = registry.getMine(payload.mineId);

  if (!mine) {
    sendError(ws, 'INVALID_MINE', `Mine ${sanitizeForLog(payload.mineId)} not found`);
    return;
  }

  // Leave current mine if any
  if (clientInfo.currentMineId && clientInfo.currentMineId !== payload.mineId) {
    registry.removeMiner(clientInfo.walletAddress!, 0);
  }

  // Join new mine
  registry.addMiner(clientInfo.walletAddress!, payload.mineId, 0);
  clientInfo.currentMineId = payload.mineId;

  // Get or create pool manager for this mine
  let poolManager = minePoolManagers.get(payload.mineId);
  if (!poolManager) {
    poolManager = new PoolManager({
      onDiscoveryFound: (result) => handleDiscoveryFound(payload.mineId, result),
      onStatsUpdate: () => {}, // Handled globally
    });
    poolManager.start();
    minePoolManagers.set(payload.mineId, poolManager);
  }

  // Register with pool manager
  poolManager.handleConnect(ws, {
    walletAddress: clientInfo.walletAddress!,
    cores: 1, // Will be updated with hashrate
  }, clientInfo.ip);

  sendMessage(ws, 'result', {
    success: true,
    message: `Joined ${mine.definition.name}`,
    mineId: payload.mineId,
    stats: {
      miners: mine.activeMiners.size,
      hashrate: mine.totalHashrate,
      discoveries: mine.totalDiscoveries,
    },
  });

  console.log(`[WS] ${sanitizeForLog(clientInfo.walletAddress || '')} joined ${mine.definition.name}`);
}

/**
 * Handles discovery found at a mine
 */
async function handleDiscoveryFound(mineId: string, result: BarrelResult): Promise<void> {
  const registry = getMineRegistry();
  const raidEngine = getRaidEngine();
  const mine = registry.getMine(mineId);

  if (!mine) return;

  const resource = mine.definition.resource;
  const discoveryEmoji = resource === 'coal' ? '⛏️' : resource === 'gold' ? '🥇' : resource === 'oil' ? '🛢️' : '🥈';

  console.log('═'.repeat(60));
  console.log(`${discoveryEmoji}  ${result.discoveryName || 'DISCOVERY'} #${result.discoveryNumber} at ${mine.definition.name}!`);
  console.log(`   Winner: ${result.winner}`);
  console.log(`   Hash:   ${result.hash.substring(0, 16)}...`);
  console.log(`   Finder: +${result.finderShare} | Vault: +${result.vaultShare}`);
  console.log('═'.repeat(60));

  // Update mine state
  registry.recordDiscoveryFound(mineId, result.hash);

  // Check for jackpot (gold mines)
  if (mine.definition.resource === 'gold' && mine.isJackpotActive) {
    console.log('🎰 GOLD RUSH JACKPOT ACTIVATED!');
    broadcastToAll('game_event', {
      type: 'jackpot',
      mineId,
      mineName: mine.definition.name,
      multiplier: 5,
    });
  }

  // Resolve any active raids against this mine
  if (mine.incomingRaids.length > 0) {
    const raidResults = raidEngine.resolveAllRaids(mineId);
    
    for (const raidResult of raidResults) {
      broadcastToAll('raid_result', {
        mineId,
        ...raidResult,
        attackersWon: raidResult.attackersWon,
        stolenRewards: raidResult.stolenRewards,
      });
    }
  }

  // Broadcast discovery found
  broadcastToMine(mineId, 'discovery_found', {
    ...result,
    mineId,
    mineName: mine.definition.name,
    resource: mine.definition.resource,
    rewardMultiplier: registry.getRewardMultiplier(mineId),
  });

  // Also broadcast globally for raid feed
  broadcastToAll('game_event', {
    type: 'discovery_found',
    mineId,
    mineName: mine.definition.name,
    winner: result.winner,
    discoveryNumber: result.discoveryNumber,
    discoveryName: result.discoveryName,
    resource: mine.definition.resource,
  });
}

/**
 * Handles hashrate update
 * Payload is pre-validated by Zod schema
 */
function handleHashrate(
  ws: WebSocket,
  payload: ValidatedHashratePayload,
  clientInfo: ClientConnection
): void {
  if (!clientInfo.authenticated || !clientInfo.currentMineId) {
    sendError(ws, 'NOT_AUTHENTICATED', 'Must join a mine first');
    return;
  }

  const registry = getMineRegistry();
  const stakeManager = getStakeManager();
  const poolManager = minePoolManagers.get(clientInfo.currentMineId);

  if (!poolManager) return;

  // Get effective hashrate with stake multiplier
  const effectiveHashrate = stakeManager.getEffectiveHashrate(
    clientInfo.walletAddress!,
    payload.hashrate,
    clientInfo.currentMineId
  );

  // Update registry
  registry.updateMinerHashrate(
    clientInfo.walletAddress!,
    0, // Old hashrate not tracked here
    effectiveHashrate
  );

  // Update pool manager
  poolManager.handleHashrateUpdate({
    walletAddress: clientInfo.walletAddress!,
    hashrate: effectiveHashrate,
  });
}

/**
 * Handles proof submission
 * Payload is pre-validated by Zod schema
 */
async function handleSubmit(
  ws: WebSocket,
  payload: ValidatedProofSubmission,
  clientInfo: ClientConnection
): Promise<void> {
  if (!clientInfo.authenticated || !clientInfo.currentMineId) {
    sendError(ws, 'NOT_AUTHENTICATED', 'Must join a mine first');
    return;
  }

  const poolManager = minePoolManagers.get(clientInfo.currentMineId);
  if (!poolManager) {
    sendError(ws, 'NO_POOL', 'Mine pool not initialized');
    return;
  }

  // Build the full proof submission with server-controlled fields
  const fullPayload: ProofSubmission = {
    walletAddress: clientInfo.walletAddress!,
    nonce: payload.nonce,
    hash: payload.hash,
    workUnitId: payload.workUnitId,
    timestamp: Date.now(),
  };

  const success = await poolManager.handleSubmission(fullPayload);

  sendMessage(ws, 'result', {
    success,
    message: success ? 'Proof accepted!' : 'Proof rejected',
  });
}

/**
 * Handles staking request
 * Payload is pre-validated by Zod schema
 */
function handleStake(
  ws: WebSocket,
  payload: ValidatedStakePayload,
  clientInfo: ClientConnection
): void {
  if (!clientInfo.authenticated) {
    sendError(ws, 'NOT_AUTHENTICATED', 'Must connect first');
    return;
  }

  const stakeManager = getStakeManager();
  const success = stakeManager.stake(
    clientInfo.walletAddress!,
    payload.mineId,
    payload.amount
  );

  if (success) {
    const newStake = stakeManager.getStakeAtMine(clientInfo.walletAddress!, payload.mineId);
    const tier = stakeManager.getStakeTierAtMine(clientInfo.walletAddress!, payload.mineId);

    sendMessage(ws, 'result', {
      success: true,
      message: `Staked ${payload.amount} at mine`,
      totalStake: newStake,
      tier: tier.name,
      multiplier: tier.hashrateMultiplier,
    });
  } else {
    sendError(ws, 'STAKE_FAILED', 'Failed to stake tokens');
  }
}

/**
 * Handles unstaking request
 * Payload is pre-validated by Zod schema
 */
function handleUnstake(
  ws: WebSocket,
  payload: ValidatedStakePayload,
  clientInfo: ClientConnection
): void {
  if (!clientInfo.authenticated) {
    sendError(ws, 'NOT_AUTHENTICATED', 'Must connect first');
    return;
  }

  const stakeManager = getStakeManager();
  const success = stakeManager.unstake(
    clientInfo.walletAddress!,
    payload.mineId,
    payload.amount
  );

  if (success) {
    const newStake = stakeManager.getStakeAtMine(clientInfo.walletAddress!, payload.mineId);
    sendMessage(ws, 'result', {
      success: true,
      message: `Unstaked ${payload.amount}`,
      totalStake: newStake,
    });
  } else {
    sendError(ws, 'UNSTAKE_FAILED', 'Failed to unstake tokens');
  }
}

/**
 * Handles set home base request
 * Payload is pre-validated by Zod schema
 */
function handleSetHome(
  ws: WebSocket,
  payload: ValidatedJoinMinePayload,
  clientInfo: ClientConnection
): void {
  if (!clientInfo.authenticated) {
    sendError(ws, 'NOT_AUTHENTICATED', 'Must connect first');
    return;
  }

  const cooldownManager = getCooldownManager();
  const cooldownError = cooldownManager.checkAction(clientInfo.walletAddress!, 'home_base_switch');
  
  if (cooldownError) {
    sendError(ws, 'COOLDOWN', cooldownError);
    return;
  }

  const stakeManager = getStakeManager();
  const success = stakeManager.setHomeBase(clientInfo.walletAddress!, payload.mineId);

  if (success) {
    cooldownManager.applyCooldown(clientInfo.walletAddress!, 'home_base_switch');
    
    const registry = getMineRegistry();
    const mine = registry.getMine(payload.mineId);

    sendMessage(ws, 'result', {
      success: true,
      message: `Home base set to ${mine?.definition.name}`,
      mineId: payload.mineId,
    });
  } else {
    sendError(ws, 'SET_HOME_FAILED', 'Failed to set home base');
  }
}

/**
 * Handles expedition start
 * Payload is pre-validated by Zod schema
 */
function handleStartExpedition(
  ws: WebSocket,
  payload: ValidatedExpeditionPayload,
  clientInfo: ClientConnection
): void {
  if (!clientInfo.authenticated) {
    sendError(ws, 'NOT_AUTHENTICATED', 'Must connect first');
    return;
  }

  const stakeManager = getStakeManager();
  const tracker = getExpeditionTracker();
  const minerState = stakeManager.getMinerState(clientInfo.walletAddress!);

  if (!minerState.homeBaseMineId) {
    sendError(ws, 'NO_HOME', 'Must set a home base first');
    return;
  }

  // Get hashrate from pool manager
  const poolManager = minePoolManagers.get(minerState.homeBaseMineId);
  const miner = poolManager?.getMiner(clientInfo.walletAddress!);
  const hashrate = miner?.hashrate || 0;

  const expedition = tracker.createExpedition(
    clientInfo.walletAddress!,
    minerState.homeBaseMineId,
    payload.targetMineId,
    hashrate,
    payload.betAmount || 0
  );

  if (expedition) {
    const registry = getMineRegistry();
    const targetMine = registry.getMine(payload.targetMineId);

    sendMessage(ws, 'result', {
      success: true,
      message: `Expedition launched against ${targetMine?.definition.name}`,
      expeditionId: expedition.id,
      expiresAt: expedition.expiresAt.toISOString(),
    });

    // Broadcast raid started
    broadcastToAll('game_event', {
      type: 'raid_started',
      sourceMineId: minerState.homeBaseMineId,
      targetMineId: payload.targetMineId,
      attackerCount: expedition.attackers.length,
    });
  } else {
    sendError(ws, 'EXPEDITION_FAILED', 'Failed to start expedition');
  }
}

/**
 * Handles rally defense request
 * Payload is pre-validated by Zod schema
 */
function handleRallyDefense(
  ws: WebSocket,
  payload: ValidatedRallyPayload,
  clientInfo: ClientConnection
): void {
  if (!clientInfo.authenticated) {
    sendError(ws, 'NOT_AUTHENTICATED', 'Must connect first');
    return;
  }

  const raidEngine = getRaidEngine();
  const success = raidEngine.rallyDefense(
    payload.mineId,
    clientInfo.walletAddress!,
    payload.tokenCost ?? 0
  );

  if (success) {
    sendMessage(ws, 'result', {
      success: true,
      message: 'Defense rallied! +50% boost for 30 minutes',
    });
  } else {
    sendError(ws, 'RALLY_FAILED', 'Failed to rally defense');
  }
}

/**
 * Gets global network stats
 */
function getGlobalStats(): GlobalNetworkStats {
  const registry = getMineRegistry();
  const tracker = getExpeditionTracker();

  const mineStats = registry.getNetworkStats();
  const expeditionStats = tracker.getStats();

  return {
    totalMiners: registry.getTotalMiners(),
    totalHashrate: registry.getTotalHashrate(),
    totalStake: registry.getTotalStake(),
    totalDiscoveries: registry.getTotalDiscoveries(),
    mineStats,
    activeExpeditions: expeditionStats.active,
    activeRaids: mineStats.filter(m => m.activeRaidCount > 0).length,
  };
}

/**
 * Handles incoming WebSocket messages
 * Includes rate limiting and payload validation
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

  // Rate limit check
  const rateLimitResult = rateLimiter.check(clientInfo.ip, message.type);
  if (!rateLimitResult.allowed) {
    sendError(ws, 'RATE_LIMITED', rateLimitResult.error || 'Too many requests');
    return;
  }

  // Log with sanitized data
  console.log(`[WS] ${sanitizeForLog(message.type)} from ${sanitizeForLog(clientInfo.walletAddress || clientInfo.ip)}`);

  // Validate payload for the specific message type
  const validation = validatePayload(message.type, message.payload);
  if (!validation.success) {
    sendError(ws, 'VALIDATION_ERROR', validation.error || 'Invalid payload');
    return;
  }

  switch (message.type) {
    case 'connect':
      handleConnect(ws, validation.data as ValidatedConnectPayload, clientInfo);
      break;

    case 'join_mine':
      handleJoinMine(ws, validation.data as ValidatedJoinMinePayload, clientInfo);
      break;

    case 'hashrate':
      handleHashrate(ws, validation.data as ValidatedHashratePayload, clientInfo);
      break;

    case 'submit':
      await handleSubmit(ws, validation.data as ValidatedProofSubmission, clientInfo);
      break;

    case 'stats':
      sendMessage(ws, 'stats', getGlobalStats());
      break;

    case 'stake':
      handleStake(ws, validation.data as ValidatedStakePayload, clientInfo);
      break;

    case 'unstake':
      handleUnstake(ws, validation.data as ValidatedStakePayload, clientInfo);
      break;

    case 'set_home':
      handleSetHome(ws, validation.data as ValidatedJoinMinePayload, clientInfo);
      break;

    case 'start_expedition':
      handleStartExpedition(ws, validation.data as ValidatedExpeditionPayload, clientInfo);
      break;

    case 'rally_defense':
      handleRallyDefense(ws, validation.data as ValidatedRallyPayload, clientInfo);
      break;

    default:
      sendError(ws, 'UNKNOWN_TYPE', `Unknown message type: ${sanitizeForLog(message.type)}`);
  }
}

/**
 * Handles WebSocket connection close
 */
function handleClose(ws: WebSocket, clientInfo: ClientConnection): void {
  console.log(`[WS] Disconnected: ${clientInfo.walletAddress || clientInfo.ip}`);

  if (clientInfo.walletAddress) {
    const registry = getMineRegistry();
    registry.removeMiner(clientInfo.walletAddress, 0);

    if (clientInfo.currentMineId) {
      const poolManager = minePoolManagers.get(clientInfo.currentMineId);
      poolManager?.handleDisconnect(clientInfo.walletAddress);
    }
  }

  clientConnections.delete(ws);
}

/**
 * Starts the WebSocket server
 */
export async function startServer(): Promise<WebSocketServer> {
  const port = POOL_CONFIG.PORT;

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║        BLACK GOLD v2 - INTERACTIVE MINING GLOBE          ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`[Server] Starting on port ${port}...`);
  console.log(`[Server] Loaded ${MINES.length} mines`);
  console.log('[Server] Validation and rate limiting enabled');

  // Initialize game systems
  getMineRegistry();
  getStakeManager();
  getCooldownManager();
  getExpeditionTracker();
  getRaidEngine();
  
  // Initialize rate limiter
  rateLimiter = getRateLimiter('ws-messages', {
    limit: 200,
    windowMs: 60_000,
    blockDurationMs: 300_000,
  });

  // Create HTTP server for Railway compatibility
  // Railway's proxy needs an HTTP server to properly upgrade to WebSocket
  httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
    // Health check endpoint
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', server: 'Black Gold WebSocket' }));
      return;
    }
    // For non-WebSocket requests, return upgrade required
    res.writeHead(426, { 
      'Content-Type': 'text/plain',
      'Upgrade': 'websocket',
      'Connection': 'Upgrade'
    });
    res.end('Upgrade Required - This is a WebSocket server');
  });

  // Attach WebSocket server to HTTP server
  wss = new WebSocketServer({
    server: httpServer,
    perMessageDeflate: false,
    maxPayload: 64 * 1024,
  });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const ip = getClientIP(req);
    
    // Rate limit connections per IP
    const connectRateLimit = rateLimiter.check(ip, 'connect');
    if (!connectRateLimit.allowed) {
      console.warn(`[WS] Connection rejected for ${sanitizeForLog(ip)}: rate limited`);
      ws.close(1008, 'Rate limited');
      return;
    }
    
    console.log(`[WS] New connection from ${sanitizeForLog(ip)}`);

    const clientInfo: ClientConnection = {
      ip,
      authenticated: false,
    };
    clientConnections.set(ws, clientInfo);

    ws.on('message', (data: RawData) => {
      handleMessage(ws, data, clientInfo).catch((error) => {
        console.error('[WS] Error:', error instanceof Error ? error.message : 'Unknown error');
        sendError(ws, 'INTERNAL_ERROR', 'Internal server error');
      });
    });

    ws.on('close', () => handleClose(ws, clientInfo));
    ws.on('error', (err) => console.error(`[WS] Error: ${sanitizeForLog(err.message)}`));
  });

  // Periodic cleanup
  setInterval(() => {
    getCooldownManager().cleanupExpired();
    getMineRegistry().clearExpiredEffects();
    getExpeditionTracker().cleanup();
  }, 60000);

  // Broadcast stats every 10 seconds
  setInterval(() => {
    broadcastToAll('stats', getGlobalStats());
  }, 10000);

  // Ping clients
  setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) ws.ping();
    });
  }, 30000);

  // Start HTTP server (WebSocket is attached to it)
  await new Promise<void>((resolve) => {
    httpServer.listen(port, () => {
      console.log(`[Server] HTTP + WebSocket listening on port ${port}`);
      console.log(`[Server] Health check: http://localhost:${port}/health`);
      console.log('[Server] Ready for miners!');
      resolve();
    });
  });

  const shutdown = () => {
    console.log('\n[Server] Shutting down...');
    minePoolManagers.forEach((pm) => pm.stop());
    rateLimiter.stop();
    wss.close(() => {
      httpServer.close(() => process.exit(0));
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return wss;
}

export async function stopServer(): Promise<void> {
  minePoolManagers.forEach((pm) => pm.stop());
  if (rateLimiter) {
    rateLimiter.stop();
  }
  if (wss) {
    await new Promise<void>((resolve) => {
      wss.close(() => resolve());
    });
  }
  if (httpServer) {
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  }
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error('[Server] Failed to start:', error);
    process.exit(1);
  });
}
