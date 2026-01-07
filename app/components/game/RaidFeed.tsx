'use client';

/**
 * @fileoverview Live feed of raid activity across all mines
 */

import { useMemo } from 'react';
import { RESOURCE_COLORS, ResourceType } from '../../lib/mines';

interface RaidEvent {
  id: string;
  type: 'raid_started' | 'raid_won' | 'raid_lost' | 'discovery_found' | 'jackpot' | 'vault_payout' | 'spoils_distributed';
  sourceMine?: string;
  targetMine?: string;
  sourceResource?: ResourceType;
  targetResource?: ResourceType;
  attackers?: string[];
  winner?: string;
  reward?: number;
  finderShare?: number;
  vaultShare?: number;
  discoveryName?: string;
  spoilsAmount?: number;
  burnedAmount?: number;
  timestamp: Date;
}

interface RaidFeedProps {
  events: RaidEvent[];
  maxEvents?: number;
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function EventIcon({ type, resource }: { type: RaidEvent['type']; resource?: ResourceType }) {
  switch (type) {
    case 'raid_started':
      return <span className="text-2xl">⚔️</span>;
    case 'raid_won':
      return <span className="text-2xl">🏆</span>;
    case 'raid_lost':
      return <span className="text-2xl">🛡️</span>;
    case 'discovery_found': {
      const emojis: Record<ResourceType, string> = {
        coal: '⛏️',
        gold: '🥇',
        oil: '🛢️',
        silver: '🥈',
      };
      return <span className="text-2xl">{resource ? emojis[resource] : '⛏️'}</span>;
    }
    case 'jackpot':
      return <span className="text-2xl">🎰</span>;
    case 'vault_payout':
      return <span className="text-2xl">📊</span>;
    case 'spoils_distributed':
      return <span className="text-2xl">💰</span>;
    default:
      return <span className="text-2xl">📢</span>;
  }
}

function EventMessage({ event }: { event: RaidEvent }) {
  const targetColor = event.targetResource ? RESOURCE_COLORS[event.targetResource].glow : '#fff';
  const sourceColor = event.sourceResource ? RESOURCE_COLORS[event.sourceResource].glow : '#fff';

  switch (event.type) {
    case 'raid_started':
      return (
        <div className="text-sm">
          <span className="text-coal-300">Raiders from </span>
          <span style={{ color: sourceColor }} className="font-semibold">{event.sourceMine}</span>
          <span className="text-coal-300"> attacking </span>
          <span style={{ color: targetColor }} className="font-semibold">{event.targetMine}</span>
        </div>
      );
    
    case 'raid_won':
      return (
        <div className="text-sm">
          <span className="text-green-400 font-semibold">Raid successful!</span>
          <span className="text-coal-300"> Stole </span>
          <span className="text-ember-400 font-semibold">{event.reward?.toLocaleString()}</span>
          <span className="text-coal-300"> from </span>
          <span style={{ color: targetColor }} className="font-semibold">{event.targetMine}</span>
        </div>
      );
    
    case 'raid_lost':
      return (
        <div className="text-sm">
          <span style={{ color: targetColor }} className="font-semibold">{event.targetMine}</span>
          <span className="text-coal-300"> defended against </span>
          <span style={{ color: sourceColor }} className="font-semibold">{event.sourceMine}</span>
          <span className="text-blue-400 font-semibold"> raiders!</span>
        </div>
      );
    
    case 'discovery_found':
      return (
        <div className="text-sm">
          <span className="text-ember-400 font-semibold">{event.discoveryName || 'Discovery'} found</span>
          <span className="text-coal-300"> at </span>
          <span style={{ color: targetColor }} className="font-semibold">{event.targetMine}</span>
          <span className="text-coal-300"> by </span>
          <span className="text-white font-mono">{event.winner ? truncateAddress(event.winner) : 'Unknown'}</span>
          {event.finderShare && (
            <span className="text-coal-400"> (+{event.finderShare.toFixed(0)} instant)</span>
          )}
        </div>
      );
    
    case 'vault_payout':
      return (
        <div className="text-sm">
          <span className="text-gold-400 font-semibold">Hourly pool payout</span>
          <span className="text-coal-300"> at </span>
          <span style={{ color: targetColor }} className="font-semibold">{event.targetMine}</span>
          {event.reward && (
            <span className="text-coal-400"> ({event.reward.toFixed(0)} COAL distributed)</span>
          )}
        </div>
      );
    
    case 'spoils_distributed':
      return (
        <div className="text-sm">
          <span className="text-green-400 font-semibold">Defense spoils!</span>
          <span className="text-coal-300"> Defenders at </span>
          <span style={{ color: targetColor }} className="font-semibold">{event.targetMine}</span>
          <span className="text-coal-300"> shared </span>
          <span className="text-gold-400">{event.spoilsAmount?.toFixed(0)}</span>
          <span className="text-coal-400"> ({event.burnedAmount?.toFixed(0)} burned 🔥)</span>
        </div>
      );
    
    case 'jackpot':
      return (
        <div className="text-sm">
          <span className="text-gold-400 font-semibold animate-pulse">🎰 GOLD RUSH 5X JACKPOT!</span>
          <span className="text-coal-300"> at </span>
          <span style={{ color: targetColor }} className="font-semibold">{event.targetMine}</span>
        </div>
      );
    
    default:
      return null;
  }
}

export default function RaidFeed({ events, maxEvents = 10 }: RaidFeedProps) {
  const sortedEvents = useMemo(() => {
    return [...events]
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, maxEvents);
  }, [events, maxEvents]);

  return (
    <div className="bg-coal-900/90 backdrop-blur-sm border border-coal-700 rounded-xl overflow-hidden">
      <div className="p-4 border-b border-coal-700">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <span>📡</span> Live Activity
        </h3>
      </div>

      <div className="max-h-80 overflow-y-auto">
        {sortedEvents.length === 0 ? (
          <div className="p-8 text-center text-coal-500">
            <div className="text-4xl mb-2">🌍</div>
            <div>No activity yet...</div>
            <div className="text-sm">Start mining to see events!</div>
          </div>
        ) : (
          <div className="divide-y divide-coal-800">
            {sortedEvents.map((event) => (
              <div 
                key={event.id}
                className="p-3 hover:bg-coal-800/50 transition-colors flex items-start gap-3"
              >
                <div className="flex-shrink-0 mt-0.5">
                  <EventIcon type={event.type} resource={event.targetResource} />
                </div>
                <div className="flex-1 min-w-0">
                  <EventMessage event={event} />
                  <div className="text-xs text-coal-500 mt-1">
                    {formatTimeAgo(event.timestamp)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Gradient fade at bottom */}
      <div className="h-4 bg-gradient-to-t from-coal-900 to-transparent" />
    </div>
  );
}
