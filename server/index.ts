/**
 * @fileoverview Black Gold v2 Mining Pool WebSocket Server
 * Entry point with multi-mine, staking, and raid support
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
import {
  getMineRegistry,
  getStakeManager,
  getExpeditionTracker,
  getRaidEngine,
  getCooldownManager,
  GlobalNetworkStats,
} from './game';
import { MINES } from '../config/mines';

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
 * Parses incoming WebSocket message
 */
function parseMessage(data: RawData): WSMessage | null {
  try {
    const str = data.toString('utf-8');
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
 */
function handleConnect(
  ws: WebSocket,
  payload: GameConnectPayload,
  clientInfo: ClientConnection
): void {
  if (!payload.walletAddress || typeof payload.cores !== 'number') {
    sendError(ws, 'INVALID_PAYLOAD', 'Missing walletAddress or cores');
    return;
  }

  if (payload.walletAddress.length < 32 || payload.walletAddress.length > 44) {
    sendError(ws, 'INVALID_WALLET', 'Invalid wallet address format');
    return;
  }

  if (payload.cores < 1 || payload.cores > 128) {
    sendError(ws, 'INVALID_CORES', 'Core count must be between 1 and 128');
    return;
  }

  clientInfo.walletAddress = payload.walletAddress;
  clientInfo.authenticated = true;

  // Initialize stake manager state for this wallet
  const stakeManager = getStakeManager();
  stakeManager.getMinerState(payload.walletAddress);

  // If a mineId was provided, join that mine
  if (payload.mineId) {
    handleJoinMine(ws, { mineId: payload.mineId }, clientInfo);
  }

  // Send welcome response with global stats
  sendMessage(ws, 'result', {
    success: true,
    message: 'Connected to Black Gold v2',
    mines: MINES.map(m => ({ id: m.id, name: m.name, resource: m.resource })),
  });

  console.log(`[WS] Client authenticated: ${payload.walletAddress}`);
}

/**
 * Handles joining a specific mine
 */
function handleJoinMine(
  ws: WebSocket,
  payload: JoinMinePayload,
  clientInfo: ClientConnection
): void {
  if (!clientInfo.authenticated) {
    sendError(ws, 'NOT_AUTHENTICATED', 'Must connect first');
    return;
  }

  const registry = getMineRegistry();
  const mine = registry.getMine(payload.mineId);

  if (!mine) {
    sendError(ws, 'INVALID_MINE', `Mine ${payload.mineId} not found`);
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

  console.log(`[WS] ${clientInfo.walletAddress} joined ${mine.definition.name}`);
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
 */
function handleHashrate(
  ws: WebSocket,
  payload: HashratePayload,
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
 */
async function handleSubmit(
  ws: WebSocket,
  payload: ProofSubmission,
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

  payload.walletAddress = clientInfo.walletAddress!;
  payload.timestamp = Date.now();

  const success = await poolManager.handleSubmission(payload);

  sendMessage(ws, 'result', {
    success,
    message: success ? 'Proof accepted!' : 'Proof rejected',
  });
}

/**
 * Handles staking request
 */
function handleStake(
  ws: WebSocket,
  payload: StakePayload,
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
 */
function handleUnstake(
  ws: WebSocket,
  payload: StakePayload,
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
 */
function handleSetHome(
  ws: WebSocket,
  payload: JoinMinePayload,
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
 */
function handleStartExpedition(
  ws: WebSocket,
  payload: ExpeditionPayload,
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
 */
function handleRallyDefense(
  ws: WebSocket,
  payload: RallyPayload,
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
    payload.tokenCost
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

  console.log(`[WS] ${message.type} from ${clientInfo.walletAddress || clientInfo.ip}`);

  switch (message.type) {
    case 'connect':
      handleConnect(ws, message.payload as GameConnectPayload, clientInfo);
      break;

    case 'join_mine':
      handleJoinMine(ws, message.payload as JoinMinePayload, clientInfo);
      break;

    case 'hashrate':
      handleHashrate(ws, message.payload as HashratePayload, clientInfo);
      break;

    case 'submit':
      await handleSubmit(ws, message.payload as ProofSubmission, clientInfo);
      break;

    case 'stats':
      sendMessage(ws, 'stats', getGlobalStats());
      break;

    case 'stake':
      handleStake(ws, message.payload as StakePayload, clientInfo);
      break;

    case 'unstake':
      handleUnstake(ws, message.payload as StakePayload, clientInfo);
      break;

    case 'set_home':
      handleSetHome(ws, message.payload as JoinMinePayload, clientInfo);
      break;

    case 'start_expedition':
      handleStartExpedition(ws, message.payload as ExpeditionPayload, clientInfo);
      break;

    case 'rally_defense':
      handleRallyDefense(ws, message.payload as RallyPayload, clientInfo);
      break;

    default:
      sendError(ws, 'UNKNOWN_TYPE', `Unknown message type: ${message.type}`);
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

  // Initialize game systems
  getMineRegistry();
  getStakeManager();
  getCooldownManager();
  getExpeditionTracker();
  getRaidEngine();

  wss = new WebSocketServer({
    port,
    perMessageDeflate: false,
    maxPayload: 64 * 1024,
  });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const ip = getClientIP(req);
    console.log(`[WS] New connection from ${ip}`);

    const clientInfo: ClientConnection = {
      ip,
      authenticated: false,
    };
    clientConnections.set(ws, clientInfo);

    ws.on('message', (data: RawData) => {
      handleMessage(ws, data, clientInfo).catch((error) => {
        console.error('[WS] Error:', error);
        sendError(ws, 'INTERNAL_ERROR', 'Internal server error');
      });
    });

    ws.on('close', () => handleClose(ws, clientInfo));
    ws.on('error', (err) => console.error(`[WS] Error: ${err.message}`));
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

  await new Promise<void>((resolve) => {
    wss.on('listening', () => {
      console.log(`[Server] WebSocket listening on ws://localhost:${port}`);
      console.log('[Server] Ready for miners!');
      resolve();
    });
  });

  const shutdown = () => {
    console.log('\n[Server] Shutting down...');
    minePoolManagers.forEach((pm) => pm.stop());
    wss.close(() => process.exit(0));
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return wss;
}

export async function stopServer(): Promise<void> {
  minePoolManagers.forEach((pm) => pm.stop());
  if (wss) {
    return new Promise((resolve) => {
      wss.close(() => resolve());
    });
  }
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error('[Server] Failed to start:', error);
    process.exit(1);
  });
}
