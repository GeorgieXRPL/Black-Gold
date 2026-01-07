/**
 * @fileoverview Live barrel discovery feed component
 */

'use client';

import { motion, AnimatePresence } from 'framer-motion';
import type { BarrelResult } from '../../server/types';

interface BarrelFeedProps {
  barrels: BarrelResult[];
  maxItems?: number;
}

/**
 * Format wallet address for display
 */
function formatWallet(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Format timestamp
 */
function formatTime(date: Date): string {
  const d = new Date(date);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function BarrelFeed({ barrels, maxItems = 10 }: BarrelFeedProps) {
  const displayBarrels = barrels.slice(0, maxItems);

  return (
    <div className="coal-panel p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-xl text-white">Recent Barrels</h2>
        <div className="flex items-center gap-2 text-ember text-sm">
          <span className="w-2 h-2 bg-ember rounded-full animate-pulse" />
          Live
        </div>
      </div>

      <div className="space-y-2 max-h-96 overflow-y-auto">
        <AnimatePresence mode="popLayout">
          {displayBarrels.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-8 text-coal-500"
            >
              <div className="text-4xl mb-2">⛏️</div>
              <p>Waiting for barrels to be found...</p>
            </motion.div>
          ) : (
            displayBarrels.map((barrel, index) => (
              <motion.div
                key={`${barrel.discoveryNumber}-${barrel.timestamp}`}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ delay: index * 0.05 }}
                className="flex items-center gap-4 p-3 bg-coal-900 rounded border border-coal-700
                         hover:border-ember/50 transition-colors"
              >
                {/* Discovery Icon */}
                <div className="text-2xl">🛢️</div>

                {/* Discovery Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-heading text-white">
                      {barrel.discoveryName || 'Discovery'} #{barrel.discoveryNumber}
                    </span>
                    <span className="text-coal-500 text-sm">
                      {formatTime(new Date(barrel.timestamp))}
                    </span>
                  </div>
                  <div className="text-sm text-coal-500 truncate font-mono">
                    {formatWallet(barrel.winner)}
                  </div>
                </div>

                {/* Reward */}
                <div className="text-right">
                  <div className="stat-value text-lg">
                    +{(barrel.finderShare || barrel.totalReward).toFixed(2)}
                  </div>
                  <div className="text-coal-500 text-xs">COAL</div>
                </div>

                {/* TX Link */}
                {barrel.txSignature && (
                  <a
                    href={`https://solscan.io/tx/${barrel.txSignature}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-ember hover:text-gold transition-colors"
                    title="View on Solscan"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                )}
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
