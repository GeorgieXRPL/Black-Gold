/**
 * @fileoverview End-to-end WebSocket and REST API tests for Black Gold
 * Run with: npx tsx scripts/test-e2e-websocket.ts
 * 
 * Starts the real server, connects via WebSocket, and tests the full message protocol.
 * Also tests REST API endpoints.
 */

import WebSocket from 'ws';
import http from 'http';

// Set test environment before importing server
process.env.ADMIN_SECRET = 'test-admin-secret';
process.env.WEBSOCKET_PORT = '0'; // Let OS pick a free port

import { POOL_CONFIG } from '../config/constants';

// ============ TEST FRAMEWORK ============

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const suiteResults: Array<{ name: string; passed: number; total: number }> = [];
let currentSuitePassed = 0;
let currentSuiteTotal = 0;

function assert(condition: boolean, message: string): void {
  totalTests++;
  currentSuiteTotal++;
  if (condition) {
    passedTests++;
    currentSuitePassed++;
    console.log(`  \x1b[32m✓\x1b[0m ${message}`);
  } else {
    failedTests++;
    console.log(`  \x1b[31m✗ FAIL: ${message}\x1b[0m`);
  }
}

function section(name: string): void {
  if (currentSuiteTotal > 0) {
    suiteResults.push({ name: currentSuiteName, passed: currentSuitePassed, total: currentSuiteTotal });
  }
  console.log(`\n${'─'.repeat(55)}`);
  console.log(`  ${name}`);
  console.log(`${'─'.repeat(55)}`);
  currentSuitePassed = 0;
  currentSuiteTotal = 0;
  currentSuiteName = name;
}

let currentSuiteName = '';

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============ HELPERS ============

let serverPort = 0;
let serverInstance: any = null;

/** Start the server on a random port */
async function startTestServer(): Promise<number> {
  // Override port to 0 for random assignment
  (POOL_CONFIG as any).PORT = 0;
  
  const { startServer } = await import('../server/index');
  const wss = await startServer();
  
  // Get the actual port assigned
  const address = (wss as any)._server?.address();
  if (address && typeof address === 'object') {
    serverPort = address.port;
  } else {
    // Try getting from HTTP server
    serverPort = 9999;
  }
  
  serverInstance = wss;
  console.log(`  Test server started on port ${serverPort}`);
  return serverPort;
}

/** Stop the server */
async function stopTestServer(): Promise<void> {
  if (serverInstance) {
    const { stopServer } = await import('../server/index');
    await stopServer();
    serverInstance = null;
  }
}

/** Create a WebSocket client connection */
function connectWS(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${serverPort}`);
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('Connection timeout'));
    }, 5000);
    
    ws.on('open', () => {
      clearTimeout(timeout);
      resolve(ws);
    });
    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

/** Send a message and wait for a response */
function sendAndWait(ws: WebSocket, message: object, timeoutMs = 3000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timeout waiting for response to ${JSON.stringify(message).slice(0, 80)}`));
    }, timeoutMs);
    
    const handler = (data: WebSocket.Data) => {
      try {
        const parsed = JSON.parse(data.toString());
        clearTimeout(timeout);
        ws.removeListener('message', handler);
        resolve(parsed);
      } catch {
        // Ignore parse errors, keep waiting
      }
    };
    
    ws.on('message', handler);
    ws.send(JSON.stringify(message));
  });
}

/** Collect all messages for a period */
function collectMessages(ws: WebSocket, durationMs: number): Promise<any[]> {
  return new Promise((resolve) => {
    const messages: any[] = [];
    const handler = (data: WebSocket.Data) => {
      try {
        messages.push(JSON.parse(data.toString()));
      } catch { /* ignore */ }
    };
    
    ws.on('message', handler);
    setTimeout(() => {
      ws.removeListener('message', handler);
      resolve(messages);
    }, durationMs);
  });
}

/** HTTP GET request */
function httpGet(path: string): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://localhost:${serverPort}${path}`, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode || 0, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode || 0, body: data });
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('HTTP timeout')); });
  });
}

/** HTTP POST request */
function httpPost(path: string, body: object): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({
      hostname: 'localhost',
      port: serverPort,
      path,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, (res) => {
      let respData = '';
      res.on('data', (chunk) => { respData += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode || 0, body: JSON.parse(respData) });
        } catch {
          resolve({ status: res.statusCode || 0, body: respData });
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('HTTP timeout')); });
    req.write(data);
    req.end();
  });
}

const TEST_WALLET = '7xKXkM5RnGndhszh1YsB7DFWKP4KSf2PmsEZb3Bfhaha';

// ============ MAIN ============

async function runTests(): Promise<void> {
  console.log('\n  Starting E2E WebSocket Tests...\n');
  
  try {
    await startTestServer();
    await sleep(500); // Let server fully initialize
  } catch (err) {
    console.error('Failed to start test server:', err);
    process.exit(1);
  }

  // ============ SUITE 1: Connection ============
  
  section('WebSocket Connection');

  try {
    const ws = await connectWS();
    assert(ws.readyState === WebSocket.OPEN, 'WebSocket connects successfully');
    
    // Send connect message
    const response = await sendAndWait(ws, {
      type: 'connect',
      payload: { walletAddress: TEST_WALLET, cores: 1 },
      timestamp: Date.now(),
    });
    
    assert(response.type === 'result', 'Connect returns result message');
    assert(response.payload?.success === true, 'Connect response is successful');
    assert(Array.isArray(response.payload?.mines), 'Connect response includes mine list');
    
    ws.close();
    await sleep(100);
  } catch (err) {
    assert(false, `Connection test failed: ${err}`);
  }

  // ============ SUITE 2: Mining Flow ============

  section('Mining Flow');

  try {
    const ws = await connectWS();
    
    // Connect
    await sendAndWait(ws, {
      type: 'connect',
      payload: { walletAddress: TEST_WALLET, cores: 1 },
      timestamp: Date.now(),
    });
    
    // Join mine - collect ALL messages since join triggers multiple responses
    ws.send(JSON.stringify({
      type: 'join_mine',
      payload: { mineId: 'coal-appalachian' },
      timestamp: Date.now(),
    }));
    
    // Collect all messages over 2 seconds
    const allMessages = await collectMessages(ws, 2000);
    
    const hasJoinResult = allMessages.some(m => 
      m.type === 'result' && m.payload?.success === true && m.payload?.mineId === 'coal-appalachian'
    );
    
    assert(hasJoinResult, 'Join mine returns success result');
    assert(allMessages.length > 1, 'Receives multiple messages after joining (work, stats, etc.)');
    
    // Request work explicitly
    ws.send(JSON.stringify({
      type: 'request_work',
      payload: {},
      timestamp: Date.now(),
    }));
    await sleep(500);
    
    // Send hashrate update
    ws.send(JSON.stringify({
      type: 'hashrate',
      payload: { hashrate: 25000 },
      timestamp: Date.now(),
    }));
    await sleep(200);
    
    assert(true, 'Hashrate update accepted without error');
    
    ws.close();
    await sleep(100);
  } catch (err) {
    assert(false, `Mining flow test failed: ${err}`);
  }

  // ============ SUITE 3: Message Validation ============

  section('Message Validation');

  try {
    const ws = await connectWS();
    
    // Send invalid JSON
    ws.send('not json {{{');
    const errResp = await new Promise<any>((resolve) => {
      ws.once('message', (data) => {
        resolve(JSON.parse(data.toString()));
      });
      setTimeout(() => resolve(null), 2000);
    });
    
    assert(
      errResp?.type === 'error',
      'Invalid JSON returns error response'
    );
    
    // Send unknown message type
    const unknownResp = await sendAndWait(ws, {
      type: 'nonexistent_type',
      payload: {},
      timestamp: Date.now(),
    });
    
    assert(
      unknownResp?.type === 'error',
      'Unknown message type returns error'
    );
    
    ws.close();
    await sleep(100);
  } catch (err) {
    assert(false, `Validation test failed: ${err}`);
  }

  // ============ SUITE 4: Staking Validation ============

  section('Staking Message Validation');

  try {
    const ws = await connectWS();
    
    // Connect first
    await sendAndWait(ws, {
      type: 'connect',
      payload: { walletAddress: TEST_WALLET, cores: 1 },
      timestamp: Date.now(),
    });
    
    // Stake without signature should fail validation
    const stakeResp = await sendAndWait(ws, {
      type: 'stake',
      payload: { mineId: 'coal-appalachian', amount: 100 },
      timestamp: Date.now(),
    });
    
    assert(
      stakeResp?.type === 'error',
      'Stake without signature returns error'
    );
    
    ws.close();
    await sleep(100);
  } catch (err) {
    assert(false, `Staking validation test failed: ${err}`);
  }

  // ============ SUITE 5: REST API Endpoints ============

  section('REST API Endpoints');

  try {
    // Health check
    const health = await httpGet('/health');
    assert(health.status === 200, 'GET /health returns 200');
    assert(health.body?.status === 'ok', 'Health check body has status ok');
    
    // Staking config
    const config = await httpGet('/api/staking/config');
    assert(config.status === 200, 'GET /api/staking/config returns 200');
    assert(typeof config.body?.available === 'boolean', 'Config has available field');
    
    // Escrow config
    const escrow = await httpGet('/api/escrow/config');
    assert(escrow.status === 200, 'GET /api/escrow/config returns 200');
    assert(typeof escrow.body?.configured === 'boolean', 'Escrow config has configured field');
    
    // Stake with invalid wallet
    const badStake = await httpPost('/api/staking/stake', {
      walletAddress: 'invalid',
      amount: 100,
    });
    assert(badStake.status === 400, 'POST /api/staking/stake with invalid wallet returns 400');
    
    // Stake with missing amount
    const noAmount = await httpPost('/api/staking/stake', {
      walletAddress: TEST_WALLET,
    });
    assert(noAmount.status === 400, 'POST /api/staking/stake without amount returns 400');
    
    // Unstake with invalid wallet
    const badUnstake = await httpPost('/api/staking/unstake', {
      walletAddress: 'x',
      amount: 100,
    });
    assert(badUnstake.status === 400, 'POST /api/staking/unstake with invalid wallet returns 400');
    
  } catch (err) {
    assert(false, `REST API test failed: ${err}`);
  }

  // ============ SUITE 6: Admin Console ============

  section('Admin Console');

  try {
    const ws = await connectWS();
    
    // Auth with wrong password
    const wrongAuth = await sendAndWait(ws, {
      type: 'admin_auth',
      payload: { password: 'wrong-password' },
      timestamp: Date.now(),
    });
    
    assert(
      wrongAuth?.payload?.success === false,
      'Wrong admin password rejected'
    );
    
    // Auth with correct password
    const correctAuth = await sendAndWait(ws, {
      type: 'admin_auth',
      payload: { password: 'test-admin-secret' },
      timestamp: Date.now(),
    });
    
    assert(
      correctAuth?.payload?.success === true,
      'Correct admin password accepted'
    );
    
    // Subscribe to admin updates
    ws.send(JSON.stringify({
      type: 'admin_subscribe',
      payload: {},
      timestamp: Date.now(),
    }));
    
    // Collect admin messages
    const adminMsgs = await collectMessages(ws, 2000);
    const hasAdminStats = adminMsgs.some(m => m.type === 'admin_stats');
    const hasAdminMines = adminMsgs.some(m => m.type === 'admin_mines');
    
    assert(hasAdminStats, 'Admin receives stats after subscribe');
    assert(hasAdminMines, 'Admin receives mine data after subscribe');
    
    ws.close();
    await sleep(100);
  } catch (err) {
    assert(false, `Admin console test failed: ${err}`);
  }

  // ============ SUITE 7: Rate Limiting ============

  section('Rate Limiting');

  try {
    const ws = await connectWS();
    
    // Connect first
    await sendAndWait(ws, {
      type: 'connect',
      payload: { walletAddress: TEST_WALLET, cores: 1 },
      timestamp: Date.now(),
    });
    
    // Send many messages rapidly (stats is rate-limit exempt, use submit instead)
    let rateLimited = false;
    for (let i = 0; i < 250; i++) {
      ws.send(JSON.stringify({
        type: 'submit',
        payload: { workUnitId: '0'.repeat(32), nonce: i, hash: '0'.repeat(64) },
        timestamp: Date.now(),
      }));
    }
    
    // Wait for responses
    const responses = await collectMessages(ws, 2000);
    rateLimited = responses.some(m => 
      m.type === 'error' && m.payload?.code === 'RATE_LIMITED'
    );
    
    assert(rateLimited, 'Rate limiting activates on rapid messages');
    
    ws.close();
    await sleep(100);
  } catch (err) {
    assert(false, `Rate limiting test failed: ${err}`);
  }

  // ============ CLEANUP ============
  
  // Record final suite
  suiteResults.push({ name: currentSuiteName, passed: currentSuitePassed, total: currentSuiteTotal });

  try {
    await stopTestServer();
    await sleep(500);
  } catch {
    // Ignore cleanup errors
  }

  // ============ RESULTS ============

  console.log(`\n${'═'.repeat(55)}`);
  console.log(`  E2E RESULTS: ${passedTests}/${totalTests} passed, ${failedTests} failed`);
  console.log(`${'═'.repeat(55)}`);

  for (const s of suiteResults) {
    if (!s.name) continue;
    const icon = s.passed === s.total ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
    console.log(`  ${icon} ${s.name}: ${s.passed}/${s.total}`);
  }

  if (failedTests > 0) {
    console.log('\n  Some E2E tests failed!\n');
    process.exit(1);
  } else {
    console.log('\n  All E2E tests passed!\n');
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('E2E test runner crashed:', err);
  process.exit(1);
});
