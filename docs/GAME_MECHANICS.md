# ⛏️ Black Gold Game Mechanics

> **Version**: 2.6  
> **Last Updated**: January 2026  
> **Status**: Production Ready

## Table of Contents

1. [Overview](#overview)
2. [Getting Started](#getting-started)
3. [Mining Mechanics](#mining-mechanics)
4. [Reward System](#reward-system)
5. [Staking System](#staking-system)
6. [Raiding System](#raiding-system)
7. [Resource Types](#resource-types)
8. [Syndicates](#syndicates)
9. [Economic Model](#economic-model)
10. [Holder Tiers](#holder-tiers)

---

## Overview

Black Gold is a browser-based mining game where players mine COAL tokens across 20 global mines. The game combines:

- **Proof-of-Work mining** - Use your CPU to solve SHA-256 puzzles
- **Strategic staking** - Stake COAL to boost rewards and defend mines
- **PvP raiding** - Attack other mines to steal rewards
- **Resource specialization** - Each resource type has unique mechanics

### Core Loop

```
┌─────────────────────────────────────────────────────────────────┐
│                      PLAYER JOURNEY                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. CONNECT WALLET                                              │
│     └─→ Address-only (basic mining)                            │
│     └─→ Full Privy connect (staking + raids)                   │
│                                                                 │
│  2. CHOOSE HOME MINE                                            │
│     └─→ Select from 20 global mines                            │
│     └─→ 4 resource types with unique abilities                 │
│                                                                 │
│  3. START MINING                                                │
│     └─→ Web Worker computes SHA-256 hashes                     │
│     └─→ Find valid solutions below difficulty target           │
│     └─→ Submit proofs to earn rewards                          │
│                                                                 │
│  4. EARN & STAKE                                                │
│     └─→ 70% instant rewards to finder                          │
│     └─→ 30% to vault for hourly distribution                   │
│     └─→ Stake COAL for multipliers                             │
│                                                                 │
│  5. DEFEND OR RAID                                              │
│     └─→ Defend your mine from attackers                        │
│     └─→ Launch expeditions to steal from others                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Getting Started

### Wallet Connection Modes

| Mode | Requirements | Features |
|------|--------------|----------|
| **Address-Only** | Paste any Solana wallet | Mining only |
| **Full Connect** | Privy wallet connection | Mining + Staking + Raids |

### Holder Requirements

To mine, you must hold COAL tokens. Requirements scale with market cap:

| Market Cap | Required % | Example (1B supply) |
|------------|------------|---------------------|
| < $10K | 0.50% | 5,000,000 COAL |
| $10K-$25K | 0.30% | 3,000,000 COAL |
| $25K-$50K | 0.20% | 2,000,000 COAL |
| $50K-$100K | 0.10% | 1,000,000 COAL |
| $100K-$250K | 0.05% | 500,000 COAL |
| $250K-$500K | 0.025% | 250,000 COAL |
| $500K-$1M | 0.01% | 100,000 COAL |
| $1M+ | 0.005% | 50,000 COAL |

**Why this model?** Early supporters who take more risk get easier access. As the project grows and risk decreases, the barrier lowers for everyone.

---

## Mining Mechanics

### How Mining Works

1. **Server sends work**: Current block header + difficulty target
2. **Browser mines**: Web Worker tries nonces to find valid hash
3. **Submit proof**: When hash < target, submit to server
4. **Verify & reward**: Server validates proof, triggers reward distribution

```
┌─────────────┐    Work Assignment    ┌─────────────┐
│   Server    │ ─────────────────────→│   Client    │
│   (Pool)    │                       │  (Browser)  │
│             │                       │             │
│  • Block    │    Proof Submission   │  • SHA-256  │
│    Header   │←─────────────────────│    hashing  │
│  • Target   │                       │  • Nonce    │
│  • Verify   │    Reward Payout      │    search   │
│             │ ─────────────────────→│             │
└─────────────┘                       └─────────────┘
```

### Discovery Times (Base)

| Resource | Time | Discovery Name |
|----------|------|----------------|
| Coal | 5 minutes | Seam ⛏️ |
| Silver | 8 minutes | Lode 🥈 |
| Oil | 10 minutes | Gusher 🛢️ |
| Gold | 20 minutes | Nugget 🥇 |

**Note**: Times are targets. Actual times vary with network hashrate and difficulty.

### Difficulty Adjustment

Difficulty adjusts automatically to maintain target discovery times:
- More miners → Higher difficulty → Same discovery rate
- Fewer miners → Lower difficulty → Same discovery rate

---

## Reward System

### Revenue Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    REWARD FLOW DIAGRAM                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐                                              │
│  │  Pump.fun    │   Creator fees accumulate                    │
│  │  Trading     │───────────────────┐                          │
│  └──────────────┘                   ▼                          │
│                            ┌──────────────────┐                │
│                            │  Creator Wallet  │                │
│                            │     (SOL)        │                │
│                            └────────┬─────────┘                │
│                                     │                          │
│                        Jupiter Swap │ (SOL → COAL)             │
│                                     ▼                          │
│                            ┌──────────────────┐                │
│                            │   Reward Pool    │                │
│                            │    (COAL)        │                │
│                            └────────┬─────────┘                │
│                                     │                          │
│              ┌──────────────────────┼──────────────────────┐   │
│              │                      │                      │   │
│              ▼                      ▼                      ▼   │
│     ┌─────────────────┐   ┌─────────────────┐   ┌───────────┐ │
│     │  70% Finder     │   │  30% Mine Vault │   │  Defender │ │
│     │  (Instant)      │   │  (Hourly Dist.) │   │  Spoils   │ │
│     └─────────────────┘   └─────────────────┘   └───────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Discovery Rewards

When a miner finds a valid proof (discovery):

| Split | Recipient | When |
|-------|-----------|------|
| **70%** | Finder | Instant payout |
| **30%** | Mine Vault | Hourly distribution |

### Base Rewards by Resource

| Resource | Base Reward | Multiplier | Example |
|----------|-------------|------------|---------|
| Coal | 100 COAL | 1.0x | 100 COAL |
| Silver | 100 COAL | 1.2x | 120 COAL |
| Oil | 100 COAL | 1.3x | 130 COAL |
| Gold | 100 COAL | 1.5x | 150 COAL |

**Plus variance**: ±20% random factor per discovery.

### Hourly Vault Distribution

Every hour, each mine's vault is distributed to active miners based on:

```
Miner Score = (Hashrate Contribution / Total) × Stake Tier × (1 + Loyalty) × Time Factor

Your Share = (Your Score / Total Scores) × Vault Balance
```

#### Score Components

| Factor | Description | Range |
|--------|-------------|-------|
| Hashrate | Your hashrate × time active | - |
| Stake Tier | Multiplier from stake amount | 1.0x - 3.0x |
| Loyalty | +10% if 7+ days at coal mine | 0% or 10% |
| Time Factor | Active seconds / 3600 | 0 - 1 |

---

## Staking System

### Stake Tiers

| Tier | Min Stake | Hashrate Boost | Defense Boost |
|------|-----------|----------------|---------------|
| Base | 0 COAL | 1.0x | 1.0x |
| Bronze | 100 COAL | 1.5x | 1.2x |
| Silver | 500 COAL | 2.0x | 1.5x |
| Gold | 1,000 COAL | 2.5x | 1.8x |
| Diamond | 5,000 COAL | 3.0x | 2.0x |

### Staking Benefits

1. **Hashrate Multiplier** - Find discoveries faster
2. **Defense Power** - Protect against raids
3. **Vault Share** - Larger slice of hourly distribution
4. **Home Base Bonus** - +50% defense power at home mine

### Unstake Queue System

To prevent mid-raid exploits, unstaking is queued during active events:

```
┌─────────────────────────────────────────────────────────────────┐
│                   UNSTAKE QUEUE SYSTEM                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  User requests unstake                                          │
│         │                                                       │
│         ▼                                                       │
│  ┌──────────────────┐                                          │
│  │ Check conditions │                                          │
│  └────────┬─────────┘                                          │
│           │                                                     │
│     ┌─────┴─────┐                                              │
│     │           │                                               │
│     ▼           ▼                                               │
│  ┌──────┐   ┌────────────────┐                                 │
│  │ Free │   │ Event Active   │                                 │
│  └───┬──┘   └────────┬───────┘                                 │
│      │               │                                          │
│      ▼               ▼                                          │
│  ┌────────┐   ┌─────────────────┐                              │
│  │ INSTANT│   │ QUEUE for later │                              │
│  │ unstake│   │ (max 15 min)    │                              │
│  └────────┘   └─────────────────┘                              │
│                      │                                          │
│                      ▼                                          │
│              ┌──────────────┐                                  │
│              │ Event ends   │                                  │
│              │ → Auto-process│                                 │
│              └──────────────┘                                  │
│                                                                 │
│  Queue Triggers:                                                │
│  • User is attacking (raid in progress)                        │
│  • User's mine is under attack                                 │
│  • User has active expedition                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Why?** Prevents:
- Attackers withdrawing bets when raid looks bad
- Defenders fleeing when raid starts
- Gaming the system by timing unstakes

---

## Raiding System

### Expedition Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    RAID EXPEDITION FLOW                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. LAUNCH (From your home mine)                                │
│     └─→ Select target mine                                     │
│     └─→ Optional: Place bet (up to 20% of your stake)         │
│     └─→ Attack power = (Hashrate × 0.5) + (Stake × 0.1)       │
│                                                                 │
│  2. TRAVEL TIME                                                 │
│     └─→ Based on distance between mines                        │
│     └─→ While traveling: 50% defense power at home            │
│                                                                 │
│  3. RESOLUTION (When target finds discovery)                    │
│     ├─→ Compare: Attack Power vs Defense Power × 1.2           │
│     │                                                           │
│     ├─→ ATTACKERS WIN:                                         │
│     │   └─→ Steal 10-30% of discovery reward                   │
│     │   └─→ Get bet back + winnings                            │
│     │   └─→ Target gets 30min hashrate debuff                  │
│     │                                                           │
│     └─→ DEFENDERS WIN:                                         │
│         └─→ Attacker bets burned (90%)                         │
│         └─→ Defenders get spoils (10% of bets)                 │
│         └─→ 2hr raid immunity + 1hr hashrate boost             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Power Calculations

**Attack Power:**
```
Attack = (Effective Hashrate × 0.5) + (Stake Amount × 0.1)
```

**Defense Power:**
```
Base Defense = Stake Amount × Stake Tier Multiplier
Home Base = Base × 1.5 (if defending home mine)
Effective = Sum of all defenders' power
```

**Victory Condition:**
```
Attackers win if: Attack Power > Defense Power × 1.2
```

The **1.2x defense advantage** means attackers need 20% more power to win.

### Defender Spoils

When attackers lose, their bets are split:

| Destination | Percentage |
|-------------|------------|
| Defenders (stake-weighted) | 10% |
| Burned 🔥 | 90% |

**Deflationary mechanic**: Failed raids reduce token supply.

### Cooldowns

| Action | Cooldown |
|--------|----------|
| Home base switch | 24 hours |
| Start new expedition | 1 hour |
| Recovery after expedition | 30 minutes |
| Rally defense | 1 hour |

---

## Resource Types

### ⛏️ Coal Mines

**Ability**: *Steady Burn*

| Property | Value |
|----------|-------|
| Discovery Time | 5 minutes |
| Reward Style | Small, consistent |
| Special | +10% loyalty bonus after 7 days |
| Raid Immunity | None |

**Best For**: Consistent earners who value stability over volatility.

### 🥇 Gold Mines

**Ability**: *Gold Rush*

| Property | Value |
|----------|-------|
| Discovery Time | 20 minutes |
| Reward Style | Large, jackpot-style |
| Special | 5% chance of 5x jackpot |
| Raid Risk | High (attracts raiders) |

**Best For**: Risk-takers seeking big wins. Higher stake needed for defense.

### 🛢️ Oil Fields

**Ability**: *Syndicate*

| Property | Value |
|----------|-------|
| Discovery Time | 10 minutes |
| Reward Style | Scales with group |
| Special | Up to 3x multiplier at 50+ miners |
| Social | Benefits from coordination |

**Syndicate Multiplier:**
```
1 miner  → 1.0x
10 miners → 1.4x
25 miners → 2.0x
50+ miners → 3.0x
```

**Best For**: Social players who coordinate. Join popular oil mines!

### 🥈 Silver Mines

**Ability**: *Speculation*

| Property | Value |
|----------|-------|
| Discovery Time | 8 minutes |
| Reward Style | Volatile (0.5x - 2.0x) |
| Special | Extra stake rewards during surges |
| Variance | High |

**Best For**: Gamblers who enjoy variance. Can be highly profitable or disappointing.

---

## Syndicates

### Overview

Syndicates are player-formed groups for coordinated mining and raiding.

**Creation Cost**: 1,000 COAL (burned)

### Roles

| Role | Permissions |
|------|-------------|
| Leader | All permissions, treasury, settings |
| Officer | Invite members, coordinate raids |
| Member | Participate in events |

### Treasury

Syndicates can set a treasury split (0-30%) that takes a cut of member earnings to fund coordinated activities.

### Coordinated Raids

Syndicate members can launch **combined raids** with pooled attack power:
- More participants = More power
- Bets are pooled
- Rewards split by contribution

---

## Economic Model

### Token Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     TOKEN ECONOMICS                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  INFLOWS (Token creation/distribution)                         │
│  ├─→ Discovery rewards (miner payouts)                         │
│  ├─→ Vault hourly distributions                                │
│  └─→ Defender spoils (10% of failed raid bets)                │
│                                                                 │
│  SINKS (Token destruction/locking)                             │
│  ├─→ Failed raid bets burned (90%) 🔥                          │
│  ├─→ Syndicate creation (1,000 COAL) 🔥                        │
│  ├─→ Rally defense cost 🔥                                     │
│  └─→ Staking (locked, not burned)                              │
│                                                                 │
│  BALANCE                                                        │
│  └─→ More raids = More burning = Deflationary pressure         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Buyback Mechanism

Creator fees from Pump.fun trading are automatically converted:

1. **SOL accumulates** in creator wallet from trading fees
2. **Buyback triggers** when balance > 0.01 SOL
3. **Jupiter swap** converts SOL → COAL
4. **COAL sent** to reward pool for distribution

This creates continuous buying pressure proportional to trading activity.

### Earnings Estimates

**Factors affecting earnings:**
- Your hashrate vs network hashrate
- Stake tier multiplier
- Mine activity (more miners = faster discoveries)
- Resource type bonuses
- Loyalty bonus (coal mines)
- Raid success/failure

**Example Scenario:**

*Solo miner at coal mine, Bronze tier (1.5x), 10 kH/s:*
- ~1 discovery every 5 min (shared pool)
- If you find: 100 COAL × 70% = 70 COAL instant
- Hourly vault: ~10-30 COAL (based on share)
- **Estimated**: 50-150 COAL/hour

*Diamond staker at gold mine, high hashrate:*
- Longer discovery time but 1.5x base reward
- 3.0x hashrate multiplier
- 5% jackpot chance = potential 750 COAL
- **Estimated**: 100-500 COAL/hour (high variance)

---

## Holder Tiers

### Philosophy

The dynamic holder requirement system balances:

1. **Early Access Reward** - High-risk early supporters get easier entry
2. **Scaling Accessibility** - As project grows, barrier lowers
3. **Anti-Dump Protection** - Must hold tokens to earn tokens
4. **Whale Balance** - Large holders don't dominate (hashrate still matters)

### Tier Progression

```
Market Cap Growth →→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→

$10K         $100K        $500K        $1M+
  │            │            │            │
  ▼            ▼            ▼            ▼
┌─────┐     ┌─────┐     ┌─────┐     ┌─────┐
│0.50%│ →→→ │0.10%│ →→→ │0.025%│→→→ │0.005%│
└─────┘     └─────┘     └─────┘     └─────┘
Genesis    Expansion    Velocity      Mass
```

### Why Hold?

| Benefit | Description |
|---------|-------------|
| Mining Access | Required to mine at all |
| Staking Power | More tokens = higher tiers |
| Defense | Protect your earnings |
| Raid Power | Attack other mines |
| Governance | Future voting rights |

---

## Quick Reference Card

```
┌─────────────────────────────────────────────────────────────────┐
│                    QUICK REFERENCE                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  DISCOVERY SPLIT         STAKE TIERS                           │
│  70% → Finder            Base     0      1.0x                  │
│  30% → Vault             Bronze   100    1.5x                  │
│                          Silver   500    2.0x                  │
│  RAID RESULTS            Gold     1000   2.5x                  │
│  Win: Steal 10-30%       Diamond  5000   3.0x                  │
│  Lose: 90% burn, 10%                                           │
│        to defenders      COOLDOWNS                             │
│                          Home switch: 24h                      │
│  DEFENSE ADVANTAGE       Expedition: 1h                        │
│  Attackers need 1.2x     Recovery: 30m                         │
│  power to win            Rally: 1h                             │
│                                                                 │
│  RESOURCE ABILITIES                                            │
│  Coal:   +10% loyalty (7d)                                     │
│  Gold:   5% × 5x jackpot                                       │
│  Oil:    Up to 3x group bonus                                  │
│  Silver: 0.5-2.0x variance                                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Appendix: Attack Vectors & Mitigations

| Attack | Mitigation |
|--------|------------|
| Sybil mining | Holder requirement + hashrate proportional rewards |
| Raid griefing | Cooldowns + defense advantage + unstake queue |
| Whale domination | Hashrate matters more than stake |
| Bot mining | Rate limiting + proof verification + anti-cheat |
| Flash unstake | Unstake queue during active events |
| Collusion | Transparency + on-chain verification |

---

*Document maintained by the Black Gold team. For questions, see CODEBASE_INDEX.md or open an issue.*
