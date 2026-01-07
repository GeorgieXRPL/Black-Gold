# Black Gold v2.3 Frontend - Codebase Index

> Last updated: January 2026 | Version 2.3 (Privy Wallet Integration)

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
│   │   ├── StakingPanel.tsx # Stake management (with wallet signature)
│   │   ├── ExpeditionPanel.tsx # Raid planning
│   │   ├── RaidFeed.tsx    # Activity feed
│   │   └── index.ts        # Barrel export
│   ├── BarrelFeed.tsx      # Legacy barrel feed
│   ├── EmberParticles.tsx  # Background particles
│   ├── HolderGate.tsx      # Holder verification (with Privy connect)
│   ├── MiningPanel.tsx     # Legacy mining panel
│   ├── StatsCard.tsx       # Network stats
│   └── index.ts            # Component exports
├── providers/
│   ├── PrivyProvider.tsx   # Privy wallet authentication
│   └── index.ts            # Barrel export
├── hooks/
│   ├── useGameSocket.ts    # v2 game WebSocket
│   ├── useMining.ts        # Mining state
│   ├── useWebSocket.ts     # v1 WebSocket
│   ├── useWallet.ts        # Unified wallet state (Privy)
│   ├── useHolderVerification.ts # Holder verification API
│   └── index.ts            # Barrel export
├── lib/
│   ├── mines.ts            # Mine data & utilities
│   └── mining.ts           # SHA-256 hashing
├── workers/
│   └── miner.worker.ts     # Mining Web Worker
├── api/
│   ├── auth/
│   │   ├── nonce/route.ts  # Signature nonce generation
│   │   └── verify/route.ts # Signature verification
│   └── verify-holder/
│       └── route.ts        # Holder verification API
├── page.tsx                # Main game page
├── layout.tsx              # Root layout (with PrivyProvider)
└── globals.css             # Global styles
```

---

## Components

### Globe (`components/globe/Globe.tsx`)

3D interactive globe using React Three Fiber with TopoJSON country borders.

**Features (v2.2 Globe Styling):**
- TopoJSON world borders from `public/geo/world-110m.json`
- Multi-layered ember-colored continent outlines with glow effect
  - Outer glow: `#ff4500` at 12% opacity
  - Middle glow: `#ff6b35` at 25% opacity  
  - Core line: `#ff8c42` at 85% opacity
  - Hot highlight: `#ffb366` at 50% opacity
- Fallback to `continents.json` if TopoJSON fails
- Dark ocean background (`#0a0a15`)
- Rotating Earth with subtle grid lines
- 20 mine pins with resource-specific colors
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

### useWallet

Unified wallet state with Privy integration.

**Returns:**
```typescript
{
  // State
  isConnected: boolean;
  isReady: boolean;
  isLoading: boolean;
  walletAddress: string | null;
  displayAddress: string | null;
  holderVerification: UseHolderVerificationReturn;
  
  // Actions
  connect: () => void;
  disconnect: () => Promise<void>;
  signMessage: (message: string) => Promise<string | null>;
}
```

---

### useHolderVerification

Holder verification API hook.

**Returns:**
```typescript
{
  verification: HolderVerification | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}
```

---

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
  "topojson-client": "^3.1.0",
  "next": "16.1.1",
  "react": "19.2.3",
  "tailwindcss": "^4",
  "@privy-io/react-auth": "latest",
  "@privy-io/server-auth": "latest"
}
```

---

## Static Assets (`public/geo/`)

| File | Purpose | Source |
|------|---------|--------|
| `world-110m.json` | TopoJSON world country borders | world-atlas npm package |
| `continents.json` | Fallback continent outlines | Custom simplified GeoJSON |

---

## Wallet Integration

### Privy Configuration

The app uses Privy for Solana wallet authentication. Configuration is in `app/providers/PrivyProvider.tsx`.

**Supported Wallets:**
- Phantom
- Solflare
- Backpack
- And other Solana Standard Wallet compatible wallets

**Environment Variable:**
```bash
NEXT_PUBLIC_PRIVY_APP_ID=your_privy_app_id
```

### Wallet Flow

1. User clicks "Connect Wallet" in `HolderGate` component
2. Privy opens wallet selection modal
3. User connects their Solana wallet
4. `useWallet` hook provides wallet state
5. `useHolderVerification` checks token holdings
6. User can start mining if eligible

### Signed Actions

These actions require wallet signature (gasless):
- Stake tokens at a mine
- Unstake tokens from a mine
- Set home base
- Start expedition/raid
