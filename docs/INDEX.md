# Black Gold v2 - Codebase Index

> Last updated: January 2026 | Version 2.0 (Interactive Mining Globe)

## Overview

Black Gold v2 is an interactive CPU mining platform featuring a 3D globe with 20 real-world mines, staking mechanics, and PvP raiding. Players choose mines, stake tokens for power boosts, and can raid other mines to steal rewards.

---

## Directory Structure

```
black-gold/
├── app/                    # Next.js frontend with 3D globe
├── server/                 # Mining pool + game backend
│   └── game/               # v2 game system
├── config/                 # Configuration + mine definitions
├── scripts/                # Standalone scripts
└── docs/                   # Documentation
```

---

## Frontend (`app/`)

| File | Purpose | Key Exports |
|------|---------|-------------|
| `page.tsx` | Main game page with globe and panels | `HomePage` (default) |
| `layout.tsx` | Root layout with fonts | `RootLayout` (default) |
| `globals.css` | Global styles, game effects | CSS variables, animations |

### Globe Components (`app/components/globe/`)

| File | Purpose | Key Exports |
|------|---------|-------------|
| `Globe.tsx` | 3D interactive globe with mine pins | `Globe` (default) |

### Game Components (`app/components/game/`)

| File | Purpose | Key Exports |
|------|---------|-------------|
| `HomeBase.tsx` | Home mine dashboard | `HomeBase` |
| `MineDetails.tsx` | Selected mine info panel | `MineDetails` |
| `StakingPanel.tsx` | Stake/unstake modal | `StakingPanel` |
| `ExpeditionPanel.tsx` | Raid planning UI | `ExpeditionPanel` |
| `RaidFeed.tsx` | Live activity feed | `RaidFeed` |

### Hooks (`app/hooks/`)

| File | Purpose | Key Exports |
|------|---------|-------------|
| `useGameSocket.ts` | v2 game WebSocket connection | `useGameSocket` |
| `useMining.ts` | Mining worker management | `useMining` |
| `useWebSocket.ts` | v1 pool connection hook | `useWebSocket` |

### Libraries (`app/lib/`)

| File | Purpose | Key Exports |
|------|---------|-------------|
| `mines.ts` | Client-side mine data | `MINES`, `getMineById`, `RESOURCE_COLORS` |
| `mining.ts` | SHA-256 hashing utilities | `sha256`, `doubleSha256` |

### Workers (`app/workers/`)

| File | Purpose | Key Exports |
|------|---------|-------------|
| `miner.worker.ts` | CPU mining Web Worker | `onmessage` handler |

---

## Server (`server/`)

| File | Purpose | Key Exports |
|------|---------|-------------|
| `index.ts` | v2 WebSocket game server | `startServer` |
| `types.ts` | Shared TypeScript types | All interfaces |

### Game System (`server/game/`)

| File | Purpose | Key Exports |
|------|---------|-------------|
| `types.ts` | Game type definitions | `StakeTier`, `Expedition`, `RaidResult`, etc. |
| `mine-registry.ts` | 20 mine state management | `MineRegistry`, `getMineRegistry` |
| `stake-manager.ts` | Staking with tier multipliers | `StakeManager`, `getStakeManager` |
| `cooldowns.ts` | Cooldown enforcement | `CooldownManager` |
| `expedition-tracker.ts` | Raid expedition lifecycle | `ExpeditionTracker` |
| `raid-engine.ts` | Attack/defense calculations | `RaidEngine`, `getRaidEngine` |

### Pool (`server/pool/`)

| File | Purpose | Key Exports |
|------|---------|-------------|
| `manager.ts` | Per-mine pool management | `PoolManager` |
| `work.ts` | Work unit generation | `generateWork`, `validateWork` |
| `difficulty.ts` | Dynamic difficulty | `adjustDifficulty` |

### Verification (`server/verification/`)

| File | Purpose | Key Exports |
|------|---------|-------------|
| `proof.ts` | Hash proof verification | `verifyProof` |
| `anticheat.ts` | Rate limiting, sybil detection | `AntiCheatService` |

### Solana (`server/solana/`)

| File | Purpose | Key Exports |
|------|---------|-------------|
| `holder.ts` | Holder balance verification | `verifyHolder` |
| `rewards.ts` | Token reward distribution | `sendReward` |
| `buyback.ts` | Automated token buyback | `executeBuyback` |

---

## Configuration (`config/`)

| File | Purpose | Key Exports |
|------|---------|-------------|
| `constants.ts` | Environment-based config | `TOKEN_CONFIG`, `POOL_CONFIG` |
| `holder-tiers.ts` | MC-based holder requirements | `HOLDER_TIERS` |
| `mines.ts` | 20 mine definitions | `MINES`, `RESOURCE_MECHANICS` |

---

## Mine Locations (20 Total)

### Coal (5 mines)
- Appalachian Basin, USA
- Shanxi Province, China
- Hunter Valley, Australia
- Silesia, Poland
- Kuzbass, Russia

### Gold (5 mines)
- Witwatersrand, South Africa
- Carlin Trend, Nevada, USA
- Super Pit, Australia
- Grasberg, Indonesia
- Muruntau, Uzbekistan

### Oil (5 fields)
- Ghawar Field, Saudi Arabia
- Permian Basin, Texas, USA
- **Orinoco Belt, Venezuela**
- Campos Basin, Brazil
- Rumaila, Iraq

### Silver (5 mines)
- Potosí, Bolivia
- Guanajuato, Mexico
- Coeur d'Alene, Idaho, USA
- Cannington, Australia
- Dukat, Russia

---

## Game Mechanics

### Stake Tiers

| Tier | Min Stake | Hashrate | Defense |
|------|-----------|----------|---------|
| Base | 0 | 1.0x | 1.0x |
| Bronze | 100 | 1.5x | 1.2x |
| Silver | 500 | 2.0x | 1.5x |
| Gold | 1,000 | 2.5x | 1.8x |
| Diamond | 5,000 | 3.0x | 2.0x |

### Resource Abilities

| Resource | Barrel Time | Ability |
|----------|-------------|---------|
| Coal | 5 min | +10% loyalty after 7 days |
| Gold | 20 min | 5% jackpot (5x) chance |
| Oil | 10 min | Up to 3x at 50+ miners |
| Silver | 8 min | 0.5x-2x random multiplier |

### Raid Rules

- Attackers need 1.2x defender power to win
- Win: Steal 10-30%, apply 30min debuff
- Lose: Defender gets 2hr immunity
- Bets burned on failed raids

---

## Running the Project

```bash
# Install dependencies
npm install

# Start game server
npm run server

# Start Next.js frontend (separate terminal)
npm run dev

# Start buyback service (separate terminal)
npm run buyback
```

---

## Environment Variables

```bash
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
HELIUS_API_KEY=your_key
REWARD_WALLET_PRIVATE_KEY=base64_encoded_key
TOKEN_MINT_ADDRESS=mint_address
WEBSOCKET_PORT=8080
NEXT_PUBLIC_WS_URL=ws://localhost:8080
```

---

## WebSocket Message Types (v2)

### Client → Server
- `connect` - Initial connection
- `join_mine` - Join a specific mine
- `stake` / `unstake` - Manage stakes
- `set_home` - Set home base
- `start_expedition` - Launch raid
- `rally_defense` - Emergency defense boost
- `hashrate` - Report hashrate
- `submit` - Submit proof

### Server → Client
- `work` - Work unit assignment
- `stats` - Global network stats
- `game_event` - Raids, barrels, jackpots
- `raid_result` - Raid outcome
- `error` - Error messages
