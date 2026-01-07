'use client';

/**
 * @fileoverview Main page for Black Gold v2 Interactive Mining Globe
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { MINES, getMineById, MineStats, ResourceType, RESOURCE_COLORS } from './lib/mines';
import { HomeBase, MineDetails, StakingPanel, ExpeditionPanel, RaidFeed } from './components/game';
import { EmberParticles } from './components';

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

// Mock raid events for demo
const MOCK_EVENTS = [
  { id: '1', type: 'discovery_found' as const, targetMine: 'Appalachian Basin', targetResource: 'coal' as ResourceType, winner: 'Abc1...xyz9', discoveryName: 'Seam', finderShare: 70, vaultShare: 30, timestamp: new Date(Date.now() - 120000) },
  { id: '2', type: 'raid_started' as const, sourceMine: 'Witwatersrand', targetMine: 'Grasberg', sourceResource: 'gold' as ResourceType, targetResource: 'gold' as ResourceType, timestamp: new Date(Date.now() - 300000) },
  { id: '3', type: 'raid_lost' as const, sourceMine: 'Permian Basin', targetMine: 'Ghawar Field', sourceResource: 'oil' as ResourceType, targetResource: 'oil' as ResourceType, spoilsAmount: 45, burnedAmount: 405, timestamp: new Date(Date.now() - 600000) },
  { id: '4', type: 'jackpot' as const, targetMine: 'Super Pit', targetResource: 'gold' as ResourceType, timestamp: new Date(Date.now() - 900000) },
  { id: '5', type: 'vault_payout' as const, targetMine: 'Appalachian Basin', targetResource: 'coal' as ResourceType, reward: 150, timestamp: new Date(Date.now() - 1200000) },
];

export default function Home() {
  // State
  const [selectedMineId, setSelectedMineId] = useState<string | null>(null);
  const [homeMineId, setHomeMineId] = useState<string | null>('coal-appalachian'); // Demo default
  const [mineStats, setMineStats] = useState<Map<string, MineStats>>(new Map());
  const [isMining, setIsMining] = useState(false);
  const [hashrate, setHashrate] = useState(0);
  const [userStakes, setUserStakes] = useState<Map<string, number>>(new Map([
    ['coal-appalachian', 250], // Demo stake
  ]));
  const [walletBalance, setWalletBalance] = useState(10000); // Demo balance
  const [loyaltyDays, setLoyaltyDays] = useState(3);
  const [showStakingPanel, setShowStakingPanel] = useState(false);
  const [showExpeditionPanel, setShowExpeditionPanel] = useState(false);
  const [expeditionTarget, setExpeditionTarget] = useState<string | null>(null);
  const [raidEvents, setRaidEvents] = useState(MOCK_EVENTS);

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

  // Initialize demo mine stats
  useEffect(() => {
    const stats = new Map<string, MineStats>();
    MINES.forEach(mine => {
      stats.set(mine.id, {
        mineId: mine.id,
        minerCount: Math.floor(Math.random() * 50) + 5,
        hashrate: Math.floor(Math.random() * 500000) + 100000,
        totalStake: Math.floor(Math.random() * 100000) + 10000,
        discoveriesFound: Math.floor(Math.random() * 500) + 50,
        difficulty: Math.floor(Math.random() * 1000) + 100,
        lastDiscoveryTime: new Date(Date.now() - Math.random() * 600000).toISOString(),
        hasDefenseBuff: Math.random() > 0.8,
        hasAttackDebuff: Math.random() > 0.9,
        activeRaidCount: Math.random() > 0.85 ? 1 : 0,
        vaultBalance: Math.floor(Math.random() * 500) + 50,
      });
    });
    setMineStats(stats);
  }, []);

  // Simulate hashrate when mining
  useEffect(() => {
    if (isMining) {
      const interval = setInterval(() => {
        setHashrate(prev => {
          // Simulate fluctuating hashrate
          const base = 150000;
          const variance = Math.random() * 20000 - 10000;
          return base + variance;
        });
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

  const handleStake = useCallback((amount: number) => {
    if (!selectedMineId) return;
    setUserStakes(prev => {
      const newStakes = new Map(prev);
      const current = newStakes.get(selectedMineId) || 0;
      newStakes.set(selectedMineId, current + amount);
      return newStakes;
    });
    setWalletBalance(prev => prev - amount);
    setShowStakingPanel(false);
  }, [selectedMineId]);

  const handleUnstake = useCallback((amount: number) => {
    if (!selectedMineId) return;
    setUserStakes(prev => {
      const newStakes = new Map(prev);
      const current = newStakes.get(selectedMineId) || 0;
      newStakes.set(selectedMineId, Math.max(0, current - amount));
      return newStakes;
    });
    setWalletBalance(prev => prev + amount);
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
            </div>
            
            <div className="flex items-center gap-6">
              {/* Wallet balance */}
              <div className="flex items-center gap-2">
                <span className="text-coal-400 text-sm">Balance:</span>
                <span className="text-ember-400 font-bold">{walletBalance.toLocaleString()} COAL</span>
              </div>
              
              {/* Mining status */}
              {isMining && (
                <div className="flex items-center gap-2 bg-ember-900/50 border border-ember-700 px-3 py-1.5 rounded-lg">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                  <span className="text-ember-300 text-sm font-mono">
                    {(hashrate / 1000).toFixed(1)} KH/s
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Left column - Home Base & Raid Feed */}
          <div className="space-y-6">
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
            
            <RaidFeed events={raidEvents} maxEvents={10} />
          </div>

          {/* Center - Globe */}
          <div className="lg:col-span-1 h-[500px] lg:h-auto">
            <div className="bg-coal-900/50 backdrop-blur-sm border border-coal-700 rounded-xl overflow-hidden h-full min-h-[500px]">
              <Globe
                mineStats={mineStats}
                selectedMine={selectedMineId}
                onMineSelect={handleMineSelect}
                userHomeMine={homeMineId}
              />
            </div>
          </div>

          {/* Right column - Selected Mine Details */}
          <div>
            {selectedMine ? (
              <MineDetails
                mine={selectedMine}
                stats={selectedMineStats}
                userStake={userStakeAtSelected}
                isHome={selectedMineId === homeMineId}
                onSetHome={handleSetHome}
                onStartMining={handleStartMining}
                onStake={() => setShowStakingPanel(true)}
                onRaid={handleOpenRaid}
                isMining={isMining && selectedMineId === homeMineId}
                canRaid={selectedMineId !== homeMineId && !!homeMineId}
              />
            ) : (
              <div className="bg-coal-900/90 backdrop-blur-sm border border-coal-700 rounded-xl p-8 text-center">
                <div className="text-6xl mb-4">🌍</div>
                <h2 className="text-xl font-bold text-white mb-2">Select a Mine</h2>
                <p className="text-coal-400">
                  Click on any mine marker on the globe to view details and start mining!
                </p>
                
                {/* Quick resource filter */}
                <div className="mt-6">
                  <div className="text-xs text-coal-500 uppercase mb-3">Quick Select</div>
                  <div className="grid grid-cols-2 gap-2">
                    {(['coal', 'gold', 'oil', 'silver'] as ResourceType[]).map((resource) => (
                      <button
                        key={resource}
                        onClick={() => {
                          const mine = MINES.find(m => m.resource === resource);
                          if (mine) setSelectedMineId(mine.id);
                        }}
                        className="flex items-center gap-2 px-3 py-2 bg-coal-800 hover:bg-coal-700 rounded-lg transition-colors"
                      >
                        <div 
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: RESOURCE_COLORS[resource].glow }}
                        />
                        <span className="text-sm text-coal-300 capitalize">{resource}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
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
