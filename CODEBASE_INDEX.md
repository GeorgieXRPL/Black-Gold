# Black Gold v2.6 - Codebase Index

> Complete file-by-file documentation for the Black Gold Interactive Mining Globe platform

**Last Updated**: January 8, 2026  
**Version**: 2.6 (Privy Wallet Integration + Resource Styling + Game Docs)  
**Total Files**: 70+ TypeScript/TSX files

---

## Table of Contents

1. [Project Structure](#project-structure)
2. [Frontend (app/)](#frontend-app)
3. [Server (server/)](#server-server)
4. [Game System (server/game/)](#game-system-servergame)
5. [Configuration (config/)](#configuration-config)
6. [Scripts (scripts/)](#scripts-scripts)
7. [Mine Locations](#mine-locations)
8. [Game Mechanics](#game-mechanics)
9. [Data Flow Diagrams](#data-flow-diagrams)

---

## Project Structure

```
black-gold/
├── app/                          # Next.js 14 frontend
│   ├── api/                      # API routes
│   │   ├── auth/                 # Authentication routes
│   │   │   ├── nonce/            # Signature nonce generation
│   │   │   └── verify/           # Signature verification
│   │   └── verify-holder/        # Holder verification endpoint
│   ├── components/               # React UI components
│   │   ├── game/                 # Game-specific components
│   │   └── globe/                # 3D globe components
│   ├── hooks/                    # Custom React hooks
│   ├── lib/                      # Utility libraries
│   ├── providers/                # React context providers
│   │   └── PrivyProvider.tsx     # Wallet authentication
│   ├── workers/                  # Web Workers for mining
│   ├── layout.tsx                # Root layout (with PrivyProvider)
│   ├── page.tsx                  # Main game page
│   └── globals.css               # Global styles
├── server/                       # Node.js backend
│   ├── auth/                     # Wallet authentication (v2.3)
│   │   └── verify-wallet.ts      # Solana signature verification
│   ├── game/                     # Game system (v2)
│   ├── middleware/               # Security middleware (v2.2)
│   │   ├── validate.ts           # Zod message validation
│   │   └── rateLimit.ts          # Per-IP rate limiting
│   ├── pool/                     # Mining pool logic
│   ├── solana/                   # Blockchain integration
│   ├── verification/             # Security & proof validation
│   ├── index.ts                  # Server entry point
│   └── types.ts                  # Shared type definitions
├── config/                       # Configuration files
│   └── mines.ts                  # 20 mine definitions
├── scripts/                      # Standalone scripts
├── docs/                         # Documentation
└── public/                       # Static assets
    └── geo/                      # Geographic data
        ├── world-110m.json       # TopoJSON world borders
        └── continents.json       # Fallback continent outlines
```

---

## Frontend (app/)

### Core Files

| File | Lines | Purpose |
|------|-------|---------|
| `layout.tsx` | ~50 | Root layout with Google Fonts (Bebas Neue, Oswald, JetBrains Mono) |
| `page.tsx` | ~350 | Main game page with 3D globe, mine panels, and raid feed |
| `globals.css` | ~450 | Coal theme CSS, game-specific styles, animations |

### Globe Components (`app/components/globe/`)

| File | Lines | Exports | Purpose |
|------|-------|---------|---------|
| `Globe.tsx` | ~350 | `Globe` (default) | 3D interactive globe with TopoJSON continent outlines, ember glow effects, and mine pins |
| `index.ts` | ~5 | Re-export | Barrel export |

**Globe Features (v2.6):**
- Uses TopoJSON (`world-110m.json`) for accurate country borders
- Multi-layered ember-colored continent edges (outer glow → core → hot highlight)
- Falls back to `continents.json` if TopoJSON fails
- Dark ocean background with subtle grid lines
- **Resource-specific 3D mine pins**: Coal (cubes with ember glow), Gold (faceted icosahedron with shimmer), Oil (smooth spheres with blue sheen), Silver (polished metallic icosahedron)
- Resource legend with unique CSS styling per resource type

### Game Components (`app/components/game/`)

| File | Lines | Exports | Purpose |
|------|-------|---------|---------|
| `HomeBase.tsx` | ~200 | `HomeBase` (default) | Home mine dashboard with mining controls and stats |
| `MineDetails.tsx` | ~180 | `MineDetails` (default) | Selected mine info panel with actions |
| `StakingPanel.tsx` | ~220 | `StakingPanel` (default) | Stake/unstake modal with tier preview |
| `ExpeditionPanel.tsx` | ~200 | `ExpeditionPanel` (default) | Raid planning with power comparison and betting |
| `RaidFeed.tsx` | ~150 | `RaidFeed` (default) | Live activity feed for raids and discoveries |
| `SyndicatePanel.tsx` | ~300 | `SyndicatePanel` (default) | Syndicate management, creation, and member list |
| `SyndicateRaid.tsx` | ~250 | `SyndicateRaid` (default) | Coordinated syndicate raid planning and status |
| `index.ts` | ~15 | All components | Barrel export |

### Legacy Components (`app/components/`)

| File | Lines | Exports | Purpose |
|------|-------|---------|---------|
| `WalletEntry.tsx` | ~350 | `WalletEntry`, `WalletEntryState` | **NEW** Dual-mode wallet entry (address-only or Privy connect) |
| `MiningPanel.tsx` | ~180 | `MiningPanel` | Mining controls (v1 style) |
| `StatsCard.tsx` | ~110 | `StatsCard` | Network statistics display |
| `DiscoveryFeed.tsx` | ~120 | `DiscoveryFeed` | Live resource discovery feed (Coal Veins, Gold Nuggets, etc.) |
| `HolderGate.tsx` | ~140 | `HolderGate` | Holder verification status |
| `EmberParticles.tsx` | ~70 | `EmberParticles` | Animated ember particle background |

### Providers (`app/providers/`)

| File | Lines | Exports | Purpose |
|------|-------|---------|---------|
| `WalletProvider.tsx` | ~250 | `WalletProvider`, `useWalletContext` | SSR-safe wallet context with Privy hooks bridge |
| `PrivyProvider.tsx` | ~82 | `PrivyProvider` | Privy wallet auth wrapper (dynamic import, client-only) |
| `index.ts` | ~8 | Re-exports | Barrel export |

**Provider Order (in layout.tsx):**
```
PrivyProvider        ← Outer: Provides Privy context
  └─ WalletProvider  ← Inner: Uses Privy hooks, exposes wallet state
       └─ App        ← Can use useWallet() anywhere
```

**SSR-Safe Wallet Architecture (v2.6):**
- `PrivyProvider` wraps `WalletProvider` (order matters!)
- `WalletProvider` uses a dynamic `PrivyHooksBridge` component to safely call Privy hooks
- Privy hooks are imported dynamically inside the bridge component after client mount
- `useWallet` hook consumes WalletContext, never calls Privy hooks directly
- Prevents "connectors is null" and SSR build errors
- Connect button triggers Privy login modal when clicked

### Hooks (`app/hooks/`)

| File | Lines | Exports | Purpose |
|------|-------|---------|---------|
| `useGameSocket.ts` | ~250 | `useGameSocket` | v2 WebSocket hook for multi-mine game server |
| `useWebSocket.ts` | ~150 | `useWebSocket` | v1 WebSocket connection |
| `useMining.ts` | ~130 | `useMining` | Mining state management, Web Workers |
| `useWallet.ts` | ~60 | `useWallet`, `usePrivyConfigured` | SSR-safe wallet state via WalletContext |
| `useStaking.ts` | ~140 | `useStaking` | On-chain staking hook with Quarry integration |
| `useHolderVerification.ts` | ~80 | `useHolderVerification` | Holder verification API hook |
| `index.ts` | ~12 | Re-exports | Barrel export for all hooks |

### Libraries (`app/lib/`)

| File | Lines | Exports | Purpose |
|------|-------|---------|---------|
| `mines.ts` | ~160 | `MINES`, `getMineById`, `RESOURCE_COLORS`, `STAKE_TIERS` | Client-side mine data and utilities |
| `mining.ts` | ~120 | `sha256`, `doubleSha256`, `mineRange` | SHA-256 hashing utilities |

### Workers (`app/workers/`)

| File | Lines | Purpose |
|------|-------|---------|
| `miner.worker.ts` | ~150 | Web Worker that performs CPU mining loop |

### API Routes (`app/api/`)

| File | Lines | Method | Purpose |
|------|-------|--------|---------|
| `verify-holder/route.ts` | ~140 | `GET` | Verifies wallet holds required token % |
| `status/route.ts` | ~55 | `GET` | **NEW** System status and service health check |
| `auth/nonce/route.ts` | ~45 | `POST` | Generate nonce for wallet signature |
| `auth/verify/route.ts` | ~75 | `POST` | Verify signed wallet actions |
| `admin/auth/route.ts` | ~40 | `POST` | Admin console authentication |

---

## Server (server/)

### Entry Point

| File | Lines | Exports | Purpose |
|------|-------|---------|---------|
| `index.ts` | ~550 | `startServer`, `stopServer` | v2 WebSocket server with multi-mine and game support |
| `types.ts` | ~220 | All interfaces | Shared TypeScript interfaces |

### Pool Module (`server/pool/`)

| File | Lines | Exports | Purpose |
|------|-------|---------|---------|
| `manager.ts` | ~450 | `PoolManager`, `PoolState`, `ConnectedMiner` | Per-mine pool coordinator |
| `work.ts` | ~180 | `WorkTracker`, `generateWork`, `validateWork` | Work unit generation |
| `difficulty.ts` | ~120 | `DifficultyState`, `adjustDifficulty` | Dynamic difficulty adjustment |
| `index.ts` | ~30 | Re-exports | Barrel exports |

---

## Game System (server/game/)

### Core Game Files

| File | Lines | Exports | Purpose |
|------|-------|---------|---------|
| `types.ts` | ~350 | `StakeTier`, `Expedition`, `RaidResult`, `MineState`, `Syndicate`, etc. | All game type definitions |
| `mine-registry.ts` | ~350 | `MineRegistry`, `getMineRegistry` | 20 mine state management with resource-specific mechanics |
| `stake-manager.ts` | ~300 | `StakeManager`, `getStakeManager` | Staking with tier multipliers and loyalty tracking |
| `cooldowns.ts` | ~150 | `CooldownManager`, `getCooldownManager` | Cooldown enforcement |
| `expedition-tracker.ts` | ~350 | `ExpeditionTracker`, `getExpeditionTracker` | Raid expedition lifecycle |
| `raid-engine.ts` | ~350 | `RaidEngine`, `getRaidEngine` | Attack/defense calculations, bet burning, defender spoils |
| `vault-manager.ts` | ~200 | `VaultManager`, `getVaultManager` | Accumulates 30% of discovery rewards for hourly distribution |
| `distribution-service.ts` | ~280 | `DistributionService`, `getDistributionService` | Hourly pool distribution weighted by contribution score |
| `syndicate-manager.ts` | ~280 | `SyndicateManager`, `getSyndicateManager` | Alliance creation, join/leave, invitations |
| `syndicate-raids.ts` | ~250 | `SyndicateRaids`, `getSyndicateRaids` | Coordinated raids with pooled attack power |
| `reward-orchestrator.ts` | ~220 | `initRewardOrchestrator`, `handleNewDiscovery` | **NEW** Connects buyback→distribution flow |
| `index.ts` | ~55 | Re-exports | Barrel exports |

### Solana Module (`server/solana/`)

| File | Lines | Exports | Purpose |
|------|-------|---------|---------|
| `holder.ts` | ~180 | `verifyHolder`, `createConnection` | Token holder verification via Helius |
| `rewards.ts` | ~280 | `sendReward`, `queueReward` | SPL token reward distribution (security-hardened v2.2) |
| `buyback.ts` | ~360 | `executeBuyback`, `shouldExecuteBuyback` | Automated SOL→COAL swap |
| `staking.ts` | ~220 | `buildStakeTransaction`, `buildUnstakeTransaction` | **NEW** Quarry SDK on-chain staking |
| `index.ts` | ~60 | Re-exports | Barrel exports |

**Security Hardening (rewards.ts - v2.2):**
- Private key handling documented with security warnings
- Error messages sanitized to prevent key exposure
- Regex filtering removes potential key data from logs

### Auth Module (`server/auth/`)

| File | Lines | Exports | Purpose |
|------|-------|---------|---------|
| `verify-wallet.ts` | ~160 | `verifySignature`, `verifySignedAction`, `generateNonce` | Solana wallet signature verification |
| `index.ts` | ~15 | Re-exports | Barrel exports |

### Verification Module (`server/verification/`)

| File | Lines | Exports | Purpose |
|------|-------|---------|---------|
| `proof.ts` | ~280 | `verifyProof`, `doubleSHA256` | Server-side proof verification |
| `anticheat.ts` | ~500 | `AntiCheatService` | Rate limiting, sybil detection |

---

## Configuration (config/)

| File | Lines | Exports | Purpose |
|------|-------|---------|---------|
| `constants.ts` | ~110 | `TOKEN_CONFIG`, `POOL_CONFIG`, `NETWORK`, `IS_DEVNET` | Environment-based configuration with devnet support |
| `holder-tiers.ts` | ~70 | `HOLDER_TIERS`, `getRequiredPercent` | Dynamic holder requirements |
| `mines.ts` | ~280 | `MINES`, `RESOURCE_MECHANICS`, `getMineById` | 20 mine definitions with coordinates |

---

## Scripts (scripts/)

| File | Lines | Purpose | Usage |
|------|-------|---------|-------|
| `buyback.ts` | ~215 | Standalone buyback service | `npm run buyback` |

---

## Documentation (docs/)

### Core Documentation

| File | Purpose |
|------|---------|
| `INDEX.md` | Main project documentation |
| `GAME_MECHANICS.md` | **NEW v2.6** Complete game rules, mechanics, and player guide |
| `ECONOMICS.md` | **NEW v2.6** Tokenomics, sustainability analysis, earnings estimates |
| `DEPLOYMENT.md` | Step-by-step deployment guide for Vercel + Railway |

### Technical Guides

| File | Purpose |
|------|---------|
| `DEVNET_SETUP.md` | Devnet testing environment setup |
| `HELIUS_SETUP.md` | Helius API configuration guide |
| `SOLANA_INTEGRATION.md` | Solana blockchain integration details |
| `FRONTEND_INDEX.md` | Frontend component documentation |
| `PARALLEL_AGENTS.md` | Guide for multi-agent development |

### Security

| File | Purpose |
|------|---------|
| `SECURITY.md` | Security architecture overview |
| `SECURITY_CHECKLIST.md` | Security testing checklist and verification |
| `SECURITY_VERIFICATION.md` | Proof verification algorithm details |

---

## Mine Locations

### Coal Mines (5)

| Mine | Country | Coordinates |
|------|---------|-------------|
| Appalachian Basin | USA | 38.5°N, 82.5°W |
| Shanxi Province | China | 37.5°N, 112.5°E |
| Hunter Valley | Australia | 32.5°S, 151.0°E |
| Silesia | Poland | 50.3°N, 19.0°E |
| Kuzbass | Russia | 54.0°N, 87.0°E |

### Gold Mines (5)

| Mine | Country | Coordinates |
|------|---------|-------------|
| Witwatersrand | South Africa | 26.2°S, 28.0°E |
| Carlin Trend | USA (Nevada) | 40.7°N, 116.2°W |
| Super Pit | Australia | 30.8°S, 121.5°E |
| Grasberg | Indonesia | 4.1°S, 137.1°E |
| Muruntau | Uzbekistan | 41.5°N, 64.6°E |

### Oil Fields (5)

| Field | Country | Coordinates |
|-------|---------|-------------|
| Ghawar Field | Saudi Arabia | 25.4°N, 49.6°E |
| Permian Basin | USA (Texas) | 31.8°N, 102.4°W |
| **Orinoco Belt** | **Venezuela** | **8.5°N, 64.0°W** |
| Campos Basin | Brazil | 22.4°S, 40.0°W |
| Rumaila | Iraq | 30.5°N, 47.3°E |

### Silver Mines (5)

| Mine | Country | Coordinates |
|------|---------|-------------|
| Potosí | Bolivia | 19.6°S, 65.8°W |
| Guanajuato | Mexico | 21.0°N, 101.3°W |
| Coeur d'Alene | USA (Idaho) | 47.7°N, 116.8°W |
| Cannington | Australia | 21.9°S, 140.9°E |
| Dukat | Russia | 62.5°N, 155.0°E |

---

## Game Mechanics

> 📖 **For complete game rules and player guide, see [docs/GAME_MECHANICS.md](docs/GAME_MECHANICS.md)**  
> 💰 **For tokenomics and economics analysis, see [docs/ECONOMICS.md](docs/ECONOMICS.md)**

### Resource Types & Discovery Names

| Resource | Discovery Time | Discovery Name | Special Ability |
|----------|----------------|----------------|-----------------|
| **Coal** | 5 min | Coal Seam | Steady Burn: +10% loyalty bonus after 7 days |
| **Gold** | 20 min | Gold Nugget | Gold Rush: 5% chance of 5x jackpot |
| **Oil** | 10 min | Oil Gusher | Syndicate: Up to 3x multiplier at 50+ miners |
| **Silver** | 8 min | Silver Lode | Speculation: 0.5x - 2x random multiplier |

### Stake Tiers

| Tier | Min Stake | Hashrate Boost | Defense Boost |
|------|-----------|----------------|---------------|
| Base | 0 | 1.0x | 1.0x |
| Bronze | 100 | 1.5x | 1.2x |
| Silver | 500 | 2.0x | 1.5x |
| Gold | 1,000 | 2.5x | 1.8x |
| Diamond | 5,000 | 3.0x | 2.0x |

### Reward Distribution System

**Dual Reward Structure:**
- **70% Instant** → Goes directly to the miner who finds the discovery
- **30% Pooled** → Accumulates in the mine's vault for hourly distribution

**Hourly Pool Distribution (weighted by):**
- Hashrate contribution at the mine
- Stake amount and tier
- Loyalty duration (time at home mine)

**Contribution Score Formula:**
```
score = (hashrate × 0.4) + (stakeAmount × 0.3) + (loyaltyBonus × 0.3)
```

### Raid Mechanics

- **Attack Power** = (Hashrate × 0.5) + (Stake × 0.1)
- **Defense Advantage** = 1.2x (attackers need 20% more power)
- **Steal Range** = 10-30% of discovery rewards
- **Immunity Duration** = 2 hours after successful defense
- **Bet Limit** = Up to 20% of stake
- **Failed Attack Penalty**: 
  - 10% of bet → Distributed to defenders
  - 90% of bet → Permanently burned

### Syndicate System (Alliances)

**Features:**
- Create syndicates with up to 20 members
- Invite players via wallet address
- Coordinate group raids with pooled attack power

**Syndicate Raid Mechanics:**
- All participating members' attack power is combined
- Rewards are split proportionally to contribution
- Shared cooldowns for coordinated attacks
- Bonus multiplier for full syndicate participation

### Cooldowns

| Action | Duration |
|--------|----------|
| Home Base Switch | 24 hours |
| Start Expedition | 1 hour |
| Post-Expedition Recovery | 30 minutes |
| Rally Defense | 1 hour |

---

## Data Flow Diagrams

### Multi-Mine Mining Flow

```
┌─────────────────┐
│    Browser      │
│   (3D Globe)    │
└────────┬────────┘
         │ Select Mine
         ▼
┌─────────────────┐      ┌─────────────────┐
│   join_mine     │ ───▶ │  Mine Registry  │
│   message       │      │  (Add Miner)    │
└────────┬────────┘      └─────────────────┘
         │
         ▼
┌─────────────────┐      ┌─────────────────┐
│   Pool Manager  │ ◀─── │  Stake Manager  │
│   (Per Mine)    │      │  (Multipliers)  │
└────────┬────────┘      └─────────────────┘
         │
         ▼ work unit
┌─────────────────┐
│   Web Worker    │
│   (Mining)      │
└────────┬────────┘
         │ submit proof
         ▼
┌─────────────────┐
│   Raid Engine   │ ──▶ Resolve active raids
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Broadcast     │ ──▶ barrel_found + raid_result
└─────────────────┘
```

### Raid Flow

```
┌──────────────┐    start_expedition    ┌──────────────┐
│   Attacker   │ ─────────────────────▶ │  Expedition  │
│  (Home Mine) │                        │   Tracker    │
└──────────────┘                        └──────┬───────┘
                                               │
                                               ▼
                                        ┌──────────────┐
                                        │ Target Mine  │
                                        │ (Registry)   │
                                        └──────┬───────┘
                                               │
                                               │ On discovery found
                                               ▼
┌──────────────┐    resolve_raid        ┌──────────────┐
│ Raid Engine  │ ◀───────────────────── │ Pool Manager │
└──────┬───────┘                        └──────────────┘
       │
       ▼ Calculate powers
┌──────────────────────────────────────────────────────┐
│  Attack Power vs Defense Power × 1.2                 │
│  If Attack > Defense: Steal 10-30%, apply debuff     │
│  If Defense wins: 2hr immunity                       │
│    - 10% of attacker bets → Defenders                │
│    - 90% of attacker bets → Burned                   │
└──────────────────────────────────────────────────────┘
```

### Reward Distribution Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    DISCOVERY FOUND                          │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
            ┌───────────────────────────────┐
            │      Split Rewards (100%)      │
            └───────────────┬───────────────┘
                            │
           ┌────────────────┴────────────────┐
           │                                 │
           ▼                                 ▼
    ┌─────────────┐                  ┌─────────────┐
    │  70% Instant │                  │  30% Pooled  │
    │  to Finder   │                  │  to Vault    │
    └──────┬──────┘                  └──────┬──────┘
           │                                 │
           ▼                                 ▼
    ┌─────────────┐                  ┌─────────────┐
    │ Immediate   │                  │ Accumulate  │
    │ Token Send  │                  │ in Mine     │
    └─────────────┘                  │ Vault       │
                                     └──────┬──────┘
                                            │
                                            │ Every hour
                                            ▼
                                     ┌─────────────┐
                                     │ Distribution │
                                     │ Service      │
                                     └──────┬──────┘
                                            │
                                            ▼ Calculate scores
                              ┌─────────────────────────────┐
                              │  For each active miner:     │
                              │  score = hashrate × 0.4     │
                              │        + stake × 0.3        │
                              │        + loyalty × 0.3      │
                              └─────────────────────────────┘
                                            │
                                            ▼
                              ┌─────────────────────────────┐
                              │  reward = (score/totalScore)│
                              │          × vaultBalance     │
                              └─────────────────────────────┘
```

### Syndicate Raid Flow

```
┌─────────────┐    create_syndicate    ┌─────────────────┐
│   Leader    │ ─────────────────────▶ │   Syndicate     │
│   (User)    │                        │   Manager       │
└─────────────┘                        └────────┬────────┘
                                                │
       ┌────────────────────────────────────────┤
       │ invite / accept                        │
       ▼                                        │
┌─────────────┐                                 │
│  Members    │ ◀───────────────────────────────┘
│  (1-20)     │
└──────┬──────┘
       │
       │ start_syndicate_raid
       ▼
┌─────────────────┐
│ Syndicate Raids │
│   Manager       │
└────────┬────────┘
         │
         ▼ Pool attack power
┌─────────────────────────────────────────┐
│  Combined Power = Σ(member attack power) │
│  Apply syndicate bonus (up to 1.25x)    │
└─────────────────────────────────────────┘
         │
         ▼ On resolution
┌─────────────────────────────────────────┐
│  Split rewards by contribution ratio    │
│  Apply shared cooldown to all members   │
└─────────────────────────────────────────┘
```

---

## Environment Variables

| Variable | Used In | Required |
|----------|---------|----------|
| `SOLANA_NETWORK` | constants.ts | No (default: mainnet) |
| `NEXT_PUBLIC_WS_URL` | Frontend | Yes |
| `NEXT_PUBLIC_PRIVY_APP_ID` | PrivyProvider.tsx | Yes (for wallet) |
| `NEXT_PUBLIC_SOLANA_NETWORK` | Frontend | No (for devnet indicator) |
| `HELIUS_API_KEY` | holder.ts, buyback.ts | Recommended |
| `SOLANA_RPC_URL` | holder.ts | No (has default) |
| `TOKEN_MINT_ADDRESS` | constants.ts | Yes (after launch) |
| `REWARD_WALLET_PRIVATE_KEY` | rewards.ts | Yes |
| `REWARD_WALLET_ADDRESS` | constants.ts | Yes |
| `CREATOR_WALLET_PRIVATE_KEY` | buyback.ts | Yes |
| `CREATOR_WALLET_ADDRESS` | constants.ts | Yes |
| `QUARRY_REWARDER_ADDRESS` | staking.ts | Yes (after setup) |
| `QUARRY_ADDRESS` | staking.ts | Yes (after setup) |
| `ADMIN_SECRET` | admin/layout.tsx | Yes |
| `WEBSOCKET_PORT` | constants.ts | No (default 8080) |
| `NEXT_PUBLIC_USE_MOCKS` | Frontend | No (default: false) |

---

## NPM Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `dev` | `next dev` | Start frontend dev server |
| `build` | `next build` | Build frontend for production |
| `server` | `tsx watch server/index.ts` | Start game server (dev) |
| `server:prod` | `tsx server/index.ts` | Start game server (prod) |
| `buyback` | `tsx watch scripts/buyback.ts` | Start buyback service (dev) |
| `buyback:prod` | `tsx scripts/buyback.ts` | Start buyback service (prod) |

---

## File Line Counts Summary

| Category | Files | Total Lines |
|----------|-------|-------------|
| Frontend Globe/Game | 9 | ~1,880 |
| Frontend Legacy | 5 | ~620 |
| Frontend Hooks | 6 | ~735 |
| Frontend Providers | 2 | ~60 |
| Frontend Pages/Layout | 3 | ~850 |
| Frontend API Routes | 3 | ~260 |
| Server Game System | 11 | ~2,790 |
| Server Middleware | 2 | ~590 |
| Server Pool | 4 | ~780 |
| Server Solana | 4 | ~865 |
| Server Auth | 2 | ~175 |
| Server Verification | 2 | ~780 |
| Server Core | 2 | ~820 |
| Config | 3 | ~440 |
| Scripts | 1 | ~215 |
| **Total** | **59** | **~11,860** |
