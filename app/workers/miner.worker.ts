/**
 * @fileoverview Web Worker for CPU mining
 * Runs SHA-256 computations without blocking the main thread
 */

// Import mining utilities - we'll inline them since workers have module issues
// This is a self-contained worker

/**
 * Convert Uint8Array to hex string
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Compute SHA-256 hash
 */
async function sha256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  return bytesToHex(new Uint8Array(hashBuffer));
}

/**
 * Compute double SHA-256 hash
 */
async function doubleSha256(data: string): Promise<string> {
  const firstHash = await sha256(data);
  return sha256(firstHash);
}

/**
 * Check if hash meets target
 */
function meetsTarget(hash: string, target: string): boolean {
  const normalizedHash = hash.toLowerCase().padStart(64, '0');
  const normalizedTarget = target.toLowerCase().padStart(64, '0');
  return normalizedHash < normalizedTarget;
}

/**
 * Create mining header
 */
function createMiningHeader(barrelHeader: string, nonce: number): string {
  return `${barrelHeader}:${nonce.toString(16).padStart(16, '0')}`;
}

// Worker state
let isRunning = false;
let currentWorkId: string | null = null;
let hashCount = 0;
let lastHashrateUpdate = Date.now();

// Message types
interface StartMessage {
  type: 'start';
  workId: string;
  barrelHeader: string;
  target: string;
  nonceStart: number;
  nonceEnd: number;
}

interface StopMessage {
  type: 'stop';
}

type WorkerMessage = StartMessage | StopMessage;

interface HashrateBroadcast {
  type: 'hashrate';
  hashrate: number;
  hashCount: number;
}

interface SolutionFound {
  type: 'solution';
  workId: string;
  nonce: number;
  hash: string;
}

interface WorkComplete {
  type: 'complete';
  workId: string;
  hashesComputed: number;
}

type WorkerResponse = HashrateBroadcast | SolutionFound | WorkComplete;

/**
 * Main mining loop
 */
async function mine(
  workId: string,
  barrelHeader: string,
  target: string,
  nonceStart: number,
  nonceEnd: number
): Promise<void> {
  isRunning = true;
  currentWorkId = workId;
  hashCount = 0;
  lastHashrateUpdate = Date.now();

  const BATCH_SIZE = 100; // Hashes per batch before checking messages
  const HASHRATE_INTERVAL = 1000; // Report hashrate every second

  for (let nonce = nonceStart; nonce < nonceEnd && isRunning; nonce++) {
    const header = createMiningHeader(barrelHeader, nonce);
    const hash = await doubleSha256(header);
    hashCount++;

    // Check if we found a valid solution
    if (meetsTarget(hash, target)) {
      const response: SolutionFound = {
        type: 'solution',
        workId,
        nonce,
        hash,
      };
      self.postMessage(response);
      isRunning = false;
      return;
    }

    // Report hashrate periodically
    const now = Date.now();
    if (now - lastHashrateUpdate >= HASHRATE_INTERVAL) {
      const elapsed = (now - lastHashrateUpdate) / 1000;
      const hashrate = Math.round(hashCount / elapsed);
      
      const response: HashrateBroadcast = {
        type: 'hashrate',
        hashrate,
        hashCount,
      };
      self.postMessage(response);
      
      hashCount = 0;
      lastHashrateUpdate = now;
    }

    // Yield control periodically
    if (nonce % BATCH_SIZE === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  // Work range complete without finding solution
  if (isRunning) {
    const response: WorkComplete = {
      type: 'complete',
      workId,
      hashesComputed: nonceEnd - nonceStart,
    };
    self.postMessage(response);
  }

  isRunning = false;
  currentWorkId = null;
}

/**
 * Handle incoming messages
 */
self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const message = event.data;

  switch (message.type) {
    case 'start':
      // Stop any existing work
      isRunning = false;
      
      // Start new work
      await mine(
        message.workId,
        message.barrelHeader,
        message.target,
        message.nonceStart,
        message.nonceEnd
      );
      break;

    case 'stop':
      isRunning = false;
      currentWorkId = null;
      break;
  }
};

// Signal that worker is ready
self.postMessage({ type: 'ready' });
