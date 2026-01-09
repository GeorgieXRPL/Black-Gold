/**
 * @fileoverview Mining state management hook for Black Gold
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
  
  const workersRef = useRef<Worker[]>([]);
  const currentWorkRef = useRef<WorkUnit | null>(null);
  const workersReadyRef = useRef<number>(0);
  const hashratesRef = useRef<Map<number, number>>(new Map());
  
  const [status, setStatus] = useState<MiningStatus>('idle');
  const [hashrate, setHashrate] = useState(0);
  const [totalHashes, setTotalHashes] = useState(0);
  const [workersReady, setWorkersReady] = useState(0);

  /**
   * Create and initialize workers
   */
  const initWorkers = useCallback(() => {
    console.log(`[Mining] Initializing ${cores} workers...`);
    
    // Clean up existing workers
    workersRef.current.forEach(worker => worker.terminate());
    workersRef.current = [];
    workersReadyRef.current = 0;
    hashratesRef.current = new Map();
    setWorkersReady(0);
    
    // Check if we're in a browser environment
    if (typeof window === 'undefined') {
      console.warn('[Mining] Cannot create workers - not in browser environment');
      return;
    }
    
    // Create new workers
    for (let i = 0; i < cores; i++) {
      try {
        const worker = new Worker(
          new URL('../workers/miner.worker.ts', import.meta.url)
        );
        
        worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
          const message = event.data;
          
          switch (message.type) {
            case 'ready':
              console.log(`[Mining] Worker ${i} ready`);
              workersReadyRef.current++;
              setWorkersReady(workersReadyRef.current);
              break;
              
            case 'hashrate':
              // Store per-worker hashrate
              hashratesRef.current.set(i, message.hashrate || 0);
              
              // Calculate total hashrate from all workers
              let totalRate = 0;
              hashratesRef.current.forEach(rate => totalRate += rate);
              
              setHashrate(totalRate);
              onHashrate?.(totalRate);
              setTotalHashes(prev => prev + (message.hashCount || 0));
              
              console.log(`[Mining] Worker ${i} hashrate: ${message.hashrate} H/s, Total: ${totalRate} H/s`);
              break;
              
            case 'solution':
              console.log(`[Mining] Worker ${i} found solution!`, {
                workId: message.workId,
                nonce: message.nonce,
                hash: message.hash?.slice(0, 16) + '...'
              });
              if (message.workId && message.nonce !== undefined && message.hash) {
                onSolution?.(message.workId, message.nonce, message.hash);
              }
              break;
              
            case 'complete':
              console.log(`[Mining] Worker ${i} completed work range`);
              // Worker finished its range without finding solution
              // In a real implementation, request new work from pool
              break;
          }
        };
        
        worker.onerror = (error) => {
          console.error(`[Mining] Worker ${i} error:`, error.message, error);
        };
        
        workersRef.current.push(worker);
        console.log(`[Mining] Worker ${i} created`);
      } catch (error) {
        console.error(`[Mining] Failed to create worker ${i}:`, error);
      }
    }
    
    console.log(`[Mining] Created ${workersRef.current.length}/${cores} workers`);
  }, [cores, onHashrate, onSolution]);

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
    
    if (workersRef.current.length < cores) {
      console.warn(`[Mining] Only ${workersRef.current.length}/${cores} workers available`);
    }
    
    currentWorkRef.current = work;
    setStatus('mining');
    hashratesRef.current = new Map(); // Reset hashrates
    
    const activeWorkers = workersRef.current.length;
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
  }, [cores, initWorkers]);

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

  // Initialize workers on mount
  useEffect(() => {
    initWorkers();
    
    return () => {
      workersRef.current.forEach(worker => worker.terminate());
      workersRef.current = [];
    };
  }, [initWorkers]);

  return {
    status,
    hashrate,
    totalHashes,
    workersReady,
    workersCount: workersRef.current.length,
    startMining,
    stopMining,
    pauseMining,
    resumeMining,
  };
}
