# Black Gold v2 Frontend - Codebase Index

> Last updated: January 2026 | Version 2.0 (Interactive Mining Globe)

## Overview

The Black Gold v2 frontend is a Next.js application featuring a 3D interactive globe, game UI panels for mining/staking/raiding, and real-time WebSocket communication with the game server.

---

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **3D Graphics**: Three.js + React Three Fiber + Drei
- **Styling**: TailwindCSS 4 with custom theme
- **State**: React hooks + WebSocket
- **Mining**: Web Workers for CPU hashing

---

## Directory Structure

```
app/
├── components/
│   ├── globe/              # 3D globe components
│   │   ├── Globe.tsx       # Main interactive globe
│   │   └── index.ts        # Barrel export
│   ├── game/               # Game UI panels
│   │   ├── HomeBase.tsx    # Home mine dashboard
│   │   ├── MineDetails.tsx # Selected mine info
│   │   ├── StakingPanel.tsx # Stake management
│   │   ├── ExpeditionPanel.tsx # Raid planning
│   │   ├── RaidFeed.tsx    # Activity feed
│   │   └── index.ts        # Barrel export
│   ├── BarrelFeed.tsx      # Legacy barrel feed
│   ├── EmberParticles.tsx  # Background particles
│   ├── HolderGate.tsx      # Holder verification
│   ├── MiningPanel.tsx     # Legacy mining panel
│   ├── StatsCard.tsx       # Network stats
│   └── index.ts            # Component exports
├── hooks/
│   ├── useGameSocket.ts    # v2 game WebSocket
│   ├── useMining.ts        # Mining state
│   └── useWebSocket.ts     # v1 WebSocket
├── lib/
│   ├── mines.ts            # Mine data & utilities
│   └── mining.ts           # SHA-256 hashing
├── workers/
│   └── miner.worker.ts     # Mining Web Worker
├── api/
│   └── verify-holder/
│       └── route.ts        # Holder verification API
├── page.tsx                # Main game page
├── layout.tsx              # Root layout
└── globals.css             # Global styles
```

---

## Components

### Globe (`components/globe/Globe.tsx`)

3D interactive globe using React Three Fiber.

**Features:**
- Rotating Earth with grid lines
- 20 mine pins with resource colors
- Click to select, hover for details
- Stars background
- Smooth camera controls

**Props:**
```typescript
interface GlobeProps {
  mineStats: Map<string, MineStats>;
  selectedMine: string | null;
  onMineSelect: (mineId: string) => void;
  userHomeMine: string | null;
}
```

---

### HomeBase (`components/game/HomeBase.tsx`)

Dashboard for the user's home mine.

**Features:**
- Current mine info and stats
- Base vs effective hashrate display
- Stake tier and multiplier
- Loyalty bonus tracker (coal)
- Mining start/stop button
- Active expedition indicator

**Props:**
```typescript
interface HomeBaseProps {
  mine: Mine | null;
  stats: MineStats | undefined;
  userStake: number;
  hashrate: number;
  loyaltyDays: number;
  activeExpedition: { targetMine: string; timeRemaining: number } | null;
  cooldowns: { expeditionCooldown: number | null; homeBaseCooldown: number | null };
  onMiningToggle: () => void;
  onViewMine: () => void;
  isMining: boolean;
}
```

---

### MineDetails (`components/game/MineDetails.tsx`)

Info panel for selected mine on globe.

**Features:**
- Resource type badge with color
- Mine statistics (miners, hashrate, stake, barrels)
- Special ability description
- User's stake at this mine
- Action buttons (Set Home, Start Mining, Launch Raid)
- Raid status indicators

---

### StakingPanel (`components/game/StakingPanel.tsx`)

Modal for managing stakes.

**Features:**
- Current stake and tier display
- All tier thresholds with progress
- Stake/Unstake toggle
- Amount input with quick percentages
- Preview of new tier after action
- Warning for unstaking penalties

---

### ExpeditionPanel (`components/game/ExpeditionPanel.tsx`)

Modal for planning raids.

**Features:**
- Source and target mine display
- Attack vs defense power comparison
- Win chance percentage
- Optional bet slider (0-20% of stake)
- Win/lose outcome preview
- Raid rules summary

---

### RaidFeed (`components/game/RaidFeed.tsx`)

Live activity feed.

**Event Types:**
- `raid_started` - Raiders attacking a mine
- `raid_won` - Successful raid with rewards
- `raid_lost` - Defenders won
- `barrel_found` - Barrel discovery
- `jackpot` - Gold Rush 5x event

---

## Hooks

### useGameSocket

v2 WebSocket hook for game server.

**Returns:**
```typescript
{
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  globalStats: GlobalStats | null;
  mineStats: Map<string, MineStats>;
  currentMineId: string | null;
  connect: () => void;
  disconnect: () => void;
  joinMine: (mineId: string) => void;
  leaveMine: () => void;
  setHomeBase: (mineId: string) => void;
  stake: (mineId: string, amount: number) => void;
  unstake: (mineId: string, amount: number) => void;
  startExpedition: (targetMineId: string, betAmount?: number) => void;
  rallyDefense: (mineId: string, tokenCost: number) => void;
  sendHashrate: (hashrate: number) => void;
  submitProof: (workUnitId: string, nonce: number, hash: string) => void;
}
```

---

### useMining

Mining state management.

**Returns:**
```typescript
{
  isMining: boolean;
  hashrate: number;
  hashCount: number;
  startMining: (cores: number) => void;
  stopMining: () => void;
}
```

---

## Libraries

### mines.ts

Client-side mine data.

**Exports:**
- `MINES` - Array of 20 mine definitions
- `getMineById(id)` - Get mine by ID
- `getMinesByResource(type)` - Filter by resource
- `RESOURCE_COLORS` - Color schemes per resource
- `RESOURCE_MECHANICS` - Ability descriptions
- `STAKE_TIERS` - Tier thresholds
- `getStakeTier(amount)` - Get tier for stake
- `formatBarrelTime(ms)` - Human readable time

---

### mining.ts

SHA-256 utilities for Web Worker.

**Exports:**
- `sha256(data)` - Single SHA-256 hash
- `doubleSha256(data)` - Bitcoin-style double hash
- `computeProofHash(header, nonce)` - Compute proof
- `hashMeetsTarget(hash, target)` - Check difficulty

---

## Styling

### Theme Colors

```css
/* Coal blacks */
--coal-950: #0a0a0a;
--coal-900: #121212;
--coal-800: #1a1a1a;

/* Accents */
--ember: #f97316;
--gold: #fbbf24;
```

### Resource Colors

| Resource | Primary | Glow |
|----------|---------|------|
| Coal | #1a1a1a | #ff6b35 |
| Gold | #ffd700 | #fff59d |
| Oil | #1a1a2e | #4a69bd |
| Silver | #c0c0c0 | #f0f0f0 |

### Animations

- `ember-rise` - Floating particles
- `mine-pulse` - Pin glow effect
- `raid-flash` - Attack indicator
- `jackpot-glow` - Gold rush effect

---

## Mine Locations

### Coal (5)
| Mine | Country | Lat | Lng |
|------|---------|-----|-----|
| Appalachian Basin | USA | 38.5 | -82.5 |
| Shanxi Province | China | 37.5 | 112.5 |
| Hunter Valley | Australia | -32.5 | 151.0 |
| Silesia | Poland | 50.3 | 19.0 |
| Kuzbass | Russia | 54.0 | 87.0 |

### Gold (5)
| Mine | Country | Lat | Lng |
|------|---------|-----|-----|
| Witwatersrand | South Africa | -26.2 | 28.0 |
| Carlin Trend | USA | 40.7 | -116.2 |
| Super Pit | Australia | -30.8 | 121.5 |
| Grasberg | Indonesia | -4.1 | 137.1 |
| Muruntau | Uzbekistan | 41.5 | 64.6 |

### Oil (5)
| Field | Country | Lat | Lng |
|-------|---------|-----|-----|
| Ghawar Field | Saudi Arabia | 25.4 | 49.6 |
| Permian Basin | USA | 31.8 | -102.4 |
| **Orinoco Belt** | **Venezuela** | **8.5** | **-64.0** |
| Campos Basin | Brazil | -22.4 | -40.0 |
| Rumaila | Iraq | 30.5 | 47.3 |

### Silver (5)
| Mine | Country | Lat | Lng |
|------|---------|-----|-----|
| Potosí | Bolivia | -19.6 | -65.8 |
| Guanajuato | Mexico | 21.0 | -101.3 |
| Coeur d'Alene | USA | 47.7 | -116.8 |
| Cannington | Australia | -21.9 | 140.9 |
| Dukat | Russia | 62.5 | 155.0 |

---

## Build & Run

```bash
# Development
npm run dev

# Production build
npm run build
npm start

# Lint
npm run lint
```

---

## Dependencies

```json
{
  "@react-three/fiber": "^9.5.0",
  "@react-three/drei": "^10.7.7",
  "three": "^0.182.0",
  "next": "16.1.1",
  "react": "19.2.3",
  "tailwindcss": "^4"
}
```
