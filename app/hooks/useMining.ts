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
  
  const [status, setStatus] = useState<MiningStatus>('idle');
  const [hashrate, setHashrate] = useState(0);
  const [totalHashes, setTotalHashes] = useState(0);

  /**
   * Create and initialize workers
   */
  const initWorkers = useCallback(() => {
    // Clean up existing workers
    workersRef.current.forEach(worker => worker.terminate());
    workersRef.current = [];
    
    // Create new workers
    for (let i = 0; i < cores; i++) {
      const worker = new Worker(
        new URL('../workers/miner.worker.ts', import.meta.url)
      );
      
      worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
        const message = event.data;
        
        switch (message.type) {
          case 'ready':
            console.log(`[Mining] Worker ${i} ready`);
            break;
            
          case 'hashrate':
            // Aggregate hashrates from all workers
            setHashrate(prev => {
              const newRate = (prev * (cores - 1) + (message.hashrate || 0)) / cores;
              onHashrate?.(newRate * cores);
              return newRate;
            });
            setTotalHashes(prev => prev + (message.hashCount || 0));
            break;
            
          case 'solution':
            console.log(`[Mining] Worker ${i} found solution!`);
            if (message.workId && message.nonce !== undefined && message.hash) {
              onSolution?.(message.workId, message.nonce, message.hash);
            }
            break;
            
          case 'complete':
            console.log(`[Mining] Worker ${i} completed work range`);
            // Request new work from pool
            break;
        }
      };
      
      worker.onerror = (error) => {
        console.error(`[Mining] Worker ${i} error:`, error);
      };
      
      workersRef.current.push(worker);
    }
    
    console.log(`[Mining] Initialized ${cores} workers`);
  }, [cores, onHashrate, onSolution]);

  /**
   * Start mining with given work
   */
  const startMining = useCallback((work: WorkUnit) => {
    if (workersRef.current.length === 0) {
      initWorkers();
    }
    
    currentWorkRef.current = work;
    setStatus('mining');
    
    const rangeSize = work.nonceEnd - work.nonceStart;
    const rangePerWorker = Math.floor(rangeSize / cores);
    
    workersRef.current.forEach((worker, i) => {
      const workerStart = work.nonceStart + (i * rangePerWorker);
      const workerEnd = i === cores - 1 
        ? work.nonceEnd 
        : workerStart + rangePerWorker;
      
      worker.postMessage({
        type: 'start',
        workId: work.id,
        discoveryHeader: work.discoveryHeader,
        target: work.target,
        nonceStart: workerStart,
        nonceEnd: workerEnd,
      });
    });
    
    console.log(`[Mining] Started mining discovery #${work.discoveryNumber} with ${cores} cores`);
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
    startMining,
    stopMining,
    pauseMining,
    resumeMining,
  };
}
