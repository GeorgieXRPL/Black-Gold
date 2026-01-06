# Black Gold ⛏️

> CPU Mining Platform for COAL Token on Solana

Black Gold is the first **holder-gated Proof-of-Work** mining platform on Pump.fun. Hold COAL tokens to mine. No wallet connection required - just paste your address and start drilling.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Solana](https://img.shields.io/badge/Solana-black?logo=solana)
![Next.js](https://img.shields.io/badge/Next.js-black?logo=next.js)

---

## Features

- **🔒 Holder-Gated Mining** - Must hold COAL tokens to participate
- **📉 Dynamic Requirements** - Required holdings decrease as market cap grows
- **⚡ CPU Mining** - Mine using your browser, no special hardware needed
- **🎯 Dynamic Difficulty** - Adjusts to maintain consistent barrel times
- **💰 Instant Rewards** - COAL sent directly to your wallet
- **🔄 Auto Buyback** - Creator rewards automatically buy back tokens

---

## Quick Start

### Prerequisites

- Node.js 18+
- Redis (for rate limiting)
- Solana wallet

### Installation

```bash
# Clone the repository
git clone https://github.com/your-repo/black-gold.git
cd black-gold

# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local

# Edit .env.local with your configuration
```

### Running Locally

```bash
# Terminal 1: Start Redis
docker run -d -p 6379:6379 redis:alpine

# Terminal 2: Start mining pool server
npm run server

# Terminal 3: Start frontend
npm run dev

# Terminal 4 (optional): Start buyback service
npm run buyback
```

Visit `http://localhost:3000` to start mining!

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Browser (Frontend)                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │  Dashboard  │  │ Web Workers │  │  WebSocket  │          │
│  │     UI      │  │   Mining    │  │   Client    │          │
│  └─────────────┘  └─────────────┘  └──────┬──────┘          │
└────────────────────────────────────────────┼─────────────────┘
                                             │
┌────────────────────────────────────────────┼─────────────────┐
│                  Mining Pool Server        │                 │
│  ┌─────────────┐  ┌─────────────┐  ┌──────┴──────┐          │
│  │    Pool     │  │  Difficulty │  │   WebSocket │          │
│  │   Manager   │  │  Adjustment │  │    Server   │          │
│  └─────────────┘  └─────────────┘  └─────────────┘          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │   Holder    │  │    Proof    │  │  Anti-Cheat │          │
│  │ Verification│  │ Verification│  │   Service   │          │
│  └─────────────┘  └─────────────┘  └─────────────┘          │
└──────────────────────────────────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
    ┌──────────┐    ┌──────────┐    ┌──────────┐
    │  Helius  │    │  Solana  │    │ Jupiter  │
    │   API    │    │   RPC    │    │   API    │
    └──────────┘    └──────────┘    └──────────┘
```

---

## How It Works

### 1. Holder Verification

Before mining, users must hold a minimum percentage of COAL supply:

| Market Cap | Required % | Example (1B Supply) |
|------------|------------|---------------------|
| < $10K | 0.5% | 5,000,000 COAL |
| $10K - $25K | 0.3% | 3,000,000 COAL |
| $25K - $50K | 0.2% | 2,000,000 COAL |
| $50K - $100K | 0.1% | 1,000,000 COAL |
| $100K - $250K | 0.05% | 500,000 COAL |
| $250K - $500K | 0.025% | 250,000 COAL |
| $500K - $1M | 0.01% | 100,000 COAL |
| > $1M | 0.005% | 50,000 COAL |

### 2. Mining Process

1. User enters wallet address (no connection needed)
2. Server verifies holder status via Helius API
3. User receives work unit with nonce range
4. Browser computes SHA-256 double-hashes
5. When valid proof found, submitted to server
6. Server verifies and sends reward

### 3. Reward Distribution

- Creator rewards collected from Pump.fun (~3 min intervals)
- Buyback service swaps SOL → COAL via Jupiter
- Tokens added to reward pool
- Barrel finder receives pool contents

---

## Configuration

### Environment Variables

```bash
# Required
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
HELIUS_API_KEY=your_helius_key
REWARD_WALLET_PRIVATE_KEY=base64_encoded_key
TOKEN_MINT_ADDRESS=your_token_mint

# Optional
WEBSOCKET_PORT=8080
TARGET_BARREL_TIME_MS=900000
REDIS_URL=redis://localhost:6379
```

### Holder Tiers

Edit `config/holder-tiers.ts` to customize requirements:

```typescript
export const HOLDER_TIERS = [
  { maxMC: 10_000, requiredPercent: 0.5, name: 'Genesis' },
  { maxMC: 25_000, requiredPercent: 0.3, name: 'Early' },
  // ... add more tiers
];
```

---

## Development

### Project Structure

```
black-gold/
├── app/                    # Next.js frontend
│   ├── components/         # React components
│   ├── hooks/              # Custom hooks
│   ├── workers/            # Mining Web Workers
│   └── api/                # API routes
├── server/                 # Mining pool backend
│   ├── pool/               # Pool management
│   ├── verification/       # Proof & anti-cheat
│   └── solana/             # Blockchain integration
├── config/                 # Configuration
├── scripts/                # Standalone scripts
└── docs/                   # Documentation
```

### Scripts

```bash
npm run dev        # Start Next.js dev server
npm run build      # Build for production
npm run server     # Start mining pool server
npm run buyback    # Start buyback service
npm run lint       # Run ESLint
```

---

## Security

See [SECURITY.md](docs/SECURITY.md) for full security analysis.

### Key Protections

- ✅ Server-side proof verification
- ✅ Rate limiting (10 submissions/min)
- ✅ Sybil detection (IP/wallet tracking)
- ✅ Nonce range validation
- ✅ Exponential backoff on failures

### Production Checklist

- [ ] Enable WSS (WebSocket Secure)
- [ ] Use Redis for distributed rate limiting
- [ ] Store keys in secure vault
- [ ] Enable DDoS protection
- [ ] Conduct security audit

---

## API Reference

### WebSocket Messages

#### Client → Server

```typescript
// Connect to pool
{ type: 'connect', payload: { walletAddress: string, cores: number } }

// Report hashrate
{ type: 'hashrate', payload: { walletAddress: string, hashrate: number } }

// Submit proof
{ type: 'submit', payload: { walletAddress: string, workUnitId: string, nonce: number, hash: string } }
```

#### Server → Client

```typescript
// Work assignment
{ type: 'work', payload: WorkUnit }

// Network stats
{ type: 'stats', payload: NetworkStats }

// Barrel found
{ type: 'barrel_found', payload: BarrelResult }

// Error
{ type: 'error', payload: { code: string, message: string } }
```

### REST Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/verify-holder?wallet=<address>` | GET | Check holder eligibility |
| `ws://host:8080/health` | GET | Server health check |
| `ws://host:8080/stats` | GET | Network statistics |

---

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing`)
5. Open Pull Request

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

## Links

- [Pump.fun](https://pump.fun) - Token launch platform
- [Solscan](https://solscan.io) - Solana explorer
- [Helius](https://helius.dev) - Solana RPC & APIs
- [Jupiter](https://jup.ag) - DEX aggregator

---

<p align="center">
  <strong>⛏️ DRILL FOR BLACK GOLD ⛏️</strong>
</p>
