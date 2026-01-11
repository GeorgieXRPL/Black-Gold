'use client';

/**
 * @fileoverview Main page for Black Gold v2 Interactive Mining Globe
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { MINES, getMineById, MineStats, ResourceType, RESOURCE_COLORS } from './lib/mines';
import { HomeBase, MineDetails, StakingPanel, ExpeditionPanel, RaidFeed, DiscoveryPopup, PendingDiscoveryOverlay, MiningStatus, TimeoutPopup } from './components/game';
import { EmberParticles, WalletEntry, WalletEntryState, CoreSelector } from './components';
import { useGameSocket, GameEvent, WorkUnit } from './hooks/useGameSocket';
import { useMining } from './hooks/useMining';
import { 
  MOCK_EVENTS, 
  DEMO_USER, 
  generateMockMineStats, 
  simulateHashrate,
  USE_MOCK_DATA,
  logMockDataWarning 
} from '../fixtures';

// Dynamic import for Globe to avoid SSR issues with Three.js
const Globe = dynamic(() => import('./components/globe/Globe'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full min-h-[500px] flex items-center justify-center bg-coal-950">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-ember-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <div className="text-coal-400">Loading Globe...</div>
      </div>
    </div>
  ),
});

export default function Home() {
  // Log mock data usage in development
  useEffect(() => {
    logMockDataWarning('Home Page');
  }, []);

  // State - Use demo defaults in mock mode, check localStorage fallback in production
  const [selectedMineId, setSelectedMineId] = useState<string | null>(null);
  const [homeMineId, setHomeMineId] = useState<string | null>(() => {
    if (USE_MOCK_DATA) return DEMO_USER.homeMineId;
    // Try localStorage as fallback until Redis restores it
    if (typeof window !== 'undefined') {
      return localStorage.getItem('blackgold_home_mine');
    }
    return null;
  });
  const [mineStats, setMineStats] = useState<Map<string, MineStats>>(new Map());
  const [isMining, setIsMining] = useState(false);
  const [hashrate, setHashrate] = useState(0);
  const [userStakes, setUserStakes] = useState<Map<string, number>>(
    USE_MOCK_DATA ? new Map(DEMO_USER.stakes) : new Map()
  );
  const [loyaltyDays, setLoyaltyDays] = useState(
    USE_MOCK_DATA ? DEMO_USER.loyaltyDays : 0
  );
  const [showStakingPanel, setShowStakingPanel] = useState(false);
  const [showExpeditionPanel, setShowExpeditionPanel] = useState(false);
  const [showCoreSelector, setShowCoreSelector] = useState(false);
  const [selectedCores, setSelectedCores] = useState<number>(
    typeof navigator !== 'undefined' ? Math.max(1, Math.floor((navigator.hardwareConcurrency || 4) / 2)) : 2
  );
  const [expeditionTarget, setExpeditionTarget] = useState<string | null>(null);
  const [raidEvents, setRaidEvents] = useState(USE_MOCK_DATA ? MOCK_EVENTS : []);
  const [walletState, setWalletState] = useState<WalletEntryState>({
    mode: 'disconnected',
    walletAddress: null,
    displayAddress: null,
    isConnected: false,
    canStake: false,
    canRaid: false,
    tokenBalance: 0,
    isEligible: false,
    verificationLoading: false,
  });

  // Discovery popup state
  const [pendingDiscovery, setPendingDiscovery] = useState<{
    discoveryNumber: number;
    mineName: string;
    resource: string;
    announceAt: number;
  } | null>(null);
  
  const [discoveryPopup, setDiscoveryPopup] = useState<{
    isOpen: boolean;
    isWinner: boolean;
    data: {
      discoveryNumber: number;
      discoveryName: string;
      resource: string;
      mineName: string;
      winner?: string;
      finderReward?: number;
      vaultReward?: number;
      hash?: string;
    } | null;
  }>({ isOpen: false, isWinner: false, data: null });

  // Round status for timeout system
  const [roundStatus, setRoundStatus] = useState<{
    roundStartTime: number | null;
    maxTime: number | null;
    timeRemaining: number | null;
    rolloverAmount: number;
    leaderboard: Array<{ wallet: string; distance: string; submissions: number }>;
  }>({
    roundStartTime: null,
    maxTime: null,
    timeRemaining: null,
    rolloverAmount: 0,
    leaderboard: [],
  });

  // Timeout popup state
  const [timeoutPopup, setTimeoutPopup] = useState<{
    isOpen: boolean;
    isWinner: boolean;
    data: {
      mineId: string;
      mineName: string;
      resource: string;
      winner: string | null;
      winnerHash?: string;
      totalReward: number;
      finderShare: number;
      vaultShare: number;
      rolloverAmount: number;
      participantCount: number;
      shares?: Array<{ walletAddress: string; sharePercent: number; reward: number }>;
      nextRoundIn: number;
    } | null;
  }>({ isOpen: false, isWinner: false, data: null });

  // walletBalance is derived from walletState.tokenBalance (must be after walletState declaration)
  const walletBalance = USE_MOCK_DATA ? DEMO_USER.walletBalance : walletState.tokenBalance;

  // Track current work unit for mining
  const currentWorkRef = useRef<WorkUnit | null>(null);
  const isMiningRef = useRef(isMining);
  
  // Keep ref in sync with state
  useEffect(() => {
    isMiningRef.current = isMining;
  }, [isMining]);

  // WebSocket URL from environment
  const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080';

  // Refs to hold latest callback functions (avoids circular deps)
  const sendHashrateRef = useRef<(rate: number) => void>(() => {});
  const submitProofRef = useRef<(workId: string, nonce: number, hash: string) => void>(() => {});
  const startMiningRef = useRef<(work: WorkUnit) => void>(() => {});

  // Mining web worker hook - defined first
  const mining = useMining({
    cores: selectedCores,
    onHashrate: useCallback((rate: number) => {
      setHashrate(rate);
      sendHashrateRef.current(rate);
      console.log(`[Mining] Hashrate update: ${rate} H/s (${(rate/1000).toFixed(1)} KH/s)`);
    }, []),
    onSolution: useCallback((workId: string, nonce: number, hash: string) => {
      console.log('[Mining] Solution found!', { workId, nonce, hash: hash.slice(0, 16) });
      submitProofRef.current(workId, nonce, hash);
    }, []),
  });

  // Update startMining ref
  useEffect(() => {
    startMiningRef.current = mining.startMining;
  }, [mining.startMining]);

  // Game event handler for raid feed and discovery notifications
  const handleGameEvent = useCallback((event: GameEvent) => {
    console.log('[Game] 📨 Event received:', event.type, {
      eventId: event.id,
      isMining: isMiningRef.current,
      homeMineId,
      walletAddress: walletState.walletAddress?.slice(0, 8),
    });
    
    // Handle discovery pending (30-second countdown)
    if (event.type === 'discovery_pending') {
      const data = event as unknown as {
        discoveryNumber: number;
        mineId: string;
        resource: string;
        announceAt: number;
      };
      const mine = getMineById(data.mineId);
      setPendingDiscovery({
        discoveryNumber: data.discoveryNumber,
        mineName: mine?.name || 'Unknown Mine',
        resource: data.resource || 'coal',
        announceAt: data.announceAt,
      });
      // Pause workers during countdown but DON'T change isMining state
      // This way mining will auto-continue when new work arrives
      if (isMiningRef.current) {
        console.log('[Game] Discovery pending - pausing workers (mining will auto-resume)');
        mining.pauseMining();
        setHashrate(0);
      }
    }
    
    // Handle discovery found (winner revealed)
    if (event.type === 'discovery_found') {
      console.log('[Game] 🎉 DISCOVERY_FOUND event received:', JSON.stringify(event, null, 2));
      
      const data = event as unknown as {
        discoveryNumber: number;
        discoveryName?: string;
        mineId: string;
        mineName?: string;
        resource: string;
        winner: string;
        finderShare?: number;
        vaultShare?: number;
        hash?: string;
        announcement?: boolean;
      };
      
      // Clear pending discovery overlay
      setPendingDiscovery(null);
      
      // Show discovery popup
      const mine = getMineById(data.mineId);
      const isWinner = data.winner === walletState.walletAddress;
      
      console.log('[Game] Discovery popup data:', {
        isWinner,
        winner: data.winner,
        myWallet: walletState.walletAddress,
        mineId: data.mineId,
        mineName: data.mineName || mine?.name,
      });
      
      setDiscoveryPopup({
        isOpen: true,
        isWinner,
        data: {
          discoveryNumber: data.discoveryNumber,
          discoveryName: data.discoveryName || 'Discovery',
          resource: data.resource || 'coal',
          mineName: data.mineName || mine?.name || 'Unknown Mine',
          winner: data.winner,
          finderReward: data.finderShare,
          vaultReward: data.vaultShare,
          hash: data.hash,
        },
      });
      
      console.log('[Game] Discovery popup state SET to isOpen: true');
      
      // Auto-close popup for everyone after a delay - mining continues automatically
      // Winners get 8 seconds to celebrate, non-winners 5 seconds
      const closeDelay = isWinner ? 8000 : 5000;
      setTimeout(() => {
        console.log('[Game] Auto-closing discovery popup');
        setDiscoveryPopup(prev => ({ ...prev, isOpen: false }));
      }, closeDelay);
    }
    
    // Handle round status updates (for timeout system)
    if (event.type === 'round_status') {
      const data = event as unknown as {
        mineId: string;
        roundStartTime: number;
        maxTime: number | null;
        timeRemaining: number | null;
        rolloverAmount: number;
        leaderboard: Array<{ wallet: string; distance: string; submissions: number }>;
      };
      
      // Update if this is for our HOME mine (where we're mining)
      if (data.mineId === homeMineId) {
        setRoundStatus({
          roundStartTime: data.roundStartTime,
          maxTime: data.maxTime,
          timeRemaining: data.timeRemaining,
          rolloverAmount: data.rolloverAmount,
          leaderboard: data.leaderboard,
        });
      }
    }
    
    // Handle timeout winner (round ended by time)
    if (event.type === 'timeout_winner') {
      const data = event as unknown as {
        mineId: string;
        mineName: string;
        resource: string;
        winner: string | null;
        winnerHash?: string;
        totalReward: number;
        finderShare: number;
        vaultShare: number;
        rolloverAmount: number;
        participantCount: number;
        shares?: Array<{ walletAddress: string; sharePercent: number; reward: number }>;
        nextRoundIn: number;
      };
      
      const isWinner = data.winner === walletState.walletAddress;
      
      setTimeoutPopup({
        isOpen: true,
        isWinner,
        data,
      });
      
      // Pause mining during announcement
      if (isMiningRef.current) {
        mining.pauseMining();
        setHashrate(0);
      }
    }
    
    // Handle round restart (mining resuming after discovery/timeout)
    if (event.type === 'round_restart') {
      console.log('[Game] 🔄 ROUND_RESTART event received:', event);
      
      // Close any open popups
      setDiscoveryPopup(prev => ({ ...prev, isOpen: false }));
      setTimeoutPopup(prev => ({ ...prev, isOpen: false }));
      setPendingDiscovery(null);
      
      // Mining will auto-continue when new work arrives (handled in handleWorkReceived)
      console.log('[Game] Round restarting, new work should arrive shortly...');
    }
    
    // Only add relevant events to the activity feed
    // Filter to discoveries and raid events only - not intermediate mining updates
    const feedEventTypes = [
      'discovery_found',
      'timeout_winner',
      'raid_started',
      'raid_won', 
      'raid_lost',
      'jackpot',
      'vault_payout',
      'spoils_distributed'
    ];
    
    if (feedEventTypes.includes(event.type)) {
      console.log('[Game] Adding to activity feed:', event.type, event.id);
      setRaidEvents(prev => {
        // Deduplicate by ID to prevent duplicate notifications
        const exists = prev.some(e => e.id === event.id);
        if (exists) {
          console.log('[Game] Event already in feed, skipping duplicate:', event.id);
          return prev;
        }
        
        return [event as typeof prev[number], ...prev].slice(0, 50);
      });
    }
  }, [isMining, mining, walletState.walletAddress, selectedMineId, homeMineId]);

  // Handle work unit received from server
  const handleWorkReceived = useCallback((work: WorkUnit) => {
    console.log('[Game] 📦 Work received:', {
      id: work.id,
      discoveryNumber: work.discoveryNumber,
      mineId: work.mineId,
      target: work.target?.slice(0, 16) + '...',
      nonceRange: `[${work.nonceStart}, ${work.nonceEnd})`,
      isMiningRef: isMiningRef.current,
    });
    currentWorkRef.current = work;
    
    // If we're supposed to be mining (user hasn't clicked Stop), start with new work
    // This handles both normal mining and auto-resume after discovery
    if (isMiningRef.current) {
      console.log('[Game] ✅ Mining is active (isMiningRef=true), starting work (auto-continue)...');
      startMiningRef.current(work);
    } else {
      console.log('[Game] ⏸️ Mining not active (isMiningRef=false), work stored for later');
    }
  }, []);

  // Handle home mine restoration from server
  const handleHomeMineRestored = useCallback((mineId: string) => {
    console.log('[Game] Home mine restored from server:', mineId);
    setHomeMineId(mineId);
    // Also save to localStorage as backup
    if (typeof window !== 'undefined') {
      localStorage.setItem('blackgold_home_mine', mineId);
    }
  }, []);

  // Game WebSocket connection
  const gameSocket = useGameSocket({
    url: wsUrl,
    walletAddress: walletState.walletAddress,
    cores: typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 4) : 4,
    isMining,  // Pass mining state for reconnection logic
    onEvent: handleGameEvent,
    onWork: handleWorkReceived,
    onHomeMineRestored: handleHomeMineRestored,
  });

  // Update refs with gameSocket functions
  useEffect(() => {
    sendHashrateRef.current = (rate: number) => {
      if (gameSocket.status === 'connected') {
        gameSocket.sendHashrate(rate);
      }
    };
    submitProofRef.current = (workId: string, nonce: number, hash: string) => {
      if (gameSocket.status === 'connected') {
        gameSocket.submitProof(workId, nonce, hash);
      }
    };
  }, [gameSocket]);

  // Handle wallet state changes
  const handleWalletChange = useCallback((state: WalletEntryState) => {
    setWalletState(state);
    // Reset mining when disconnecting
    if (!state.isConnected && isMining) {
      setIsMining(false);
    }
  }, [isMining]);

  // Derived values
  const selectedMine = useMemo(() => 
    selectedMineId ? getMineById(selectedMineId) ?? null : null, 
    [selectedMineId]
  );
  
  const homeMine = useMemo(() => 
    homeMineId ? getMineById(homeMineId) ?? null : null, 
    [homeMineId]
  );

  const selectedMineStats = useMemo(() => 
    selectedMineId ? mineStats.get(selectedMineId) : undefined,
    [selectedMineId, mineStats]
  );

  const homeMineStats = useMemo(() => 
    homeMineId ? mineStats.get(homeMineId) : undefined,
    [homeMineId, mineStats]
  );

  // Initialize mine stats - use mock data in dev, real WebSocket data in production
  useEffect(() => {
    if (USE_MOCK_DATA) {
      // Use mock stats for development/demo
      setMineStats(generateMockMineStats());
    } else {
      // In production, stats come from WebSocket connection
      if (gameSocket.mineStats.size > 0) {
        setMineStats(gameSocket.mineStats);
      }
    }
  }, [gameSocket.mineStats]);

  // Connect to game server when wallet is connected and mine is selected
  useEffect(() => {
    if (!USE_MOCK_DATA && walletState.isConnected && walletState.walletAddress) {
      if (gameSocket.status === 'disconnected') {
        console.log('[Game] Connecting to game server...');
        gameSocket.connect();
      }
    }
  }, [walletState.isConnected, walletState.walletAddress, gameSocket]);

  // Join mine when selected (after connected)
  useEffect(() => {
    if (!USE_MOCK_DATA && gameSocket.status === 'connected' && homeMineId) {
      if (gameSocket.currentMineId !== homeMineId) {
        console.log('[Game] Joining mine:', homeMineId);
        gameSocket.joinMine(homeMineId);
      }
    }
  }, [gameSocket, homeMineId]);

  // Simulate hashrate when mining (mock mode only)
  useEffect(() => {
    if (USE_MOCK_DATA && isMining) {
      const interval = setInterval(() => {
        setHashrate(simulateHashrate(150000));
      }, 1000);
      return () => clearInterval(interval);
    } else if (!isMining) {
      setHashrate(0);
    }
  }, [isMining]);

  // Real hashrate comes from mining hook (non-mock mode)
  useEffect(() => {
    if (!USE_MOCK_DATA) {
      setHashrate(mining.hashrate);
    }
  }, [mining.hashrate]);

  // Handlers
  const handleMineSelect = useCallback((mineId: string) => {
    setSelectedMineId(mineId);
  }, []);

  const handleSetHome = useCallback(() => {
    if (selectedMineId) {
      setHomeMineId(selectedMineId);
      setLoyaltyDays(0);
      // Save to localStorage as backup
      if (typeof window !== 'undefined') {
        localStorage.setItem('blackgold_home_mine', selectedMineId);
      }
      // Send to server to persist in Redis
      if (gameSocket.status === 'connected') {
        gameSocket.setHomeBase(selectedMineId);
      }
    }
  }, [selectedMineId, gameSocket]);

  const handleStartMining = useCallback(() => {
    if (USE_MOCK_DATA) {
      // Mock mode - just toggle state
      setIsMining(prev => !prev);
      return;
    }

    // Real mining mode
    if (isMining) {
      // Stop mining
      console.log('[Mining] Stopping mining...');
      mining.stopMining();
      setIsMining(false);
    } else {
      // Check if home mine is set
      if (!homeMineId) {
        console.warn('[Mining] Cannot start - no home mine set');
        alert('Please select a mine and set it as your Home Base before mining!');
        return;
      }
      // ALWAYS show core selector popup first and return immediately
      // Mining will only start after user confirms in handleCoreSelectConfirm
      console.log('[Mining] Showing core selector popup...');
      setShowCoreSelector(true);
      // IMPORTANT: Do nothing else here - wait for user to select cores
    }
  }, [isMining, mining.stopMining, homeMineId]);

  // Handle core selection confirmation
  const handleCoreSelectConfirm = useCallback((cores: number) => {
    console.log(`[Mining] User confirmed ${cores} cores`);
    
    // Close popup first
    setShowCoreSelector(false);
    
    // Update cores and mark mining as starting
    setSelectedCores(cores);
    setIsMining(true);
    
    // Use setTimeout to ensure React has processed the state updates
    // This gives the useMining hook time to receive the new cores value
    setTimeout(() => {
      // Check WebSocket connection
      if (gameSocket.status !== 'connected') {
        console.warn('[Mining] Not connected to game server, connecting...');
        if (walletState.isConnected && walletState.walletAddress) {
          gameSocket.connect();
        }
        // Mining will start automatically when connected and work received
        return;
      }
      
      console.log('[Mining] Starting mining process...');
      console.log('[Mining] Home mine:', homeMineId);
      console.log('[Mining] Current work:', currentWorkRef.current);
      
      // Request work by joining/rejoining mine
      if (homeMineId) {
        console.log(`[Mining] Joining mine ${homeMineId} to request work...`);
        gameSocket.joinMine(homeMineId);
      }
      
      // If we already have work, start mining immediately
      if (currentWorkRef.current) {
        console.log('[Mining] Starting with existing work...');
        mining.startMining(currentWorkRef.current);
      } else {
        console.log('[Mining] Waiting for work from server...');
      }
    }, 50); // Small delay to let React batch process state updates
  }, [gameSocket, homeMineId, mining, walletState]);

  const handleStake = useCallback((amount: number, signature: string) => {
    if (!selectedMineId) return;
    
    // Log signature for server verification (in production, send to server)
    console.log('[Stake] Amount:', amount, 'Signature:', signature.slice(0, 20) + '...');
    
    // TODO: In production:
    // 1. Send stake tx to blockchain
    // 2. Verify signature on server
    // 3. After tx confirms, holder verification will auto-refresh balance
    setUserStakes(prev => {
      const newStakes = new Map(prev);
      const current = newStakes.get(selectedMineId) || 0;
      newStakes.set(selectedMineId, current + amount);
      return newStakes;
    });
    // Note: walletBalance is derived from holder verification (blockchain state)
    // It will update automatically when verification refreshes after the tx
    setShowStakingPanel(false);
  }, [selectedMineId]);

  const handleUnstake = useCallback((amount: number, signature: string) => {
    if (!selectedMineId) return;
    
    // Log signature for server verification (in production, send to server)
    console.log('[Unstake] Amount:', amount, 'Signature:', signature.slice(0, 20) + '...');
    
    // TODO: In production:
    // 1. Send unstake tx to blockchain (may be queued during raids)
    // 2. Verify signature on server
    // 3. After tx confirms, holder verification will auto-refresh balance
    setUserStakes(prev => {
      const newStakes = new Map(prev);
      const current = newStakes.get(selectedMineId) || 0;
      newStakes.set(selectedMineId, Math.max(0, current - amount));
      return newStakes;
    });
    // Note: walletBalance is derived from holder verification (blockchain state)
    // It will update automatically when verification refreshes after the tx
    setShowStakingPanel(false);
  }, [selectedMineId]);

  const handleLaunchRaid = useCallback((betAmount: number) => {
    console.log('Launching raid with bet:', betAmount);
    // Add raid started event
    setRaidEvents(prev => [{
      id: Date.now().toString(),
      type: 'raid_started' as const,
      sourceMine: homeMine?.name || 'Unknown',
      targetMine: getMineById(expeditionTarget || '')?.name || 'Unknown',
      sourceResource: homeMine?.resource || 'coal' as ResourceType,
      targetResource: getMineById(expeditionTarget || '')?.resource || 'coal' as ResourceType,
      timestamp: new Date(),
    }, ...prev]);
    setShowExpeditionPanel(false);
    setExpeditionTarget(null);
  }, [homeMine, expeditionTarget]);

  const handleOpenRaid = useCallback(() => {
    if (selectedMineId && selectedMineId !== homeMineId) {
      setExpeditionTarget(selectedMineId);
      setShowExpeditionPanel(true);
    }
  }, [selectedMineId, homeMineId]);

  const userStakeAtSelected = selectedMineId ? (userStakes.get(selectedMineId) || 0) : 0;
  const userStakeAtHome = homeMineId ? (userStakes.get(homeMineId) || 0) : 0;

  return (
    <main className="min-h-screen bg-coal-950 relative overflow-hidden">
      {/* Background effects */}
      <EmberParticles />
      
      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-coal-950 via-coal-900/50 to-coal-950 pointer-events-none" />

      {/* Header */}
      <header className="relative z-20 border-b border-coal-800 bg-coal-950/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-display font-bold">
                <span className="text-ember-500">BLACK</span>
                <span className="text-coal-300"> GOLD</span>
              </h1>
              <span className="text-xs text-coal-500 bg-coal-800 px-2 py-1 rounded">v2.0</span>
              {/* Network indicator - show when on devnet */}
              {process.env.NEXT_PUBLIC_SOLANA_NETWORK === 'devnet' && (
                <span className="text-xs text-yellow-400 bg-yellow-900/50 border border-yellow-700 px-2 py-1 rounded animate-pulse">
                  DEVNET
                </span>
              )}
            </div>
            
            <div className="flex items-center gap-4 md:gap-6">
              {/* Wallet balance - only show when connected */}
              {walletState.isConnected && (
                <div className="hidden sm:flex items-center gap-2">
                  <span className="text-coal-400 text-sm">Balance:</span>
                  {walletState.verificationLoading ? (
                    <span className="text-coal-500 text-sm animate-pulse">Loading...</span>
                  ) : (
                    <span className="text-ember-400 font-bold">
                      {walletBalance.toLocaleString()} {process.env.NEXT_PUBLIC_SOLANA_NETWORK === 'devnet' ? 'ALPHA' : 'COAL'}
                    </span>
                  )}
                </div>
              )}
              
              {/* Mining status */}
              {isMining && (
                <div className="flex items-center gap-2 bg-ember-900/50 border border-ember-700 px-3 py-1.5 rounded-lg">
                  <div className={`w-2 h-2 rounded-full ${hashrate > 0 ? 'bg-green-400 animate-pulse' : 'bg-yellow-400 animate-bounce'}`} />
                  <span className="text-ember-300 text-sm font-mono">
                    {hashrate > 0 
                      ? `${(hashrate / 1000).toFixed(1)} KH/s`
                      : 'Starting...'
                    }
                  </span>
                  {mining.workersReady > 0 && (
                    <span className="text-coal-500 text-xs">
                      ({mining.workersReady}/{selectedCores} workers)
                    </span>
                  )}
                </div>
              )}
              
              {/* WebSocket status indicator */}
              {walletState.isConnected && !USE_MOCK_DATA && (
                <div className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs ${
                  gameSocket.status === 'connected' 
                    ? 'bg-green-900/30 text-green-400' 
                    : gameSocket.status === 'connecting'
                    ? 'bg-yellow-900/30 text-yellow-400'
                    : 'bg-red-900/30 text-red-400'
                }`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${
                    gameSocket.status === 'connected' ? 'bg-green-400' :
                    gameSocket.status === 'connecting' ? 'bg-yellow-400 animate-pulse' :
                    'bg-red-400'
                  }`} />
                  {gameSocket.status === 'connected' ? 'Online' : 
                   gameSocket.status === 'connecting' ? 'Connecting...' : 'Offline'}
                </div>
              )}
              
              {/* Wallet Entry */}
              <WalletEntry compact onWalletChange={handleWalletChange} />
            </div>
          </div>
        </div>
      </header>

      {/* Main content - Globe Hero + Bottom Panels */}
      <div className="relative z-10">
        
        {/* HERO: Globe Section - Full Width */}
        <div className="w-full px-4 py-4">
          <div className="max-w-5xl mx-auto">
            <div className="bg-coal-900/50 backdrop-blur-sm border border-coal-700 rounded-2xl overflow-hidden h-[55vh] min-h-[400px] max-h-[600px]">
              <Globe
                mineStats={mineStats}
                selectedMine={selectedMineId}
                onMineSelect={handleMineSelect}
                userHomeMine={homeMineId}
              />
            </div>
            
            {/* Quick Resource Selector - Below Globe */}
            <div className="flex justify-center gap-2 mt-4">
              {/* Coal button */}
              <button
                onClick={() => {
                  const mine = MINES.find(m => m.resource === 'coal');
                  if (mine) setSelectedMineId(mine.id);
                }}
                className="group flex items-center gap-2 px-4 py-2.5 rounded-lg transition-all hover:scale-105"
                style={{
                  background: 'linear-gradient(135deg, #0f0f0f 0%, #1a1a1a 50%, #0f0f0f 100%)',
                  border: '1px solid #3a3a3a',
                }}
              >
                <div className="relative w-4 h-4">
                  <div className="absolute inset-0 rounded-sm bg-gradient-to-br from-coal-800 via-coal-950 to-coal-900 border border-coal-600" />
                  <div className="absolute inset-0 rounded-sm animate-pulse opacity-70"
                    style={{ boxShadow: '0 0 8px 2px #ff6b35, inset 0 0 4px #ff4500' }} />
                </div>
                <span className="text-sm font-semibold text-coal-200 hidden sm:inline group-hover:text-white">Coal</span>
              </button>
              
              {/* Gold button */}
              <button
                onClick={() => {
                  const mine = MINES.find(m => m.resource === 'gold');
                  if (mine) setSelectedMineId(mine.id);
                }}
                className="group flex items-center gap-2 px-4 py-2.5 rounded-lg transition-all hover:scale-105"
                style={{
                  background: 'linear-gradient(135deg, #1a1500 0%, #2d2400 50%, #1a1500 100%)',
                  border: '1px solid rgba(255, 215, 0, 0.4)',
                }}
              >
                <div className="w-4 h-4 rounded-sm"
                  style={{ 
                    background: 'linear-gradient(135deg, #ffd700 0%, #ffec8b 25%, #ffd700 50%, #b8860b 75%, #ffd700 100%)',
                    boxShadow: '0 0 10px 3px rgba(255, 215, 0, 0.5)'
                  }} />
                <span className="text-sm font-semibold hidden sm:inline group-hover:text-yellow-300" style={{ color: '#ffd700' }}>Gold</span>
              </button>
              
              {/* Oil button */}
              <button
                onClick={() => {
                  const mine = MINES.find(m => m.resource === 'oil');
                  if (mine) setSelectedMineId(mine.id);
                }}
                className="group flex items-center gap-2 px-4 py-2.5 rounded-lg transition-all hover:scale-105"
                style={{
                  background: 'linear-gradient(135deg, #0a0a15 0%, #1a1a2e 50%, #0a0a15 100%)',
                  border: '1px solid rgba(74, 105, 189, 0.4)',
                }}
              >
                <div className="w-4 h-4 rounded-full"
                  style={{ 
                    background: 'linear-gradient(135deg, #1a1a2e 0%, #2d2d4a 30%, #1a1a2e 50%, #4a69bd 80%, #1a1a2e 100%)',
                    boxShadow: '0 0 8px 2px rgba(74, 105, 189, 0.5), inset 0 1px 3px rgba(255,255,255,0.15)'
                  }} />
                <span className="text-sm font-semibold text-blue-300 hidden sm:inline group-hover:text-blue-200">Oil</span>
              </button>
              
              {/* Silver button */}
              <button
                onClick={() => {
                  const mine = MINES.find(m => m.resource === 'silver');
                  if (mine) setSelectedMineId(mine.id);
                }}
                className="group flex items-center gap-2 px-4 py-2.5 rounded-lg transition-all hover:scale-105"
                style={{
                  background: 'linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 50%, #1a1a1a 100%)',
                  border: '1px solid rgba(192, 192, 192, 0.4)',
                }}
              >
                <div className="w-4 h-4 rounded-sm"
                  style={{ 
                    background: 'linear-gradient(135deg, #e8e8e8 0%, #c0c0c0 25%, #f0f0f0 50%, #a8a8a8 75%, #c0c0c0 100%)',
                    boxShadow: '0 0 8px 2px rgba(192, 192, 192, 0.4)'
                  }} />
                <span className="text-sm font-semibold text-gray-300 hidden sm:inline group-hover:text-gray-100">Silver</span>
              </button>
            </div>
          </div>
        </div>

        {/* Bottom Panels - 3 Column Grid */}
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            
            {/* Panel 1: Home Base */}
            <div className="order-2 md:order-1">
              <HomeBase
                mine={homeMine}
                stats={homeMineStats}
                userStake={userStakeAtHome}
                hashrate={hashrate}
                loyaltyDays={loyaltyDays}
                activeExpedition={null}
                cooldowns={{ expeditionCooldown: null, homeBaseCooldown: null }}
                onMiningToggle={handleStartMining}
                onViewMine={() => homeMineId && setSelectedMineId(homeMineId)}
                isMining={isMining}
              />
            </div>

            {/* Panel 2: Selected Mine Details */}
            <div className="order-1 md:order-2">
              {selectedMine ? (
                <MineDetails
                  mine={selectedMine}
                  stats={selectedMineStats}
                  userStake={userStakeAtSelected}
                  isHome={selectedMineId === homeMineId}
                  onSetHome={handleSetHome}
                  onStartMining={walletState.isConnected && selectedMineId === homeMineId ? handleStartMining : undefined}
                  onStake={walletState.canStake ? () => setShowStakingPanel(true) : undefined}
                  onRaid={walletState.canRaid ? handleOpenRaid : undefined}
                  isMining={isMining && selectedMineId === homeMineId}
                  canRaid={walletState.canRaid && selectedMineId !== homeMineId && !!homeMineId}
                  walletMode={walletState.mode}
                />
              ) : (
                <div className="bg-coal-900/90 backdrop-blur-sm border border-coal-700 rounded-xl p-6 text-center h-full flex flex-col justify-center">
                  <div className="text-5xl mb-3">⛏️</div>
                  <h2 className="text-lg font-bold text-white mb-2">Select a Mine</h2>
                  <p className="text-coal-400 text-sm">
                    Click on any mine marker on the globe above to view details and start mining!
                  </p>
                </div>
              )}
            </div>

            {/* Panel 3: Mining Status AND Live Activity Feed */}
            <div className="order-3 space-y-4">
              {/* Show Mining Status when actively mining with timeout */}
              {isMining && homeMine && roundStatus.maxTime && (
                <MiningStatus
                  mineId={homeMineId}
                  mineName={homeMine.name}
                  resource={homeMine.resource}
                  isMining={isMining}
                  hashrate={hashrate}
                  roundStartTime={roundStatus.roundStartTime}
                  maxTime={roundStatus.maxTime}
                  timeRemaining={roundStatus.timeRemaining}
                  rolloverAmount={roundStatus.rolloverAmount}
                  leaderboard={roundStatus.leaderboard}
                  yourBestHash={undefined} // Would need to track this
                  baseReward={homeMine.resource === 'gold' ? 500 : homeMine.resource === 'oil' ? 300 : homeMine.resource === 'silver' ? 200 : 100}
                />
              )}
              
              {/* Activity Feed - ALWAYS visible, condensed when mining */}
              <RaidFeed 
                events={raidEvents} 
                maxEvents={isMining && roundStatus.maxTime ? 4 : 8} 
              />
            </div>
          </div>
        </div>
      </div>

      {/* Footer stats */}
      <footer className="relative z-20 border-t border-coal-800 bg-coal-950/80 backdrop-blur-sm mt-8">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-center gap-8 text-sm">
            <div className="text-center">
              <div className="text-coal-500">Total Miners</div>
              <div className="text-white font-bold">
                {Array.from(mineStats.values()).reduce((a, b) => a + b.minerCount, 0)}
              </div>
            </div>
            <div className="text-center">
              <div className="text-coal-500">Network Hashrate</div>
              <div className="text-ember-400 font-bold">
                {(Array.from(mineStats.values()).reduce((a, b) => a + b.hashrate, 0) / 1000000).toFixed(2)} MH/s
              </div>
            </div>
            <div className="text-center">
              <div className="text-coal-500">Total Discoveries</div>
              <div className="text-white font-bold">
                {Array.from(mineStats.values()).reduce((a, b) => a + b.discoveriesFound, 0).toLocaleString()}
              </div>
            </div>
            <div className="text-center">
              <div className="text-coal-500">Active Mines</div>
              <div className="text-gold-400 font-bold">{MINES.length}</div>
            </div>
          </div>
        </div>
      </footer>

      {/* Modals */}
      {showStakingPanel && selectedMine && (
        <StakingPanel
          mine={selectedMine}
          currentStake={userStakeAtSelected}
          walletBalance={walletBalance}
          onStake={handleStake}
          onUnstake={handleUnstake}
          onClose={() => setShowStakingPanel(false)}
        />
      )}

      {showExpeditionPanel && homeMine && expeditionTarget && (
        <ExpeditionPanel
          sourceMine={homeMine}
          targetMine={getMineById(expeditionTarget)!}
          userStake={userStakeAtHome}
          estimatedAttackPower={hashrate * 0.5 + userStakeAtHome * 0.1}
          estimatedDefensePower={
            (mineStats.get(expeditionTarget)?.hashrate || 0) * 0.1 +
            (mineStats.get(expeditionTarget)?.totalStake || 0) * 0.1 * 1.5
          }
          cooldownRemaining={null}
          onLaunch={handleLaunchRaid}
          onCancel={() => {
            setShowExpeditionPanel(false);
            setExpeditionTarget(null);
          }}
        />
      )}

      {/* Core Selector Modal */}
      {showCoreSelector && (
        <CoreSelector
          onConfirm={handleCoreSelectConfirm}
          onCancel={() => setShowCoreSelector(false)}
          currentCores={selectedCores}
        />
      )}

      {/* Pending Discovery Overlay - 30 second countdown */}
      <PendingDiscoveryOverlay
        isVisible={pendingDiscovery !== null}
        discoveryNumber={pendingDiscovery?.discoveryNumber || 0}
        mineName={pendingDiscovery?.mineName || ''}
        resource={pendingDiscovery?.resource || 'coal'}
        announceAt={pendingDiscovery?.announceAt || 0}
        onComplete={() => setPendingDiscovery(null)}
      />

      {/* Discovery Popup - Winner or announcement */}
      <DiscoveryPopup
        isOpen={discoveryPopup.isOpen}
        onClose={() => setDiscoveryPopup(prev => ({ ...prev, isOpen: false }))}
        isWinner={discoveryPopup.isWinner}
        discoveryData={discoveryPopup.data}
        countdownSeconds={0}
      />

      {/* Timeout Popup - Round ended by time limit */}
      <TimeoutPopup
        isOpen={timeoutPopup.isOpen}
        onClose={() => {
          setTimeoutPopup(prev => ({ ...prev, isOpen: false }));
          // Mining will auto-resume when new work arrives
        }}
        isWinner={timeoutPopup.isWinner}
        data={timeoutPopup.data}
      />
    </main>
  );
}
