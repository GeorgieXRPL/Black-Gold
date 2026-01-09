/**
 * @fileoverview Mining state management hook for Black Gold
 * Fixed: Stabilized worker initialization to prevent multiple re-initializations
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
 * Custom hook for managing CPU mining workers
 */
export function useMining(options: UseMiningOptions): UseMiningReturn {
  const { cores, onHashrate, onSolution } = options;
  
  // Refs for workers and state that shouldn't trigger re-renders
  const workersRef = useRef<Worker[]>([]);
  const currentWorkRef = useRef<WorkUnit | null>(null);
  const workersReadyRef = useRef<number>(0);
  const hashratesRef = useRef<Map<number, number>>(new Map());
  const isInitializedRef = useRef<boolean>(false);
  const isInitializingRef = useRef<boolean>(false);
  const coresRef = useRef<number>(cores);
  
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
   * Create and initialize workers
   * Uses refs for callbacks to prevent unnecessary re-initializations
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
    console.log(`[Mining] Initializing ${targetCores} workers...`);
    isInitializingRef.current = true;
    
    // Clean up existing workers
    workersRef.current.forEach(worker => worker.terminate());
    workersRef.current = [];
    workersReadyRef.current = 0;
    hashratesRef.current = new Map();
    setWorkersReady(0);
    setWorkersCount(0);
    
    // Create new workers
    for (let i = 0; i < targetCores; i++) {
      try {
        const worker = new Worker(
          new URL('../workers/miner.worker.js', import.meta.url)
        );
        
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
              
              // Only log occasionally to reduce noise
              if (Math.random() < 0.1) {
                console.log(`[Mining] Total hashrate: ${totalRate} H/s`);
              }
              break;
              
            case 'solution':
              console.log(`[Mining] Worker ${workerIndex} found solution!`, {
                workId: message.workId,
                nonce: message.nonce,
                hash: message.hash?.slice(0, 16) + '...'
              });
              if (message.workId && message.nonce !== undefined && message.hash) {
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
        console.log(`[Mining] Worker ${workerIndex} created`);
      } catch (error) {
        console.error(`[Mining] Failed to create worker ${i}:`, error);
      }
    }
    
    setWorkersCount(workersRef.current.length);
    isInitializedRef.current = true;
    isInitializingRef.current = false;
    console.log(`[Mining] Created ${workersRef.current.length}/${targetCores} workers`);
  }, []); // No dependencies - uses refs

  /**
   * Start mining with given work
   */
  const startMining = useCallback((work: WorkUnit) => {
    console.log('[Mining] startMining called with work:', {
      id: work.id,
      discoveryNumber: work.discoveryNumber,
      target: work.target?.slice(0, 16) + '...',
      nonceRange: `[${work.nonceStart}, ${work.nonceEnd})`
    });
    
    if (workersRef.current.length === 0) {
      console.log('[Mining] No workers exist, initializing...');
      initWorkers();
      // Workers need time to initialize - schedule mining start
      setTimeout(() => {
        if (workersRef.current.length > 0) {
          startMining(work);
        } else {
          console.error('[Mining] Failed to initialize workers');
        }
      }, 500);
      return;
    }
    
    const activeWorkers = workersRef.current.length;
    if (activeWorkers < coresRef.current) {
      console.warn(`[Mining] Only ${activeWorkers}/${coresRef.current} workers available`);
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
  }, [initWorkers]);

  /**
   * Stop all mining workers
   */
  const stopMining = useCallback(() => {
    workersRef.current.forEach(worker => {
      worker.postMessage({ type: 'stop' });
    });
    
    currentWorkRef.current = null;
    setStatus('idle');
    setHashrate(0);
    console.log('[Mining] Stopped');
  }, []);

  /**
   * Pause mining
   */
  const pauseMining = useCallback(() => {
    workersRef.current.forEach(worker => {
      worker.postMessage({ type: 'stop' });
    });
    setStatus('paused');
    console.log('[Mining] Paused');
  }, []);

  /**
   * Resume mining with current work
   */
  const resumeMining = useCallback(() => {
    if (currentWorkRef.current) {
      startMining(currentWorkRef.current);
    }
  }, [startMining]);

  // Update cores ref when cores prop changes
  useEffect(() => {
    if (coresRef.current !== cores) {
      console.log(`[Mining] Cores changed from ${coresRef.current} to ${cores}`);
      coresRef.current = cores;
      // Re-initialize workers if already initialized
      if (isInitializedRef.current && !isInitializingRef.current) {
        initWorkers();
      }
    }
  }, [cores, initWorkers]);

  // Initialize workers once on mount
  useEffect(() => {
    if (!isInitializedRef.current && !isInitializingRef.current) {
      initWorkers();
    }
    
    return () => {
      console.log('[Mining] Cleaning up workers...');
      workersRef.current.forEach(worker => worker.terminate());
      workersRef.current = [];
      isInitializedRef.current = false;
    };
  }, [initWorkers]);

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
