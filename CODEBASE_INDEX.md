# Black Gold - Codebase Index

> Complete file-by-file documentation for the Black Gold CPU mining platform

**Last Updated**: January 2026  
**Total Files**: 28 TypeScript/TSX files

---

## Table of Contents

1. [Project Structure](#project-structure)
2. [Frontend (app/)](#frontend-app)
3. [Server (server/)](#server-server)
4. [Configuration (config/)](#configuration-config)
5. [Scripts (scripts/)](#scripts-scripts)
6. [Shared Types](#shared-types)
7. [Data Flow Diagrams](#data-flow-diagrams)

---

## Project Structure

```
black-gold/
├── app/                          # Next.js 14 frontend
│   ├── api/                      # API routes
│   │   └── verify-holder/        # Holder verification endpoint
│   ├── components/               # React UI components
│   ├── hooks/                    # Custom React hooks
│   ├── lib/                      # Utility libraries
│   ├── workers/                  # Web Workers for mining
│   ├── layout.tsx                # Root layout
│   ├── page.tsx                  # Main page
│   └── globals.css               # Global styles
├── server/                       # Node.js backend
│   ├── pool/                     # Mining pool logic
│   ├── solana/                   # Blockchain integration
│   ├── verification/             # Security & proof validation
│   ├── index.ts                  # Server entry point
│   └── types.ts                  # Shared type definitions
├── config/                       # Configuration files
├── scripts/                      # Standalone scripts
├── docs/                         # Documentation
└── public/                       # Static assets
```

---

## Frontend (app/)

### Core Files

| File | Lines | Purpose |
|------|-------|---------|
| `layout.tsx` | ~50 | Root layout with Google Fonts (Bebas Neue, Oswald, JetBrains Mono) |
| `page.tsx` | ~250 | Main dashboard page with mining controls, stats, and barrel feed |
| `globals.css` | ~355 | Coal theme CSS variables, animations, ember effects |

### Components (`app/components/`)

| File | Lines | Exports | Purpose |
|------|-------|---------|---------|
| `MiningPanel.tsx` | ~180 | `MiningPanel` | Mining controls: start/stop, core selection, hashrate display, wallet input modal |
| `StatsCard.tsx` | ~110 | `StatsCard` | Network statistics: miners, hashrate, difficulty, rewards |
| `BarrelFeed.tsx` | ~100 | `BarrelFeed` | Live feed of barrel discoveries with winner addresses and rewards |
| `HolderGate.tsx` | ~140 | `HolderGate` | Holder verification status: balance, eligibility, progress bar |
| `EmberParticles.tsx` | ~70 | `EmberParticles` | Animated ember particle background effect |
| `index.ts` | ~10 | All components | Barrel export for clean imports |

### Hooks (`app/hooks/`)

| File | Lines | Exports | Purpose |
|------|-------|---------|---------|
| `useWebSocket.ts` | ~150 | `useWebSocket` | WebSocket connection to mining pool, handles connect/disconnect, messages |
| `useMining.ts` | ~130 | `useMining` | Mining state management, controls Web Workers, tracks hashrate |

### Libraries (`app/lib/`)

| File | Lines | Exports | Purpose |
|------|-------|---------|---------|
| `mining.ts` | ~120 | `sha256`, `doubleSha256`, `mineRange`, `meetsTarget`, `difficultyToTarget` | SHA-256 hashing utilities for mining |

### Workers (`app/workers/`)

| File | Lines | Purpose |
|------|-------|---------|
| `miner.worker.ts` | ~150 | Web Worker that performs CPU mining loop, computes double SHA-256 hashes |

### API Routes (`app/api/`)

| File | Lines | Method | Purpose |
|------|-------|--------|---------|
| `verify-holder/route.ts` | ~140 | `GET` | Verifies wallet holds required token % via Helius API |

---

## Server (server/)

### Entry Point

| File | Lines | Exports | Purpose |
|------|-------|---------|---------|
| `index.ts` | ~250 | `startServer`, `stopServer`, `getPoolManager` | WebSocket server entry, connection handling, message routing |
| `types.ts` | ~180 | All interfaces | Shared TypeScript interfaces for the entire backend |

### Pool Module (`server/pool/`)

| File | Lines | Exports | Purpose |
|------|-------|---------|---------|
| `manager.ts` | ~450 | `PoolManager`, `PoolState`, `ConnectedMiner`, `PoolEventHandlers` | Central pool coordinator: miners, work distribution, barrel discovery |
| `work.ts` | ~180 | `WorkTracker`, `generateWork`, `validateWork`, `startNewBarrel`, `cleanupExpiredWork` | Work unit generation and validation |
| `difficulty.ts` | ~120 | `DifficultyState`, `adjustDifficulty`, `difficultyToTarget`, `updateHashrateEstimate` | Dynamic difficulty adjustment |
| `index.ts` | ~30 | Re-exports | Barrel exports for pool module |

### Solana Module (`server/solana/`)

| File | Lines | Exports | Purpose |
|------|-------|---------|---------|
| `holder.ts` | ~180 | `verifyHolder`, `createConnection`, `updateMarketCap`, `clearCache` | Token holder verification via Helius API |
| `rewards.ts` | ~250 | `sendReward`, `queueReward`, `processPendingRewards`, `getRewardPoolBalance` | SPL token reward distribution to miners |
| `buyback.ts` | ~360 | `executeBuyback`, `shouldExecuteBuyback`, `getSwapQuote`, `getBuybackStats` | Automated SOL→COAL swap via Jupiter API |
| `index.ts` | ~45 | Re-exports | Barrel exports for Solana module |

### Verification Module (`server/verification/`)

| File | Lines | Exports | Purpose |
|------|-------|---------|---------|
| `proof.ts` | ~280 | `verifyProof`, `doubleSHA256`, `registerWorkUnit`, `getVerificationStats` | Server-side proof verification with audit logging |
| `anticheat.ts` | ~500 | `AntiCheatService`, `SubmissionCheckResult`, `SuspiciousActivityLog` | Rate limiting, sybil detection, exponential backoff |

---

## Configuration (config/)

| File | Lines | Exports | Purpose |
|------|-------|---------|---------|
| `constants.ts` | ~90 | `TOKEN_CONFIG`, `WALLET_CONFIG`, `RPC_CONFIG`, `POOL_CONFIG`, `RATE_LIMIT_CONFIG`, `HOLDER_CONFIG`, `BUYBACK_CONFIG` | All configuration constants from environment |
| `holder-tiers.ts` | ~70 | `HOLDER_TIERS`, `getRequiredPercent`, `getTier`, `meetsRequirement` | Dynamic holder requirement tiers based on market cap |

---

## Scripts (scripts/)

| File | Lines | Purpose | Usage |
|------|-------|---------|-------|
| `buyback.ts` | ~215 | Standalone buyback service that monitors creator wallet and swaps SOL→COAL | `npm run buyback` |

---

## Shared Types

All shared types are defined in `server/types.ts`:

### Core Interfaces

```typescript
interface Miner {
  walletAddress: string;
  ip: string;
  hashrate: number;
  connectedAt: Date;
  lastSeen: Date;
  cores: number;
  nonceRange: { start: number; end: number };
}

interface WorkUnit {
  id: string;
  barrelHeader: string;
  target: string;
  nonceStart: number;
  nonceEnd: number;
  timestamp: number;
  barrelNumber: number;
}

interface ProofSubmission {
  walletAddress: string;
  nonce: number;
  hash: string;
  workUnitId: string;
  timestamp: number;
}

interface BarrelResult {
  barrelNumber: number;
  winner: string;
  hash: string;
  nonce: number;
  reward: number;
  timestamp: Date;
  txSignature?: string;
}

interface HolderVerification {
  walletAddress: string;
  balance: number;
  percentOfSupply: number;
  requiredPercent: number;
  isEligible: boolean;
  cachedAt: Date;
  marketCap: number;
}

interface NetworkStats {
  totalMiners: number;
  networkHashrate: number;
  totalBarrels: number;
  difficulty: number;
  lastBarrelTime: Date | null;
  totalRewardsDistributed: number;
  currentRewardPool: number;
}
```

### WebSocket Message Types

```typescript
type WSMessageType =
  | 'connect'      // Client connects with wallet + cores
  | 'work'         // Server sends work unit
  | 'submit'       // Client submits proof
  | 'result'       // Server confirms submission
  | 'stats'        // Network statistics broadcast
  | 'error'        // Error message
  | 'hashrate'     // Client reports hashrate
  | 'barrel_found';// Barrel discovery broadcast

interface WSMessage<T> {
  type: WSMessageType;
  payload: T;
  timestamp: number;
}
```

---

## Data Flow Diagrams

### Mining Flow

```
┌─────────────┐     connect      ┌─────────────┐
│   Browser   │ ──────────────▶  │   Server    │
│  (Miner)    │                  │   (Pool)    │
└─────────────┘                  └─────────────┘
      │                                │
      │  ◀─────── work unit ───────    │
      │                                │
      ▼                                │
┌─────────────┐                        │
│ Web Worker  │  compute hashes        │
│ (SHA-256)   │  ──────────────────    │
└─────────────┘                        │
      │                                │
      │  ─────── submit proof ─────▶   │
      │                                ▼
      │                         ┌─────────────┐
      │                         │   Verify    │
      │                         │   Proof     │
      │                         └─────────────┘
      │                                │
      │  ◀─── barrel_found ────────    │ (if valid)
      │                                │
      │                                ▼
      │                         ┌─────────────┐
      │                         │   Send      │
      │                         │   Reward    │
      │                         └─────────────┘
```

### Holder Verification Flow

```
┌─────────────┐                  ┌─────────────┐
│   Frontend  │ ── GET /api ──▶  │  API Route  │
└─────────────┘   verify-holder  └─────────────┘
                                       │
                                       ▼
                                ┌─────────────┐
                                │   Helius    │
                                │    API      │
                                └─────────────┘
                                       │
                                       ▼
                                ┌─────────────┐
                                │   Check     │
                                │   Balance   │
                                └─────────────┘
                                       │
                                       ▼
                                ┌─────────────┐
                                │  Get Tier   │
                                │  From MC    │
                                └─────────────┘
                                       │
                                       ▼
                          { isEligible, balance, ... }
```

### Buyback Flow

```
┌─────────────┐                  ┌─────────────┐
│  Pump.fun   │ ── creator ──▶   │  Creator    │
│  Trading    │    rewards       │   Wallet    │
└─────────────┘                  └─────────────┘
                                       │
                                       ▼
                                ┌─────────────┐
                                │  Buyback    │
                                │  Service    │
                                └─────────────┘
                                       │
                              check balance > min
                                       │
                                       ▼
                                ┌─────────────┐
                                │  Jupiter    │
                                │   Swap      │
                                └─────────────┘
                                       │
                                  SOL → COAL
                                       │
                                       ▼
                                ┌─────────────┐
                                │   Reward    │
                                │   Wallet    │
                                └─────────────┘
```

---

## Security Layers

| Layer | File | Protection |
|-------|------|------------|
| Rate Limiting | `anticheat.ts` | 10 submissions/min per wallet |
| Sybil Detection | `anticheat.ts` | Flag wallets with 3+ IPs/hour |
| Proof Verification | `proof.ts` | Server-side double SHA-256 |
| Nonce Validation | `proof.ts` | Nonce must be in assigned range |
| Connection Limits | `anticheat.ts` | 3 connections per IP |
| Exponential Backoff | `anticheat.ts` | Doubles on each failure |
| Holder Verification | `holder.ts` | Must hold required token % |

---

## Environment Variables

| Variable | Used In | Required |
|----------|---------|----------|
| `NEXT_PUBLIC_WS_URL` | Frontend | Yes |
| `HELIUS_API_KEY` | holder.ts, buyback.ts | Yes |
| `SOLANA_RPC_URL` | holder.ts | No (has default) |
| `TOKEN_MINT_ADDRESS` | constants.ts | Yes (after launch) |
| `REWARD_WALLET_PRIVATE_KEY` | rewards.ts | Yes |
| `REWARD_WALLET_ADDRESS` | constants.ts | Yes |
| `CREATOR_WALLET_PRIVATE_KEY` | buyback.ts | Yes |
| `CREATOR_WALLET_ADDRESS` | constants.ts | Yes |
| `WEBSOCKET_PORT` | constants.ts | No (default 8080) |
| `REDIS_URL` | constants.ts | No |

---

## NPM Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `dev` | `next dev` | Start frontend dev server |
| `build` | `next build` | Build frontend for production |
| `server` | `tsx watch server/index.ts` | Start pool server (dev) |
| `server:prod` | `tsx server/index.ts` | Start pool server (prod) |
| `buyback` | `tsx watch scripts/buyback.ts` | Start buyback service (dev) |
| `buyback:prod` | `tsx scripts/buyback.ts` | Start buyback service (prod) |

---

## File Line Counts Summary

| Category | Files | Total Lines |
|----------|-------|-------------|
| Frontend Components | 6 | ~610 |
| Frontend Hooks | 2 | ~280 |
| Frontend Pages/Layout | 3 | ~660 |
| Server Pool | 4 | ~780 |
| Server Solana | 4 | ~835 |
| Server Verification | 2 | ~780 |
| Server Core | 2 | ~430 |
| Config | 2 | ~160 |
| Scripts | 1 | ~215 |
| **Total** | **26** | **~4,750** |
