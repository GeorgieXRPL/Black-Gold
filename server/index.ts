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
import { PoolManager, TimeoutResult } from './pool/manager';
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
import { initRedisStore, getRedisStore, StoredDiscovery, StoredActivity } from './storage';

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
  | 'discovery_pending'
  | 'raid_result'
  | 'game_event'
  | 'get_activity'
  | 'activity_feed';

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
    const parsed = JSON.parse(str);
    
    // Basic structure validation - must have type and payload
    if (!parsed || typeof parsed !== 'object') {
      console.warn('[WS] Message is not an object');
      return null;
    }
    
    if (!parsed.type || typeof parsed.type !== 'string') {
      console.warn('[WS] Message missing type field');
      return null;
    }
    
    if (parsed.payload === undefined) {
      console.warn('[WS] Message missing payload field');
      return null;
    }
    
    // Log for debugging (remove in production)
    console.log(`[WS] Parsed message: type=${parsed.type}`);
    
    return parsed as WSMessage;
  } catch (err) {
    console.warn('[WS] JSON parse error:', err instanceof Error ? err.message : 'Unknown error');
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
 * Broadcasts to all clients EXCEPT those at a specific mine
 * Used to avoid duplicate notifications when PoolManager already sent to mine
 */
function broadcastToAllExceptMine<T>(mineId: string, type: string, payload: T): void {
  for (const [ws, info] of clientConnections) {
    // Skip clients who are at the excluded mine - they already got the message
    if (info.currentMineId === mineId) continue;
    
    if (ws.readyState === WebSocket.OPEN) {
      sendMessage(ws, type, payload);
    }
  }
}

/**
 * Handles the 'connect' message
 * Payload is pre-validated by Zod schema
 */
async function handleConnect(
  ws: WebSocket,
  payload: ValidatedConnectPayload,
  clientInfo: ClientConnection
): Promise<void> {
  // Payload already validated by Zod - walletAddress and cores are guaranteed valid

  clientInfo.walletAddress = payload.walletAddress;
  clientInfo.authenticated = true;

  // Initialize stake manager state for this wallet
  const stakeManager = getStakeManager();
  stakeManager.getMinerState(payload.walletAddress);

  // Restore home mine from Redis if available
  const restoredHomeMine = await stakeManager.restoreHomeMine(payload.walletAddress);

  // Determine which mine to join (explicit mineId takes priority, then restored home mine)
  const mineToJoin = payload.mineId || restoredHomeMine;
  
  // AUTO-JOIN: Always join a mine if we have one - this ensures the miner is registered
  // This is critical because clients may not send join_mine on reconnection
  if (mineToJoin) {
    console.log(`[WS] Auto-joining mine ${mineToJoin} for ${sanitizeForLog(payload.walletAddress)}`);
    handleJoinMine(ws, { type: 'join_mine', mineId: mineToJoin }, clientInfo);
  } else {
    console.log(`[WS] No mine to join for ${sanitizeForLog(payload.walletAddress)} (no mineId or home mine)`);
  }

  // Send welcome response with global stats and restored home mine
  sendMessage(ws, 'result', {
    success: true,
    message: 'Connected to Black Gold v2',
    mines: MINES.map(m => ({ id: m.id, name: m.name, resource: m.resource })),
    homeMineId: restoredHomeMine || null,
  });

  console.log(`[WS] Client authenticated: ${sanitizeForLog(payload.walletAddress)}${restoredHomeMine ? ` (home: ${restoredHomeMine})` : ''}`);
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
  console.log(`[WS] 📍 JOIN_MINE request:`, {
    mineId: payload.mineId,
    wallet: sanitizeForLog(clientInfo.walletAddress || 'none'),
    authenticated: clientInfo.authenticated,
    previousMine: clientInfo.currentMineId || 'none',
  });
  
  if (!clientInfo.authenticated) {
    console.log(`[WS] ❌ JOIN_MINE rejected - not authenticated`);
    sendError(ws, 'NOT_AUTHENTICATED', 'Must connect first');
    return;
  }

  const registry = getMineRegistry();
  const mine = registry.getMine(payload.mineId);

  if (!mine) {
    console.log(`[WS] ❌ JOIN_MINE rejected - mine not found: ${sanitizeForLog(payload.mineId)}`);
    sendError(ws, 'INVALID_MINE', `Mine ${sanitizeForLog(payload.mineId)} not found`);
    return;
  }

  // Leave current mine if any
  const previousMineId = clientInfo.currentMineId;
  if (previousMineId && previousMineId !== payload.mineId) {
    registry.removeMiner(clientInfo.walletAddress!, 0);
    
    // Notify miners at the previous mine that someone left
    const previousMine = registry.getMine(previousMineId);
    if (previousMine) {
      broadcastToMine(previousMineId, 'miner_left', {
        mineId: previousMineId,
        mineName: previousMine.definition.name,
        minerCount: previousMine.activeMiners.size,
        totalHashrate: previousMine.totalHashrate,
        walletPrefix: clientInfo.walletAddress!.slice(0, 8),
      });
    }
  }

  // Join new mine
  registry.addMiner(clientInfo.walletAddress!, payload.mineId, 0);
  clientInfo.currentMineId = payload.mineId;

  // Get or create pool manager for this mine
  // Each mine has its own pool manager with mine-specific difficulty
  let poolManager = minePoolManagers.get(payload.mineId);
  const isNewPool = !poolManager;
  if (!poolManager) {
    console.log(`[WS] 🆕 Creating NEW PoolManager for mine: ${payload.mineId}`);
    poolManager = new PoolManager(
      {
        onDiscoveryFound: (result) => handleDiscoveryFound(payload.mineId, result),
        onTimeoutWinner: (result) => handleTimeoutWinnerEvent(payload.mineId, result),
        onStatsUpdate: () => {}, // Handled globally
      },
      payload.mineId // Pass mine ID for mine-specific difficulty
    );
    poolManager.start();
    minePoolManagers.set(payload.mineId, poolManager);
  }

  // Register with pool manager
  const walletForLog = sanitizeForLog(clientInfo.walletAddress!) as string;
  console.log(`[WS] 📥 Registering miner ${walletForLog.slice(0, 8)} with PoolManager (pool ${isNewPool ? 'NEW' : 'EXISTING'})`);
  poolManager.handleConnect(ws, {
    walletAddress: clientInfo.walletAddress!,
    cores: 1, // Will be updated with hashrate
  }, clientInfo.ip);

  // Send success response to the joining miner
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

  // Broadcast to ALL miners at this mine (including the one who just joined)
  // so everyone's UI updates immediately with the new miner count
  broadcastToMine(payload.mineId, 'miner_joined', {
    mineId: payload.mineId,
    mineName: mine.definition.name,
    minerCount: mine.activeMiners.size,
    totalHashrate: mine.totalHashrate,
    walletPrefix: clientInfo.walletAddress!.slice(0, 8),
  });

  // ALWAYS assign work to the miner who just joined
  // This ensures they get work immediately when starting to mine
  const target = registry.getMineTarget(payload.mineId);
  poolManager.assignWork(clientInfo.walletAddress!, payload.mineId, target);

  console.log(`[WS] ${sanitizeForLog(clientInfo.walletAddress || '')} joined ${mine.definition.name} (work assigned)`);
}

/**
 * Handles explicit work request from client
 * Called when client reconnects or needs new work after discovery
 */
function handleRequestWork(
  ws: WebSocket,
  clientInfo: ClientConnection
): void {
  if (!clientInfo.authenticated) {
    sendError(ws, 'NOT_AUTHENTICATED', 'Must connect first');
    return;
  }

  if (!clientInfo.currentMineId) {
    sendError(ws, 'NOT_IN_MINE', 'Must join a mine first');
    return;
  }

  const poolManager = minePoolManagers.get(clientInfo.currentMineId);
  if (!poolManager) {
    sendError(ws, 'INVALID_MINE', 'Mine pool not found');
    return;
  }

  const registry = getMineRegistry();
  const target = registry.getMineTarget(clientInfo.currentMineId);

  console.log(`[WS] ${sanitizeForLog(clientInfo.walletAddress || '')} requested work for ${clientInfo.currentMineId}`);
  
  // Assign new work to the miner
  poolManager.assignWork(clientInfo.walletAddress!, clientInfo.currentMineId, target);
}

// Import reward orchestrator for share-based distribution
import { handleNewDiscovery as processDiscoveryRewards } from './game/reward-orchestrator';

/** Extended result type with shares from PoolManager */
interface BarrelResultWithShares extends BarrelResult {
  shares?: Array<{
    walletAddress: string;
    hashSeconds: number;
    sharePercent: number;
    reward: number;
  }>;
  finderBonus?: number;
}

/**
 * Handles discovery found at a mine
 * Called after the 30-second announcement delay completes
 * Uses SHARE-BASED reward distribution for fairness
 */
async function handleDiscoveryFound(mineId: string, result: BarrelResult): Promise<void> {
  const registry = getMineRegistry();
  const raidEngine = getRaidEngine();
  const redisStore = getRedisStore();
  const mine = registry.getMine(mineId);

  if (!mine) return;

  const resource = mine.definition.resource;
  const discoveryEmoji = resource === 'coal' ? '⛏️' : resource === 'gold' ? '🥇' : resource === 'oil' ? '🛢️' : '🥈';

  // Extract shares from extended result (if provided by PoolManager)
  const resultWithShares = result as BarrelResultWithShares;
  const shares = resultWithShares.shares;
  const finderBonus = resultWithShares.finderBonus;

  console.log('═'.repeat(60));
  console.log(`${discoveryEmoji}  ${result.discoveryName || 'DISCOVERY'} #${result.discoveryNumber} at ${mine.definition.name}!`);
  console.log(`   Winner: ${result.winner}`);
  console.log(`   Hash:   ${result.hash.substring(0, 16)}...`);
  if (shares && shares.length > 0) {
    console.log(`   📊 Share-based distribution to ${shares.length} miners`);
  }
  console.log('═'.repeat(60));

  // Process rewards with share-based distribution
  const rewardResult = await processDiscoveryRewards(
    mineId,
    result.winner,
    result.discoveryNumber,
    shares,
    finderBonus
  );
  
  // Update result with calculated rewards
  result.finderShare = rewardResult.finderReward;
  result.vaultShare = rewardResult.vaultReward;
  result.totalReward = rewardResult.totalReward;

  // Update mine state
  registry.recordDiscoveryFound(mineId, result.hash);

  // Store discovery in Redis for persistence
  const storedDiscovery: StoredDiscovery = {
    id: `${mineId}-${result.discoveryNumber}-${Date.now()}`,
    mineId,
    mineName: mine.definition.name,
    resource: mine.definition.resource,
    finderAddress: result.winner,
    finderReward: rewardResult.finderReward,
    vaultReward: rewardResult.vaultReward,
    timestamp: Date.now(),
    hash: result.hash,
  };
  await redisStore.storeDiscovery(storedDiscovery);

  // Also store as global activity (including share info)
  const activity: StoredActivity = {
    id: `activity-discovery-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type: 'discovery',
    mineId,
    mineName: mine.definition.name,
    walletAddress: result.winner,
    details: {
      discoveryNumber: result.discoveryNumber,
      discoveryName: result.discoveryName,
      finderReward: rewardResult.finderReward,
      hash: result.hash.substring(0, 16),
      totalContributors: rewardResult.minerPayouts.length,
    },
    timestamp: Date.now(),
  };
  await redisStore.storeActivity(activity);

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

  // FALLBACK BROADCAST: Send discovery_found via clientConnections
  // This ensures miners receive the notification even if PoolManager's state.miners is out of sync
  console.log(`[WS] 📡 FALLBACK: Broadcasting discovery_found via clientConnections for ${mineId}`);
  broadcastToMine(mineId, 'discovery_found', {
    discoveryNumber: result.discoveryNumber,
    discoveryName: result.discoveryName,
    mineId,
    mineName: mine.definition.name,
    resource: mine.definition.resource,
    winner: result.winner,
    totalReward: result.totalReward,
    finderShare: result.finderShare,
    vaultShare: result.vaultShare,
    announcement: true,
    message: `🏆 ${result.winner.slice(0, 8)}...${result.winner.slice(-4)} found the discovery!`,
  });
  
  // NOTE: Do NOT send round_restart immediately here!
  // The discovery_found popup should stay visible for 5-8 seconds.
  // round_restart will be sent by PoolManager after the new round starts.
  // Sending it immediately would close the popup before users can see it.
  console.log(`[WS] 📡 FALLBACK: Discovery broadcast complete for ${mineId} (round_restart will come from PoolManager)`);

  // Also broadcast to OTHER mines for global activity feed
  broadcastToAllExceptMine(mineId, 'game_event', {
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
 * Handles timeout winner event - fallback broadcast via clientConnections
 * Called by PoolManager when a round times out
 */
async function handleTimeoutWinnerEvent(mineId: string, result: TimeoutResult): Promise<void> {
  const registry = getMineRegistry();
  const mine = registry.getMine(mineId);

  if (!mine) return;

  console.log(`[WS] 📡 FALLBACK: Broadcasting timeout_winner via clientConnections for ${mineId}`);
  console.log(`[WS] Timeout winner: ${result.winner || 'No winner'}, rollover: ${result.rolloverAmount}`);
  
  // Broadcast timeout_winner via clientConnections (fallback)
  broadcastToMine(mineId, 'timeout_winner', {
    mineId,
    mineName: result.mineName,
    resource: result.resource,
    winner: result.winner,
    winnerHash: result.winnerHash,
    totalReward: result.totalReward,
    finderShare: result.finderShare,
    vaultShare: result.vaultShare,
    rolloverAmount: result.rolloverAmount,
    participantCount: result.participantCount,
    shares: result.shares,
    nextRoundIn: result.nextRoundIn,
  });
  
  // NOTE: Do NOT send round_restart immediately here!
  // The timeout_winner popup should stay visible for nextRoundIn seconds.
  // round_restart will be sent by PoolManager.startNewRound() after the delay.
  // Sending it immediately would close the popup before users can see it.
  
  // Broadcast to OTHER mines for global activity feed
  broadcastToAllExceptMine(mineId, 'game_event', {
    type: 'timeout_winner',
    mineId,
    mineName: result.mineName,
    targetMine: result.mineName,
    targetResource: result.resource,
    resource: result.resource,
    winner: result.winner,
    finderShare: result.finderShare,
    rolloverAmount: result.rolloverAmount,
  });
  
  console.log(`[WS] 📡 FALLBACK: All timeout broadcasts complete for ${mineId}`);
}

// Track last known hashrate and recalculation time per mine for dynamic difficulty
const lastMineHashrates: Map<string, number> = new Map();
const lastDifficultyRecalc: Map<string, number> = new Map();
const DIFFICULTY_RECALC_INTERVAL_MS = 10_000; // Minimum 10 seconds between recalcs
const HASHRATE_CHANGE_THRESHOLD = 0.20; // 20% change triggers recalc

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
  const mineId = clientInfo.currentMineId;
  const poolManager = minePoolManagers.get(mineId);

  if (!poolManager) return;

  // Get effective hashrate with stake multiplier
  const effectiveHashrate = stakeManager.getEffectiveHashrate(
    clientInfo.walletAddress!,
    payload.hashrate,
    mineId
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

  // Dynamic difficulty adjustment based on actual network hashrate
  const mine = registry.getMine(mineId);
  if (!mine) return;

  const currentTotalHashrate = mine.totalHashrate;
  const lastHashrate = lastMineHashrates.get(mineId) || 0;
  const lastRecalcTime = lastDifficultyRecalc.get(mineId) || 0;
  const now = Date.now();

  // Check if enough time has passed and hashrate changed significantly
  const timeSinceLastRecalc = now - lastRecalcTime;
  const hashrateChange = lastHashrate > 0 
    ? Math.abs(currentTotalHashrate - lastHashrate) / lastHashrate 
    : 1; // First update always triggers recalc

  if (timeSinceLastRecalc >= DIFFICULTY_RECALC_INTERVAL_MS && hashrateChange >= HASHRATE_CHANGE_THRESHOLD) {
    console.log(
      `[Difficulty] Hashrate changed ${(hashrateChange * 100).toFixed(1)}% at ${mine.definition.name}: ` +
      `${lastHashrate.toLocaleString()} → ${currentTotalHashrate.toLocaleString()} H/s`
    );

    // Recalculate difficulty
    registry.recalculateMineDifficulty(mineId);
    
    // Update tracking
    lastMineHashrates.set(mineId, currentTotalHashrate);
    lastDifficultyRecalc.set(mineId, now);

    // Broadcast new target to all miners at this mine
    const newTarget = registry.getMineTarget(mineId);
    if (newTarget) {
      broadcastDifficultyUpdate(mineId, newTarget, mine.difficulty);
    }
  }
}

/**
 * Broadcast difficulty update to all miners at a mine
 * Invalidates all old work to prevent easy solutions from being accepted
 */
function broadcastDifficultyUpdate(mineId: string, newTarget: string, newDifficulty: number): void {
  const poolManager = minePoolManagers.get(mineId);
  if (!poolManager) return;

  const miners = poolManager.getAllMiners();
  
  console.log(
    `[Difficulty] Broadcasting new target to ${miners.length} miners at mine ${mineId}: ` +
    `difficulty=${newDifficulty.toLocaleString()}, target=${newTarget.substring(0, 12)}...`
  );

  // IMPORTANT: Invalidate all old work before assigning new work
  // This prevents miners from submitting solutions found with easier targets
  poolManager.invalidateAllWork();

  // Send updated difficulty info and new work to all miners
  miners.forEach(miner => {
    sendMessage(miner.ws, 'game_event', {
      type: 'difficulty_update',
      mineId,
      difficulty: newDifficulty,
      target: newTarget,
      message: 'Difficulty adjusted - new work assigned',
    });

    // Assign new work with updated target
    poolManager.assignWork(miner.walletAddress, mineId, newTarget);
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

  // Check if mining is paused (pending discovery announcement)
  if (poolManager.isMiningPaused()) {
    const countdown = poolManager.getAnnouncementCountdown();
    sendMessage(ws, 'result', {
      success: false,
      message: `Mining paused - winner announcement in ${Math.ceil((countdown || 0) / 1000)}s`,
      paused: true,
      countdown,
    });
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

  // FALLBACK BROADCAST: If proof was accepted (discovery found), 
  // also broadcast via clientConnections in case PoolManager's state.miners is out of sync
  if (success) {
    const registry = getMineRegistry();
    const mine = registry.getMine(clientInfo.currentMineId);
    if (mine) {
      console.log(`[WS] 📡 FALLBACK: Broadcasting discovery_pending via clientConnections for ${clientInfo.currentMineId}`);
      const announceAt = Date.now() + 30000; // 30 second delay
      broadcastToMine(clientInfo.currentMineId, 'discovery_pending', {
        mineId: clientInfo.currentMineId,
        mineName: mine.definition.name,
        resource: mine.definition.resource,
        announceAt,
        countdownSeconds: 30,
        message: '⛏️ A discovery has been found! Winner will be revealed in 30 seconds...',
      });
      console.log(`[WS] 📡 FALLBACK: discovery_pending broadcast complete`);
    }
  }
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
 * Handles request for activity feed (hydrates client on load/reconnect)
 */
async function handleGetActivity(ws: WebSocket): Promise<void> {
  const redisStore = getRedisStore();
  
  if (!redisStore.isAvailable()) {
    // Return empty activity if Redis is not available
    sendMessage(ws, 'activity_feed', { activities: [], source: 'memory' });
    return;
  }

  try {
    const activities = await redisStore.getGlobalActivity(50);
    sendMessage(ws, 'activity_feed', { activities, source: 'redis' });
    console.log(`[WS] Sent ${activities.length} activities from Redis`);
  } catch (error) {
    console.error('[WS] Failed to get activity feed:', error);
    sendMessage(ws, 'activity_feed', { activities: [], source: 'error' });
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

  // Rate limit check - exempt high-frequency and essential message types
  // hashrate: sent every second per worker (3 workers = 180/min)
  // stats: informational queries
  // join_mine: essential for getting work after reconnection
  // leave_mine: cleanup, no abuse potential
  // connect: authentication, essential for session
  // set_home: user preference, low frequency
  // request_work: essential for mining continuation
  const RATE_LIMIT_EXEMPT_TYPES = ['hashrate', 'stats', 'join_mine', 'leave_mine', 'connect', 'set_home', 'request_work'];
  
  if (!RATE_LIMIT_EXEMPT_TYPES.includes(message.type)) {
    const rateLimitResult = rateLimiter.check(clientInfo.ip, message.type);
    if (!rateLimitResult.allowed) {
      sendError(ws, 'RATE_LIMITED', rateLimitResult.error || 'Too many requests');
      return;
    }
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
      await handleConnect(ws, validation.data as ValidatedConnectPayload, clientInfo);
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

    case 'get_activity':
      await handleGetActivity(ws);
      break;

    case 'request_work':
      handleRequestWork(ws, clientInfo);
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
    const previousMineId = clientInfo.currentMineId;
    
    registry.removeMiner(clientInfo.walletAddress, 0);

    if (previousMineId) {
      const poolManager = minePoolManagers.get(previousMineId);
      // Pass the WebSocket to handleDisconnect to prevent race conditions
      // when a miner reconnects and the old WS close event fires after the new connection
      poolManager?.handleDisconnect(clientInfo.walletAddress, ws);
      
      // Broadcast miner_left to remaining miners at the mine
      const mine = registry.getMine(previousMineId);
      if (mine) {
        broadcastToMine(previousMineId, 'miner_left', {
          mineId: previousMineId,
          mineName: mine.definition.name,
          minerCount: mine.activeMiners.size,
          totalHashrate: mine.totalHashrate,
          walletPrefix: clientInfo.walletAddress.slice(0, 8),
        });
      }
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

  // Initialize Redis for persistence (gracefully degrades if unavailable)
  await initRedisStore();

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

  // Broadcast round status every 5 seconds (for timeout system)
  setInterval(() => {
    minePoolManagers.forEach((pm, mineId) => {
      const roundStatus = pm.getRoundStatus();
      broadcastToMine(mineId, 'round_status', {
        mineId,
        ...roundStatus,
      });
    });
  }, 5000);

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
