'use client';

/**
 * @fileoverview Main page for Black Gold v2 Interactive Mining Globe
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { MINES, getMineById, MineStats, ResourceType, RESOURCE_COLORS } from './lib/mines';
import { HomeBase, MineDetails, StakingPanel, ExpeditionPanel, RaidFeed } from './components/game';
import { EmberParticles, WalletEntry, WalletEntryState } from './components';
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

  // State - Use demo defaults in mock mode, empty in production
  const [selectedMineId, setSelectedMineId] = useState<string | null>(null);
  const [homeMineId, setHomeMineId] = useState<string | null>(
    USE_MOCK_DATA ? DEMO_USER.homeMineId : null
  );
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

  // walletBalance is derived from walletState.tokenBalance (must be after walletState declaration)
  const walletBalance = USE_MOCK_DATA ? DEMO_USER.walletBalance : walletState.tokenBalance;

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
      // TODO: Connect to game server WebSocket for real stats
    }
  }, []);

  // Simulate hashrate when mining
  useEffect(() => {
    if (isMining) {
      const interval = setInterval(() => {
        if (USE_MOCK_DATA) {
          // Use simulated hashrate in mock mode
          setHashrate(simulateHashrate(150000));
        } else {
          // In production, hashrate comes from Web Worker
          // TODO: Get real hashrate from mining Web Worker
        }
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setHashrate(0);
    }
  }, [isMining]);

  // Handlers
  const handleMineSelect = useCallback((mineId: string) => {
    setSelectedMineId(mineId);
  }, []);

  const handleSetHome = useCallback(() => {
    if (selectedMineId) {
      setHomeMineId(selectedMineId);
      setLoyaltyDays(0);
    }
  }, [selectedMineId]);

  const handleStartMining = useCallback(() => {
    setIsMining(prev => !prev);
  }, []);

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
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                  <span className="text-ember-300 text-sm font-mono">
                    {(hashrate / 1000).toFixed(1)} KH/s
                  </span>
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
                  onStartMining={walletState.isConnected ? handleStartMining : undefined}
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

            {/* Panel 3: Live Activity Feed */}
            <div className="order-3">
              <RaidFeed events={raidEvents} maxEvents={8} />
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
    </main>
  );
}
