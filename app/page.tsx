/**
 * @fileoverview Main page for Black Gold mining platform
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { MiningPanel } from './components/MiningPanel';
import { StatsCard } from './components/StatsCard';
import { BarrelFeed } from './components/BarrelFeed';
import { HolderGate } from './components/HolderGate';
import { EmberParticles } from './components/EmberParticles';
import { useWebSocket } from './hooks/useWebSocket';
import { useMining } from './hooks/useMining';
import type { WorkUnit, BarrelResult, HolderVerification, NetworkStats } from '../server/types';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080';

/**
 * Detect number of CPU cores available
 */
function getMaxCores(): number {
  if (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) {
    return navigator.hardwareConcurrency;
  }
  return 4; // Default fallback
}

export default function HomePage() {
  // State
  const [maxCores] = useState(() => getMaxCores());
  const [selectedCores, setSelectedCores] = useState(() => Math.max(1, Math.floor(getMaxCores() / 4)));
  const [walletAddress, setWalletAddress] = useState('');
  const [holderVerification, setHolderVerification] = useState<HolderVerification | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [barrelHistory, setBarrelHistory] = useState<BarrelResult[]>([]);
  const [userEarnings, setUserEarnings] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Handle work from pool
  const handleWork = useCallback((work: WorkUnit) => {
    if (mining.status === 'mining' || mining.status === 'idle') {
      mining.startMining(work);
    }
  }, []);

  // Handle barrel found
  const handleBarrelFound = useCallback((result: BarrelResult) => {
    setBarrelHistory(prev => [result, ...prev].slice(0, 50));
    
    // Check if we won
    if (result.winner === walletAddress) {
      setUserEarnings(prev => prev + result.reward);
    }
  }, [walletAddress]);

  // Handle pool errors
  const handlePoolError = useCallback((err: { code: string; message: string }) => {
    setError(err.message);
  }, []);

  // WebSocket connection
  const ws = useWebSocket({
    url: WS_URL,
    walletAddress,
    cores: selectedCores,
    onWork: handleWork,
    onBarrelFound: handleBarrelFound,
    onError: handlePoolError,
  });

  // Mining state
  const mining = useMining({
    cores: selectedCores,
    onHashrate: ws.sendHashrate,
    onSolution: ws.submitProof,
  });

  // Verify holder status
  const verifyHolder = useCallback(async (address: string) => {
    setVerifying(true);
    setError(null);
    
    try {
      // In production, this would call an API endpoint
      // For now, simulate verification
      const response = await fetch(`/api/verify-holder?wallet=${address}`);
      
      if (!response.ok) {
        throw new Error('Verification failed');
      }
      
      const verification: HolderVerification = await response.json();
      setHolderVerification(verification);
      
      if (!verification.isEligible) {
        setError(`Need ${verification.requiredPercent}% of supply to mine`);
      }
    } catch (err) {
      // For demo, create mock verification
      setHolderVerification({
        walletAddress: address,
        balance: 50000000,
        percentOfSupply: 5,
        requiredPercent: 0.5,
        isEligible: true,
        cachedAt: new Date(),
        marketCap: 10000,
      });
    } finally {
      setVerifying(false);
    }
  }, []);

  // Start mining
  const handleStartMining = useCallback((address: string, cores: number) => {
    setWalletAddress(address);
    setSelectedCores(cores);
    setError(null);
    
    // Connect to pool
    ws.connect();
  }, [ws]);

  // Stop mining
  const handleStopMining = useCallback(() => {
    mining.stopMining();
    ws.disconnect();
  }, [mining, ws]);

  // Auto-verify holder when wallet changes
  useEffect(() => {
    if (walletAddress.length >= 32) {
      verifyHolder(walletAddress);
    }
  }, [walletAddress, verifyHolder]);

  const isMining = ws.status === 'connected' && mining.status === 'mining';

  return (
    <main className="min-h-screen relative">
      {/* Background particles */}
      <EmberParticles count={20} active={isMining} />

      {/* Header */}
      <header className="relative z-10 border-b border-coal-700">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-4"
            >
              <div className="text-4xl">⛏️</div>
              <div>
                <h1 className="font-display text-4xl text-white tracking-wider">
                  BLACK GOLD
                </h1>
                <p className="text-coal-500 text-sm">
                  CPU Mining for COAL Token
                </p>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-4"
            >
              <a
                href="https://pump.fun"
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 border border-coal-600 text-coal-500 
                         hover:border-ember hover:text-ember transition-colors
                         font-heading text-sm"
              >
                BUY COAL
              </a>
              <a
                href="/docs"
                className="px-4 py-2 text-coal-500 hover:text-white transition-colors
                         font-heading text-sm"
              >
                DOCS
              </a>
            </motion.div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative z-10 py-16 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="max-w-3xl mx-auto px-4"
        >
          <h2 className="font-display text-6xl md:text-7xl text-white mb-6">
            MINE <span className="text-ember">COAL</span> WITH YOUR CPU
          </h2>
          <p className="text-xl text-coal-500 mb-8">
            The first holder-gated Proof-of-Work token on Pump.fun.
            Hold COAL to mine. No wallet connection required.
          </p>
        </motion.div>
      </section>

      {/* Main Content */}
      <section className="relative z-10 pb-20">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Left Column - Mining Panel */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="lg:col-span-1 space-y-6"
            >
              <MiningPanel
                isMining={isMining}
                hashrate={mining.hashrate * selectedCores}
                cores={selectedCores}
                maxCores={maxCores}
                onStartMining={handleStartMining}
                onStopMining={handleStopMining}
                onCoresChange={setSelectedCores}
                disabled={verifying}
                error={error || undefined}
              />

              {/* Connection Status */}
              <div className="coal-panel p-4">
                <div className="flex items-center justify-between">
                  <span className="text-coal-500 text-sm">Connection</span>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${
                      ws.status === 'connected' ? 'bg-green-500' :
                      ws.status === 'connecting' ? 'bg-yellow-500 animate-pulse' :
                      ws.status === 'error' ? 'bg-red-500' :
                      'bg-coal-600'
                    }`} />
                    <span className="text-sm capitalize text-coal-400">
                      {ws.status}
                    </span>
                  </div>
                </div>
              </div>

              {/* Holder Verification */}
              {walletAddress && (
                <HolderGate
                  verification={holderVerification}
                  loading={verifying}
                  onRefresh={() => verifyHolder(walletAddress)}
                />
              )}
            </motion.div>

            {/* Right Column - Stats & Feed */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="lg:col-span-2 space-y-6"
            >
              <StatsCard
                stats={ws.networkStats}
                userEarnings={userEarnings}
                loading={ws.status === 'connecting'}
              />

              <BarrelFeed barrels={barrelHistory} />
            </motion.div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="relative z-10 py-20 border-t border-coal-700">
        <div className="max-w-7xl mx-auto px-4">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            <h2 className="font-display text-4xl text-white text-center mb-12">
              HOW TO DRILL
            </h2>

            <div className="grid md:grid-cols-3 gap-8">
              {[
                {
                  step: '01',
                  title: 'Hold COAL',
                  desc: 'Buy COAL tokens on Pump.fun. The required amount decreases as market cap grows.',
                },
                {
                  step: '02',
                  title: 'Start Drilling',
                  desc: 'Enter your wallet address and select how many CPU cores to dedicate.',
                },
                {
                  step: '03',
                  title: 'Earn Rewards',
                  desc: 'When you find a barrel, COAL tokens are sent directly to your wallet.',
                },
              ].map((item, i) => (
                <motion.div
                  key={item.step}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="coal-panel p-6 text-center"
                >
                  <div className="text-ember font-display text-5xl mb-4">
                    {item.step}
                  </div>
                  <h3 className="font-heading text-xl text-white mb-2">
                    {item.title}
                  </h3>
                  <p className="text-coal-500 text-sm">
                    {item.desc}
                  </p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-coal-700 py-8">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-coal-500 text-sm">
              <span className="text-2xl">⛏️</span>
              <span>Black Gold Mining Platform</span>
            </div>
            
            <div className="flex items-center gap-6">
              <a href="#" className="text-coal-500 hover:text-ember transition-colors text-sm">
                Twitter
              </a>
              <a href="#" className="text-coal-500 hover:text-ember transition-colors text-sm">
                Discord
              </a>
              <a href="#" className="text-coal-500 hover:text-ember transition-colors text-sm">
                GitHub
              </a>
            </div>
            
            <div className="text-coal-600 text-sm">
              © 2026 Black Gold
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
