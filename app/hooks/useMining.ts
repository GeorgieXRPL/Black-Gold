/**
 * @fileoverview Mining state management hook for Black Gold
 * Uses inline blob workers to avoid Turbopack bundling issues
 * Includes worker coordination to stop all workers when one finds a solution
 */

'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import type { WorkUnit } from '../../server/types';

export type MiningStatus = 'idle' | 'mining' | 'paused';

interface WorkerMessage {
  type: 'ready' | 'hashrate' | 'solution' | 'complete';
  hashrate?: number;
  hashCount?: number;
  workId?: string;
  nonce?: number;
  hash?: string;
}

interface UseMiningOptions {
  cores: number;
  onHashrate?: (hashrate: number) => void;
  onSolution?: (workId: string, nonce: number, hash: string) => void;
}

interface UseMiningReturn {
  status: MiningStatus;
  hashrate: number;
  totalHashes: number;
  workersReady: number;
  workersCount: number;
  startMining: (work: WorkUnit) => void;
  stopMining: () => void;
  pauseMining: () => void;
  resumeMining: () => void;
}

/**
 * Inline worker code as a string - eliminates Turbopack bundling issues
 * This code runs in a Web Worker context with no external dependencies
 */
const MINER_WORKER_CODE = `
// Worker state
let isRunning = false;
let currentWorkId = null;
let hashCount = 0;
let lastHashrateUpdate = Date.now();

// Convert Uint8Array to hex string
function bytesToHex(bytes) {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Compute SHA-256 hash using Web Crypto API
async function sha256(data) {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  return bytesToHex(new Uint8Array(hashBuffer));
}

// Compute double SHA-256 hash (Bitcoin-style)
async function doubleSha256(data) {
  const firstHash = await sha256(data);
  return sha256(firstHash);
}

// Check if hash meets difficulty target
function meetsTarget(hash, target) {
  const normalizedHash = hash.toLowerCase().padStart(64, '0');
  const normalizedTarget = target.toLowerCase().padStart(64, '0');
  return normalizedHash < normalizedTarget;
}

// Create mining header from discovery header and nonce
function createMiningHeader(discoveryHeader, nonce) {
  return discoveryHeader + ':' + nonce.toString(16).padStart(16, '0');
}

// Main mining loop
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

// Handle incoming messages from main thread
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
`;

/**
 * Create a worker from inline code using Blob URL
 * This approach works with any bundler (Webpack, Turbopack, Vite, etc.)
 */
function createInlineWorker(): Worker {
  const blob = new Blob([MINER_WORKER_CODE], { type: 'application/javascript' });
  const workerUrl = URL.createObjectURL(blob);
  const worker = new Worker(workerUrl);
  
  // Clean up the blob URL when worker terminates
  worker.addEventListener('error', () => URL.revokeObjectURL(workerUrl));
  
  return worker;
}

/**
 * Custom hook for managing CPU mining workers
 */
export function useMining(options: UseMiningOptions): UseMiningReturn {
  const { cores, onHashrate, onSolution } = options;
  
  // Refs for workers and state that shouldn't trigger re-renders
  const workersRef = useRef<Worker[]>([]);
  const workerUrlsRef = useRef<string[]>([]); // Track blob URLs for cleanup
  const currentWorkRef = useRef<WorkUnit | null>(null);
  const workersReadyRef = useRef<number>(0);
  const hashratesRef = useRef<Map<number, number>>(new Map());
  const isInitializedRef = useRef<boolean>(false);
  const isInitializingRef = useRef<boolean>(false);
  const coresRef = useRef<number>(cores);
  
  // CRITICAL: Track if a solution has been found to stop other workers
  const solutionFoundRef = useRef<boolean>(false);
  
  // Refs for callbacks to prevent re-initialization
  const onHashrateRef = useRef(onHashrate);
  const onSolutionRef = useRef(onSolution);
  
  // Keep callback refs up to date
  useEffect(() => {
    onHashrateRef.current = onHashrate;
  }, [onHashrate]);
  
  useEffect(() => {
    onSolutionRef.current = onSolution;
  }, [onSolution]);
  
  // State for UI updates
  const [status, setStatus] = useState<MiningStatus>('idle');
  const [hashrate, setHashrate] = useState(0);
  const [totalHashes, setTotalHashes] = useState(0);
  const [workersReady, setWorkersReady] = useState(0);
  const [workersCount, setWorkersCount] = useState(0);

  /**
   * Stop all workers immediately
   */
  const stopAllWorkers = useCallback(() => {
    workersRef.current.forEach(worker => {
      worker.postMessage({ type: 'stop' });
    });
  }, []);

  /**
   * Clean up all workers and blob URLs
   */
  const cleanupWorkers = useCallback(() => {
    console.log('[Mining] Cleaning up workers...');
    workersRef.current.forEach(worker => worker.terminate());
    workersRef.current = [];
    
    // Revoke all blob URLs to free memory
    workerUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    workerUrlsRef.current = [];
    
    workersReadyRef.current = 0;
    hashratesRef.current = new Map();
    setWorkersReady(0);
    setWorkersCount(0);
  }, []);

  /**
   * Create and initialize workers using inline blob approach
   */
  const initWorkers = useCallback(() => {
    // Guard against multiple simultaneous initializations
    if (isInitializingRef.current) {
      console.log('[Mining] Already initializing, skipping...');
      return;
    }
    
    // Check if we're in a browser environment
    if (typeof window === 'undefined') {
      console.warn('[Mining] Cannot create workers - not in browser environment');
      return;
    }
    
    const targetCores = coresRef.current;
    console.log(`[Mining] Initializing ${targetCores} inline blob workers...`);
    isInitializingRef.current = true;
    
    // Clean up existing workers
    cleanupWorkers();
    
    // Create new workers using inline blob approach
    for (let i = 0; i < targetCores; i++) {
      try {
        // Create blob URL for worker
        const blob = new Blob([MINER_WORKER_CODE], { type: 'application/javascript' });
        const workerUrl = URL.createObjectURL(blob);
        workerUrlsRef.current.push(workerUrl);
        
        const worker = new Worker(workerUrl);
        const workerIndex = i; // Capture for closure
        
        worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
          const message = event.data;
          
          switch (message.type) {
            case 'ready':
              console.log(`[Mining] Worker ${workerIndex} ready`);
              workersReadyRef.current++;
              setWorkersReady(workersReadyRef.current);
              break;
              
            case 'hashrate':
              // Store per-worker hashrate
              hashratesRef.current.set(workerIndex, message.hashrate || 0);
              
              // Calculate total hashrate from all workers
              let totalRate = 0;
              hashratesRef.current.forEach(rate => totalRate += rate);
              
              setHashrate(totalRate);
              onHashrateRef.current?.(totalRate);
              setTotalHashes(prev => prev + (message.hashCount || 0));
              break;
              
            case 'solution':
              // CRITICAL: Check if another worker already found a solution
              if (solutionFoundRef.current) {
                console.log(`[Mining] Worker ${workerIndex} found solution but another worker already did, ignoring`);
                return;
              }
              
              // Mark solution as found BEFORE doing anything else
              solutionFoundRef.current = true;
              
              console.log(`[Mining] Worker ${workerIndex} found solution!`, {
                workId: message.workId,
                nonce: message.nonce,
                hash: message.hash?.slice(0, 16) + '...'
              });
              
              // IMMEDIATELY stop all other workers
              stopAllWorkers();
              
              // Submit the solution
              if (message.workId && message.nonce !== undefined && message.hash) {
                console.log(`[Mining] Submitting solution from worker ${workerIndex}`);
                onSolutionRef.current?.(message.workId, message.nonce, message.hash);
              }
              break;
              
            case 'complete':
              console.log(`[Mining] Worker ${workerIndex} completed work range`);
              // Worker finished its range without finding solution
              // Pool will send new work automatically
              break;
          }
        };
        
        worker.onerror = (error) => {
          console.error(`[Mining] Worker ${workerIndex} error:`, error.message);
        };
        
        workersRef.current.push(worker);
        console.log(`[Mining] Worker ${workerIndex} created (inline blob)`);
      } catch (error) {
        console.error(`[Mining] Failed to create worker ${i}:`, error);
      }
    }
    
    setWorkersCount(workersRef.current.length);
    isInitializedRef.current = true;
    isInitializingRef.current = false;
    console.log(`[Mining] Created ${workersRef.current.length}/${targetCores} inline blob workers`);
  }, [cleanupWorkers, stopAllWorkers]);

  /**
   * Start mining with given work
   * This will STOP any current work immediately before starting new work
   */
  const startMining = useCallback((work: WorkUnit) => {
    console.log('[Mining] startMining called with work:', {
      id: work.id,
      discoveryNumber: work.discoveryNumber,
      target: work.target?.slice(0, 16) + '...',
      nonceRange: `[${work.nonceStart}, ${work.nonceEnd})`
    });
    
    // CRITICAL: Stop all workers immediately before starting new work
    // This prevents workers from submitting old work after new work arrives
    if (workersRef.current.length > 0) {
      console.log('[Mining] Stopping workers before new work...');
      stopAllWorkers();
    }
    
    // Reset solution found flag for new work
    solutionFoundRef.current = false;
    
    // Check if we need to (re)initialize workers
    const needsInit = !isInitializedRef.current || workersRef.current.length === 0;
    const needsReinit = workersRef.current.length !== coresRef.current;
    
    if (needsInit || needsReinit) {
      const reason = needsInit ? 'no workers' : `worker count mismatch (${workersRef.current.length} vs ${coresRef.current} cores)`;
      console.log(`[Mining] Initializing workers: ${reason}`);
      initWorkers();
      
      // Workers need time to initialize - schedule mining start
      // Use a longer timeout to ensure workers are ready
      setTimeout(() => {
        if (workersRef.current.length > 0 && workersReadyRef.current >= workersRef.current.length) {
          console.log(`[Mining] Workers ready (${workersReadyRef.current}/${workersRef.current.length}), starting work...`);
          distributeWork(work);
        } else if (workersRef.current.length > 0) {
          console.log(`[Mining] Waiting for workers... (${workersReadyRef.current}/${workersRef.current.length} ready)`);
          // Wait a bit more
          setTimeout(() => distributeWork(work), 300);
        } else {
          console.error('[Mining] Failed to initialize workers');
        }
      }, 200);
      return;
    }
    
    // Small delay to ensure workers have processed stop command
    setTimeout(() => distributeWork(work), 10);
  }, [initWorkers, stopAllWorkers]);

  /**
   * Distribute work to existing workers
   */
  const distributeWork = useCallback((work: WorkUnit) => {
    const activeWorkers = workersRef.current.length;
    if (activeWorkers === 0) {
      console.error('[Mining] No workers available to distribute work');
      return;
    }
    
    currentWorkRef.current = work;
    setStatus('mining');
    hashratesRef.current = new Map(); // Reset hashrates
    
    const rangeSize = work.nonceEnd - work.nonceStart;
    const rangePerWorker = Math.floor(rangeSize / activeWorkers);
    
    console.log(`[Mining] Distributing work to ${activeWorkers} workers, ${rangePerWorker} nonces each`);
    
    workersRef.current.forEach((worker, i) => {
      const workerStart = work.nonceStart + (i * rangePerWorker);
      const workerEnd = i === activeWorkers - 1 
        ? work.nonceEnd 
        : workerStart + rangePerWorker;
      
      const message = {
        type: 'start',
        workId: work.id,
        discoveryHeader: work.discoveryHeader,
        target: work.target,
        nonceStart: workerStart,
        nonceEnd: workerEnd,
      };
      
      console.log(`[Mining] Sending work to worker ${i}:`, {
        workId: work.id,
        nonceRange: `[${workerStart}, ${workerEnd})`
      });
      
      worker.postMessage(message);
    });
    
    console.log(`[Mining] Started mining discovery #${work.discoveryNumber} with ${activeWorkers} workers`);
  }, []);

  /**
   * Stop all mining workers
   */
  const stopMining = useCallback(() => {
    console.log('[Mining] Stopping mining...');
    stopAllWorkers();
    
    currentWorkRef.current = null;
    solutionFoundRef.current = false;
    setStatus('idle');
    setHashrate(0);
    console.log('[Mining] Stopped');
  }, [stopAllWorkers]);

  /**
   * Pause mining
   */
  const pauseMining = useCallback(() => {
    stopAllWorkers();
    setStatus('paused');
    console.log('[Mining] Paused');
  }, [stopAllWorkers]);

  /**
   * Resume mining with current work
   */
  const resumeMining = useCallback(() => {
    if (currentWorkRef.current) {
      startMining(currentWorkRef.current);
    }
  }, [startMining]);

  // Update cores ref when cores prop changes
  // But DON'T reinitialize workers while mining - use existing workers
  useEffect(() => {
    if (coresRef.current !== cores) {
      console.log(`[Mining] Cores updated: ${coresRef.current} → ${cores}`);
      coresRef.current = cores;
      // Only reinit if we're idle (not mining)
      // If mining, the change will apply on next startMining call
      if (status === 'idle' && isInitializedRef.current && !isInitializingRef.current) {
        console.log('[Mining] Idle, will reinit workers on next start');
        isInitializedRef.current = false; // Mark for reinit on next start
      }
    }
  }, [cores, status]);

  // DON'T auto-initialize workers on mount
  // Workers are initialized lazily when startMining is first called
  // This prevents the double-init issue when user selects cores
  useEffect(() => {
    return () => {
      console.log('[Mining] Unmounting, cleaning up workers...');
      cleanupWorkers();
      isInitializedRef.current = false;
    };
  }, [cleanupWorkers]);

  return {
    status,
    hashrate,
    totalHashes,
    workersReady,
    workersCount,
    startMining,
    stopMining,
    pauseMining,
    resumeMining,
  };
}
