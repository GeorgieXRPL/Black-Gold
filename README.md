# Black Gold v2.1 ⛏️🌍

> Interactive Mining Globe - CPU Mining Platform for COAL Token on Solana

Black Gold v2.1 transforms crypto mining into a **territorial strategy game**. Choose from 20 real-world mines, stake tokens to boost your power, form syndicates with allies, and raid other mines to steal their rewards.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Solana](https://img.shields.io/badge/Solana-black?logo=solana)
![Next.js](https://img.shields.io/badge/Next.js-black?logo=next.js)
![Three.js](https://img.shields.io/badge/Three.js-black?logo=three.js)

---

## 🆕 What's New in v2.1

- **🌍 3D Interactive Globe** - Beautiful Three.js globe with 20 mine locations
- **⚔️ PvP Raiding** - Launch expeditions to steal from other mines
- **💰 Staking System** - Stake tokens for up to 3x hashrate boost
- **🏠 Home Base** - Choose your primary mine and earn loyalty bonuses
- **🎰 Unique Mechanics** - Each resource type has special abilities
- **🏛️ Syndicates** - Form alliances with up to 20 members for coordinated raids
- **💎 Dual Rewards** - 70% instant to finder, 30% pooled for hourly distribution
- **🔥 Defender Spoils** - Failed raiders lose their bets (10% to defenders, 90% burned)

---

## Features

### Core Mining
- **🔒 Holder-Gated Mining** - Must hold COAL tokens to participate
- **⚡ CPU Mining** - Mine using your browser, no special hardware
- **🎯 Dynamic Difficulty** - Adjusts to maintain consistent barrel times
- **💰 Instant Rewards** - COAL sent directly to your wallet

### Game Mechanics
- **🗺️ 20 Real Mines** - Coal, Gold, Oil, and Silver across 15 countries
- **📊 Stake Tiers** - Base → Bronze → Silver → Gold → Diamond
- **⚔️ Raid System** - Attack other mines with optional betting
- **🛡️ Defense Buffs** - Immunity and boosts for successful defenders

---

## Mine Locations

### Coal Mines (5 min Coal Seams, steady rewards)
- Appalachian Basin, USA
- Shanxi Province, China
- Hunter Valley, Australia
- Silesia, Poland
- Kuzbass, Russia

### Gold Mines (20 min Gold Nuggets, jackpot chance)
- Witwatersrand, South Africa
- Carlin Trend, Nevada, USA
- Super Pit, Australia
- Grasberg, Indonesia
- Muruntau, Uzbekistan

### Oil Fields (10 min Oil Gushers, group bonuses)
- Ghawar Field, Saudi Arabia
- Permian Basin, Texas, USA
- **Orinoco Belt, Venezuela**
- Campos Basin, Brazil
- Rumaila, Iraq

### Silver Mines (8 min Silver Lodes, volatile rewards)
- Potosí, Bolivia
- Guanajuato, Mexico
- Coeur d'Alene, Idaho, USA
- Cannington, Australia
- Dukat, Russia

---

## Quick Start

### Prerequisites

- Node.js 18+
- Redis (optional, for rate limiting)
- Solana wallet with COAL tokens

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
# Terminal 1: Start game server
npm run server

# Terminal 2: Start frontend
npm run dev

# Terminal 3 (optional): Start buyback service
npm run buyback
```

Visit `http://localhost:3000` to start mining!

---

## Game Mechanics

### Staking System

Stake COAL tokens at a mine to boost your mining power:

| Tier | Min Stake | Hashrate | Defense |
|------|-----------|----------|---------|
| Base | 0 | 1.0x | 1.0x |
| Bronze | 100 | 1.5x | 1.2x |
| Silver | 500 | 2.0x | 1.5x |
| Gold | 1,000 | 2.5x | 1.8x |
| Diamond | 5,000 | 3.0x | 2.0x |

### Resource Abilities

| Resource | Discovery | Ability | Description |
|----------|-----------|---------|-------------|
| **Coal** | Coal Seam | Steady Burn | +10% loyalty bonus after 7 days at same mine |
| **Gold** | Gold Nugget | Gold Rush | 5% chance of 5x jackpot on each discovery |
| **Oil** | Oil Gusher | Syndicate | Rewards scale up to 3x with 50+ miners |
| **Silver** | Silver Lode | Speculation | Random 0.5x - 2x multiplier each discovery |

### Raiding

1. **Launch Expedition** - Target another mine (1hr cooldown)
2. **Optional Bet** - Risk up to 20% of your stake for bonus rewards
3. **Resolution** - When target finds a discovery, raid resolves
4. **Win** - Steal 10-30% of rewards, target gets 30min debuff
5. **Lose** - Target gets 2hr immunity, bet penalty applied:
   - **10%** of your bet → Distributed to defenders
   - **90%** of your bet → Permanently burned

### Reward Distribution

| Type | Amount | When | Recipient |
|------|--------|------|-----------|
| **Instant** | 70% | On discovery | Finder |
| **Pooled** | 30% | Hourly | All active miners (weighted) |

Hourly pool distribution is weighted by:
- Hashrate contribution (40%)
- Stake amount & tier (30%)
- Loyalty duration (30%)

### Syndicates (Alliances)

Form syndicates with up to 20 players for coordinated operations:

- **Create** - Start your own syndicate and invite allies
- **Coordinate** - Pool attack power for massive raids
- **Share Rewards** - Proportional split based on contribution
- **Bonus Power** - Up to 1.25x multiplier for full syndicate raids

### Anti-Griefing

- Defenders have 1.2x power advantage
- 2-hour immunity after successful defense
- Failed bets are burned (deflationary!)
- 10% of failed bets go to defenders (reward for standing ground)
- Home base defenders get 1.5x stake power
- Expedition cooldowns prevent spam

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Frontend (Next.js + Three.js)                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │  3D Globe   │  │  Game UI    │  │ Web Workers │              │
│  │  (r3f/drei) │  │ + Syndicate │  │   Mining    │              │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘              │
└─────────┼────────────────┼────────────────┼─────────────────────┘
          │                │                │
          └────────────────┴────────────────┘
                           │ WebSocket
┌──────────────────────────┼──────────────────────────────────────┐
│                    Game Server (Node.js)                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │    Mine     │  │   Stake     │  │    Raid     │              │
│  │  Registry   │  │  Manager    │  │   Engine    │              │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘              │
│         │                │                │                      │
│  ┌──────┴────────────────┴────────────────┴──────┐              │
│  │              Pool Managers (per mine)          │              │
│  └────────────────────────┬───────────────────────┘              │
│                           │                                      │
│  ┌────────────────────────┴───────────────────────┐              │
│  │              NEW IN v2.1                        │              │
│  │  ┌─────────────┐  ┌─────────────┐              │              │
│  │  │    Vault    │  │  Syndicate  │              │              │
│  │  │   Manager   │  │   Manager   │              │              │
│  │  └──────┬──────┘  └──────┬──────┘              │              │
│  │         │                │                      │              │
│  │  ┌──────┴──────┐  ┌──────┴──────┐              │              │
│  │  │ Distribution│  │  Syndicate  │              │              │
│  │  │   Service   │  │    Raids    │              │              │
│  │  └─────────────┘  └─────────────┘              │              │
│  └────────────────────────────────────────────────┘              │
└──────────────────────────────────────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
    ┌──────────┐    ┌──────────┐    ┌──────────┐
    │  Helius  │    │  Solana  │    │ Jupiter  │
    │   API    │    │   RPC    │    │   API    │
    └──────────┘    └──────────┘    └──────────┘
```

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

# Frontend
NEXT_PUBLIC_WS_URL=ws://localhost:8080
```

---

## Development

### Project Structure

```
black-gold/
├── app/                    # Next.js frontend
│   ├── components/
│   │   ├── game/           # Game UI panels
│   │   └── globe/          # 3D globe components
│   ├── hooks/              # React hooks
│   ├── lib/                # Utilities
│   ├── workers/            # Mining Web Workers
│   └── api/                # API routes
├── server/
│   ├── game/               # Game system (v2)
│   ├── pool/               # Pool management
│   ├── verification/       # Proof & anti-cheat
│   └── solana/             # Blockchain integration
├── config/                 # Configuration
│   └── mines.ts            # Mine definitions
├── scripts/                # Standalone scripts
└── docs/                   # Documentation
```

### Scripts

```bash
npm run dev        # Start Next.js dev server
npm run build      # Build for production
npm run server     # Start game server (dev mode)
npm run server:prod # Start game server (production)
npm run buyback    # Start buyback service
npm run lint       # Run ESLint
```

---

## API Reference

### WebSocket Messages (v2.1)

#### Client → Server

```typescript
// Connect to game
{ type: 'connect', payload: { walletAddress: string, cores: number } }

// Join a mine
{ type: 'join_mine', payload: { mineId: string } }

// Stake tokens
{ type: 'stake', payload: { mineId: string, amount: number } }

// Start raid
{ type: 'start_expedition', payload: { targetMineId: string, betAmount?: number } }

// Submit proof
{ type: 'submit', payload: { workUnitId: string, nonce: number, hash: string } }

// Syndicate operations (NEW in v2.1)
{ type: 'create_syndicate', payload: { name: string } }
{ type: 'join_syndicate', payload: { syndicateId: string } }
{ type: 'leave_syndicate', payload: {} }
{ type: 'invite_to_syndicate', payload: { walletAddress: string } }
{ type: 'start_syndicate_raid', payload: { targetMineId: string } }
```

#### Server → Client

```typescript
// Work assignment
{ type: 'work', payload: WorkUnit }

// Global stats
{ type: 'stats', payload: GlobalNetworkStats }

// Game events
{ type: 'game_event', payload: { type: 'discovery_found' | 'raid_started' | 'jackpot', ... } }

// Raid result
{ type: 'raid_result', payload: RaidResult }

// Pool distribution (NEW in v2.1)
{ type: 'pool_distribution', payload: { mineId: string, totalDistributed: number, recipients: [...] } }

// Syndicate events (NEW in v2.1)
{ type: 'syndicate_update', payload: Syndicate }
{ type: 'syndicate_raid_result', payload: SyndicateRaidResult }
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
- ✅ 1.2x defense advantage in raids
- ✅ Bet burning on failed raids (90% burned, 10% to defenders)
- ✅ Syndicate size limits (max 20 members)
- ✅ Hourly pool distribution prevents instant drain

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
  <strong>🌍 CONQUER THE GLOBE. DRILL FOR BLACK GOLD. ⛏️</strong>
</p>
