/**
 * @fileoverview Web Worker for CPU mining
 * Pure JavaScript - no TypeScript, no external imports
 * Runs SHA-256 computations without blocking the main thread
 */

// Worker state
let isRunning = false;
let currentWorkId = null;
let hashCount = 0;
let lastHashrateUpdate = Date.now();

/**
 * Convert Uint8Array to hex string
 * @param {Uint8Array} bytes 
 * @returns {string}
 */
function bytesToHex(bytes) {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Compute SHA-256 hash using Web Crypto API
 * @param {string} data 
 * @returns {Promise<string>}
 */
async function sha256(data) {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  return bytesToHex(new Uint8Array(hashBuffer));
}

/**
 * Compute double SHA-256 hash (Bitcoin-style)
 * @param {string} data 
 * @returns {Promise<string>}
 */
async function doubleSha256(data) {
  const firstHash = await sha256(data);
  return sha256(firstHash);
}

/**
 * Check if hash meets difficulty target
 * @param {string} hash 
 * @param {string} target 
 * @returns {boolean}
 */
function meetsTarget(hash, target) {
  const normalizedHash = hash.toLowerCase().padStart(64, '0');
  const normalizedTarget = target.toLowerCase().padStart(64, '0');
  return normalizedHash < normalizedTarget;
}

/**
 * Create mining header from discovery header and nonce
 * @param {string} discoveryHeader 
 * @param {number} nonce 
 * @returns {string}
 */
function createMiningHeader(discoveryHeader, nonce) {
  return `${discoveryHeader}:${nonce.toString(16).padStart(16, '0')}`;
}

/**
 * Main mining loop
 * @param {string} workId 
 * @param {string} discoveryHeader 
 * @param {string} target 
 * @param {number} nonceStart 
 * @param {number} nonceEnd 
 */
async function mine(workId, discoveryHeader, target, nonceStart, nonceEnd) {
  isRunning = true;
  currentWorkId = workId;
  hashCount = 0;
  lastHashrateUpdate = Date.now();

  const BATCH_SIZE = 100; // Hashes per batch before yielding
  const HASHRATE_INTERVAL = 1000; // Report hashrate every second

  for (let nonce = nonceStart; nonce < nonceEnd && isRunning; nonce++) {
    const header = createMiningHeader(discoveryHeader, nonce);
    const hash = await doubleSha256(header);
    hashCount++;

    // Check if we found a valid solution
    if (meetsTarget(hash, target)) {
      self.postMessage({
        type: 'solution',
        workId: workId,
        nonce: nonce,
        hash: hash,
      });
      isRunning = false;
      return;
    }

    // Report hashrate periodically
    const now = Date.now();
    if (now - lastHashrateUpdate >= HASHRATE_INTERVAL) {
      const elapsed = (now - lastHashrateUpdate) / 1000;
      const hashrate = Math.round(hashCount / elapsed);
      
      self.postMessage({
        type: 'hashrate',
        hashrate: hashrate,
        hashCount: hashCount,
      });
      
      hashCount = 0;
      lastHashrateUpdate = now;
    }

    // Yield control periodically to allow message processing
    if (nonce % BATCH_SIZE === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  // Work range complete without finding solution
  if (isRunning) {
    self.postMessage({
      type: 'complete',
      workId: workId,
      hashesComputed: nonceEnd - nonceStart,
    });
  }

  isRunning = false;
  currentWorkId = null;
}

/**
 * Handle incoming messages from main thread
 */
self.onmessage = async function(event) {
  const message = event.data;

  switch (message.type) {
    case 'start':
      // Stop any existing work first
      isRunning = false;
      
      // Start new mining work
      await mine(
        message.workId,
        message.discoveryHeader,
        message.target,
        message.nonceStart,
        message.nonceEnd
      );
      break;

    case 'stop':
      isRunning = false;
      currentWorkId = null;
      break;

    default:
      console.warn('[Worker] Unknown message type:', message.type);
  }
};

// Signal that worker is ready
self.postMessage({ type: 'ready' });
