/**
 * @fileoverview Live discovery feed component
 * Shows recent discoveries (Seams, Nuggets, Gushers, Lodes) with dual reward info
 */

'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { RESOURCE_MECHANICS, ResourceType } from '../lib/mines';

/** Discovery event for display */
export interface DiscoveryEvent {
  /** Discovery ID */
  id: string;
  /** Discovery number at mine */
  number: number;
  /** Mine ID */
  mineId: string;
  /** Mine name */
  mineName: string;
  /** Resource type */
  resource: ResourceType;
  /** Finder wallet */
  winner: string;
  /** Total reward */
  totalReward: number;
  /** Finder share (70%) */
  finderShare: number;
  /** Vault share (30%) */
  vaultShare: number;
  /** Was jackpot */
  isJackpot: boolean;
  /** Timestamp */
  timestamp: Date;
  /** TX signature */
  txSignature?: string;
}

interface DiscoveryFeedProps {
  discoveries: DiscoveryEvent[];
  maxItems?: number;
  /** Whether to show the compact version */
  compact?: boolean;
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

/**
 * Get discovery display info
 */
function getDiscoveryInfo(resource: ResourceType) {
  return RESOURCE_MECHANICS[resource];
}

export function DiscoveryFeed({ discoveries, maxItems = 10, compact = false }: DiscoveryFeedProps) {
  const displayDiscoveries = discoveries.slice(0, maxItems);

  return (
    <div className={`coal-panel ${compact ? 'p-4' : 'p-6'} space-y-4`}>
      <div className="flex items-center justify-between">
        <h2 className={`font-heading ${compact ? 'text-lg' : 'text-xl'} text-white`}>
          Recent Discoveries
        </h2>
        <div className="flex items-center gap-2 text-ember text-sm">
          <span className="w-2 h-2 bg-ember rounded-full animate-pulse" />
          Live
        </div>
      </div>

      <div className={`space-y-2 ${compact ? 'max-h-64' : 'max-h-96'} overflow-y-auto`}>
        <AnimatePresence mode="popLayout">
          {displayDiscoveries.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-8 text-coal-500"
            >
              <div className="text-4xl mb-2">⛏️</div>
              <p>Waiting for discoveries...</p>
            </motion.div>
          ) : (
            displayDiscoveries.map((discovery, index) => {
              const info = getDiscoveryInfo(discovery.resource);
              return (
                <motion.div
                  key={discovery.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ delay: index * 0.05 }}
                  className={`flex items-center gap-4 ${compact ? 'p-2' : 'p-3'} bg-coal-900 rounded border 
                           ${discovery.isJackpot ? 'border-gold animate-pulse' : 'border-coal-700'}
                           hover:border-ember/50 transition-colors`}
                >
                  {/* Discovery Icon */}
                  <div className="text-2xl">{info.discoveryEmoji}</div>

                  {/* Discovery Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-heading text-white">
                        {discovery.resource.charAt(0).toUpperCase() + discovery.resource.slice(1)} {info.discoveryName} #{discovery.number}
                      </span>
                      {discovery.isJackpot && (
                        <span className="px-2 py-0.5 bg-gold/20 text-gold text-xs rounded-full font-bold">
                          🎰 5x JACKPOT!
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-coal-500 flex items-center gap-2">
                      <span>{info.discoveryVerb} at {discovery.mineName}</span>
                      <span>•</span>
                      <span>{formatTime(discovery.timestamp)}</span>
                    </div>
                    <div className="text-xs text-coal-600 font-mono">
                      {formatWallet(discovery.winner)}
                    </div>
                  </div>

                  {/* Reward Breakdown */}
                  <div className="text-right">
                    <div className="flex items-center gap-1 justify-end">
                      <span className="stat-value text-lg">
                        +{discovery.finderShare.toFixed(1)}
                      </span>
                      <span className="text-xs text-coal-500">COAL</span>
                    </div>
                    <div className="text-xs text-coal-500">
                      <span className="text-ember">70% instant</span>
                      <span className="mx-1">•</span>
                      <span className="text-gold">+{discovery.vaultShare.toFixed(1)} vault</span>
                    </div>
                  </div>

                  {/* TX Link */}
                  {discovery.txSignature && (
                    <a
                      href={`https://solscan.io/tx/${discovery.txSignature}`}
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
              );
            })
          )}
        </AnimatePresence>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 text-xs text-coal-500 border-t border-coal-700 pt-3">
        <span className="flex items-center gap-1">
          <span className="text-ember">70%</span> Finder&apos;s Fee (instant)
        </span>
        <span className="flex items-center gap-1">
          <span className="text-gold">30%</span> Pool Share (hourly)
        </span>
      </div>
    </div>
  );
}
