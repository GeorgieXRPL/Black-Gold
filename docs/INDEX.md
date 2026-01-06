# Black Gold Codebase Index

> Last updated: January 2026

## Overview

Black Gold is a CPU mining platform for the COAL token on Solana. It features holder-gated mining (must hold tokens to mine), dynamic difficulty adjustment, and automated buyback of creator rewards.

---

## Directory Structure

```
black-gold/
├── app/                    # Next.js frontend
├── server/                 # Mining pool backend
├── config/                 # Configuration files
├── scripts/                # Standalone scripts
└── docs/                   # Documentation
```

---

## Frontend (`app/`)

| File | Purpose | Key Exports |
|------|---------|-------------|
| `page.tsx` | Main mining dashboard | `HomePage` (default) |
| `layout.tsx` | Root layout with fonts | `RootLayout` (default) |
| `globals.css` | Global styles and theme | CSS variables, animations |

### Components (`app/components/`)

| File | Purpose | Key Exports |
|------|---------|-------------|
| `MiningPanel.tsx` | Mining controls, core selection | `MiningPanel` |
| `StatsCard.tsx` | Network statistics display | `StatsCard` |
| `BarrelFeed.tsx` | Live barrel discovery feed | `BarrelFeed` |
| `HolderGate.tsx` | Holder verification status | `HolderGate` |
| `EmberParticles.tsx` | Animated background particles | `EmberParticles` |

### Hooks (`app/hooks/`)

| File | Purpose | Key Exports |
|------|---------|-------------|
| `useMining.ts` | Mining worker management | `useMining` |
| `useWebSocket.ts` | Pool connection hook | `useWebSocket` |

### Workers (`app/workers/`)

| File | Purpose | Key Exports |
|------|---------|-------------|
| `miner.worker.ts` | CPU mining Web Worker | `onmessage` handler |

### Libraries (`app/lib/`)

| File | Purpose | Key Exports |
|------|---------|-------------|
| `mining.ts` | SHA-256 hashing utilities | `sha256`, `doubleSha256`, `mineRange` |

### API Routes (`app/api/`)

| File | Purpose | Key Exports |
|------|---------|-------------|
| `verify-holder/route.ts` | Holder verification API | `GET` handler |

---

## Server (`server/`)

| File | Purpose | Key Exports |
|------|---------|-------------|
| `index.ts` | WebSocket server entry point | `startServer` |
| `types.ts` | Shared TypeScript types | All interfaces |

### Pool (`server/pool/`)

| File | Purpose | Key Exports |
|------|---------|-------------|
| `manager.ts` | Pool state management | `PoolManager`, `createPoolState` |
| `work.ts` | Work unit generation | `generateWork`, `validateWork`, `startNewBarrel` |
| `difficulty.ts` | Dynamic difficulty adjustment | `adjustDifficulty`, `difficultyToTarget` |

### Verification (`server/verification/`)

| File | Purpose | Key Exports |
|------|---------|-------------|
| `proof.ts` | Hash proof verification | `verifyProof`, `registerWork` |
| `anticheat.ts` | Anti-gaming/sybil detection | `AntiCheatService` |

### Solana (`server/solana/`)

| File | Purpose | Key Exports |
|------|---------|-------------|
| `holder.ts` | Holder balance verification | `verifyHolder`, `updateMarketCap` |
| `rewards.ts` | Token reward distribution | `sendReward`, `getRewardPoolBalance` |
| `buyback.ts` | Automated token buyback | `BuybackService`, `getBuybackService` |

---

## Configuration (`config/`)

| File | Purpose | Key Exports |
|------|---------|-------------|
| `constants.ts` | Environment-based config | `TOKEN_CONFIG`, `POOL_CONFIG`, etc. |
| `holder-tiers.ts` | MC-based holder requirements | `HOLDER_TIERS`, `getRequiredPercent` |

---

## Scripts (`scripts/`)

| File | Purpose | Usage |
|------|---------|-------|
| `buyback.ts` | Standalone buyback service | `npm run buyback` |

---

## Key Types (`server/types.ts`)

### Core Interfaces

- `Miner` - Connected miner state
- `WorkUnit` - Mining work assignment
- `ProofSubmission` - Solution submission from miner
- `BarrelResult` - Successful barrel discovery
- `HolderVerification` - Token holder check result
- `NetworkStats` - Pool statistics

### WebSocket Messages

- `WSMessage<T>` - Message envelope with type and payload
- `ConnectPayload` - Initial connection data
- `HashratePayload` - Hashrate updates
- `ErrorPayload` - Error responses

---

## Security Measures

### Rate Limiting (`server/verification/anticheat.ts`)

- Max 10 submissions per minute per wallet
- Max 3 concurrent connections per IP
- Exponential backoff on failed submissions

### Proof Verification (`server/verification/proof.ts`)

- Server-side SHA-256 double-hash verification
- Nonce range validation
- Work unit expiry checks

### Sybil Detection

- Track unique IPs per wallet (flag at 3+)
- Track unique wallets per IP (flag at 10+)
- Flagged entities get stricter rate limits

---

## Environment Variables

```bash
# Solana
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
HELIUS_API_KEY=your_key

# Wallets
REWARD_WALLET_PRIVATE_KEY=base64_encoded_key
REWARD_WALLET_ADDRESS=public_key
CREATOR_WALLET_ADDRESS=public_key

# Token
TOKEN_MINT_ADDRESS=mint_address_after_launch

# Server
WEBSOCKET_PORT=8080
REDIS_URL=redis://localhost:6379

# Mining
TARGET_BARREL_TIME_MS=900000
MIN_DIFFICULTY=1
MAX_DIFFICULTY=1000000

# Frontend
NEXT_PUBLIC_WS_URL=ws://localhost:8080
```

---

## Running the Project

```bash
# Install dependencies
npm install

# Start Redis (for rate limiting)
docker run -d -p 6379:6379 redis:alpine

# Start mining pool server
npm run server

# Start Next.js frontend (separate terminal)
npm run dev

# Start buyback service (separate terminal)
npm run buyback
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (Next.js)                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ MiningPanel │  │  StatsCard  │  │ BarrelFeed  │              │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘              │
│         │                │                │                      │
│  ┌──────┴────────────────┴────────────────┴──────┐              │
│  │              Web Workers (Mining)              │              │
│  └──────────────────────┬────────────────────────┘              │
└─────────────────────────┼────────────────────────────────────────┘
                          │ WebSocket
┌─────────────────────────┼────────────────────────────────────────┐
│                         ▼                                        │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              Mining Pool Server (Node.js)                │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │    │
│  │  │PoolManager  │  │  Difficulty │  │Work Tracker │      │    │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘      │    │
│  │         │                │                │              │    │
│  │  ┌──────┴────────────────┴────────────────┴──────┐      │    │
│  │  │           Verification Layer                   │      │    │
│  │  │  ┌─────────────┐      ┌─────────────┐         │      │    │
│  │  │  │  AntiCheat  │      │ ProofVerify │         │      │    │
│  │  │  └─────────────┘      └─────────────┘         │      │    │
│  │  └───────────────────────────────────────────────┘      │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│  ┌───────────────────────────┼───────────────────────────────┐  │
│  │            Solana Integration                              │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │  │
│  │  │   Holder    │  │   Rewards   │  │   Buyback   │        │  │
│  │  │ Verification│  │ Distribution│  │   Service   │        │  │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘        │  │
│  └─────────┼────────────────┼────────────────┼────────────────┘  │
└────────────┼────────────────┼────────────────┼────────────────────┘
             │                │                │
             ▼                ▼                ▼
        ┌─────────┐     ┌─────────┐     ┌─────────┐
        │ Helius  │     │ Solana  │     │ Jupiter │
        │   API   │     │   RPC   │     │   API   │
        └─────────┘     └─────────┘     └─────────┘
```
