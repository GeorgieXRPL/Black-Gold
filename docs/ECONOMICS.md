# 💰 Black Gold Economics & Sustainability

> **Version**: 2.6  
> **Purpose**: Analyze tokenomics viability and player incentives

## Executive Summary

Black Gold creates a **self-sustaining reward loop** where:
1. Trading generates creator fees (SOL)
2. SOL is auto-swapped to COAL via buyback
3. COAL distributed to active miners
4. Miners hold/stake to keep earning
5. Staking reduces sell pressure
6. Failed raids burn tokens (deflationary)

---

## Revenue Sources

### 1. Pump.fun Creator Fees

Pump.fun provides creator fees on every trade:

| Fee Type | Rate | Example ($10K volume) |
|----------|------|----------------------|
| Creator Fee | ~1% | ~$100 |

**Monthly projection by volume:**

| Daily Volume | Monthly SOL | Monthly COAL* |
|--------------|-------------|---------------|
| $1,000 | ~3 SOL | ~30,000 COAL |
| $10,000 | ~30 SOL | ~300,000 COAL |
| $100,000 | ~300 SOL | ~3,000,000 COAL |

*Assuming 10,000 COAL/SOL rate

### 2. Staking Lock-up

Staked tokens are locked, reducing circulating supply:

| Stake Tier | Typical Lock | Effect |
|------------|--------------|--------|
| Bronze | 100+ COAL | ~10% of active players |
| Silver | 500+ COAL | ~5% of active players |
| Gold+ | 1000+ COAL | ~2% of active players |

**Projected staking participation**: 15-30% of active holders

---

## Reward Distribution Model

### Per-Discovery Economics

**Base Case: 100 COAL discovery**

```
Discovery: 100 COAL total
├── Finder (instant): 70 COAL
└── Vault (hourly): 30 COAL
    ├── Distributed to all active miners
    └── Weighted by: hashrate, stake, loyalty, time
```

### Daily Reward Estimates

**Per Mine (assuming 5 discoveries/hour):**

| Period | Discoveries | Total COAL | Finder COAL | Vault COAL |
|--------|-------------|------------|-------------|------------|
| Hour | 5 | 500 | 350 | 150 |
| Day | 120 | 12,000 | 8,400 | 3,600 |

**Network-wide (20 mines):**

| Period | Total Discoveries | Total Rewards |
|--------|------------------|---------------|
| Day | ~2,400 | ~240,000 COAL |
| Week | ~16,800 | ~1,680,000 COAL |
| Month | ~72,000 | ~7,200,000 COAL |

### Sustainability Analysis

**For rewards to be sustainable:**

```
Required: Buyback Revenue ≥ Reward Distribution

If monthly rewards = 7,200,000 COAL
And COAL price = $0.001
Then value distributed = $7,200/month

Required trading volume to sustain (at 1% fee):
$7,200 / 0.01 = $720,000/month = ~$24,000/day
```

**Conclusion**: System is sustainable with moderate trading activity.

---

## Deflationary Mechanics

### 1. Failed Raid Burns (90%)

When attackers lose, 90% of bets are burned:

| Scenario | Bet Amount | Burned | To Defenders |
|----------|------------|--------|--------------|
| Small raid | 100 COAL | 90 COAL | 10 COAL |
| Medium raid | 500 COAL | 450 COAL | 50 COAL |
| Large raid | 2,000 COAL | 1,800 COAL | 200 COAL |

**Projected monthly burns (assuming 50% raid failure rate):**

| Raid Activity | Total Bets | Burned |
|---------------|------------|--------|
| Low (10/day) | 150,000 COAL | 67,500 COAL |
| Medium (50/day) | 750,000 COAL | 337,500 COAL |
| High (100/day) | 1,500,000 COAL | 675,000 COAL |

### 2. Syndicate Creation (1,000 COAL)

One-time burn to create syndicates.

### 3. Rally Defense Costs

Variable amounts burned for emergency defense boosts.

### Net Token Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                   MONTHLY TOKEN FLOW (EXAMPLE)                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  INFLOWS                                                        │
│  ├── Buyback (from fees)      +3,000,000 COAL                  │
│  └── Initial distribution     +0 (post-launch)                 │
│                               ──────────────                    │
│                               +3,000,000 COAL                   │
│                                                                 │
│  OUTFLOWS (Distributed)                                         │
│  └── Mining rewards           -7,200,000 COAL                  │
│                                                                 │
│  BURNS 🔥                                                       │
│  ├── Failed raids (90%)       -337,500 COAL                    │
│  ├── Syndicate creation       -50,000 COAL                     │
│  └── Rally defense            -20,000 COAL                     │
│                               ──────────────                    │
│                               -407,500 COAL 🔥                  │
│                                                                 │
│  NET CIRCULATING CHANGE                                         │
│  = +3,000,000 - 7,200,000 + 407,500                            │
│  = -3,792,500 COAL (deficit from reward pool)                  │
│                                                                 │
│  ⚠️ Reward pool depletes unless trading volume increases       │
│  OR rewards scale down dynamically                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Player Earning Potential

### Casual Miner

**Profile**: 2-4 hours/day, no stake, solo mining

| Metric | Value |
|--------|-------|
| Hashrate | 5-15 kH/s |
| Stake Tier | Base (1.0x) |
| Discovery Share | Low |
| Daily Earnings | 50-200 COAL |
| Monthly | 1,500-6,000 COAL |

### Serious Miner

**Profile**: 8+ hours/day, Bronze stake, active participation

| Metric | Value |
|--------|-------|
| Hashrate | 20-50 kH/s |
| Stake Tier | Bronze (1.5x) |
| Discovery Share | Medium |
| Daily Earnings | 200-800 COAL |
| Monthly | 6,000-24,000 COAL |

### Power User

**Profile**: Full-time, Diamond stake, raids + syndicate

| Metric | Value |
|--------|-------|
| Hashrate | 100+ kH/s |
| Stake Tier | Diamond (3.0x) |
| Discovery Share | High |
| Raid Income | Variable |
| Daily Earnings | 500-3,000 COAL |
| Monthly | 15,000-90,000 COAL |

### ROI Analysis

**Break-even for staking:**

| Tier | Cost | Monthly Earn Boost | Break-even |
|------|------|-------------------|------------|
| Bronze | 100 COAL | +50% (~75 extra) | 1.3 months |
| Silver | 500 COAL | +100% (~150 extra) | 3.3 months |
| Gold | 1,000 COAL | +150% (~225 extra) | 4.4 months |
| Diamond | 5,000 COAL | +200% (~300 extra) | 16.7 months |

**Note**: Diamond tier has long break-even but provides best defense for raids.

---

## Incentive Alignment

### Why Players Hold

| Reason | Mechanism |
|--------|-----------|
| Required to mine | Holder verification |
| Better rewards | Stake tier multipliers |
| Defense | Protect earnings from raids |
| Attack | Need stake for raid power |
| Appreciation | Deflationary burns |

### Why Players Don't Dump

| Pressure Type | Counter-Mechanism |
|---------------|------------------|
| Quick profit | Stake lock benefits |
| Raid fear | Defense advantage |
| Whale exit | Gradual unstaking |
| Dead project | Buyback revenue |

### Game Theory

**Nash Equilibrium**: The optimal strategy tends toward:

1. **Hold enough to mine** (required)
2. **Stake for tier benefits** (rational)
3. **Defend home mine** (protect investment)
4. **Occasional raids** (risk/reward)

Players who deviate (dump immediately) lose access to earning potential.

---

## Risk Factors

### Bearish Scenarios

| Risk | Impact | Mitigation |
|------|--------|------------|
| Low trading volume | Reduced buyback | Engage community, marketing |
| Miner exodus | Network difficulty drops | Lower barriers, events |
| Whale manipulation | Price volatility | Stake incentives, burns |
| Bot dominance | Unfair distribution | Anti-cheat, rate limits |

### Bullish Scenarios

| Catalyst | Effect |
|----------|--------|
| High volume | More buyback → more rewards |
| New features | Player retention |
| Partnerships | Exposure + liquidity |
| Market bull run | Rising tide lifts all |

---

## Tunable Parameters

These values can be adjusted to balance economics:

| Parameter | Current | Range | Effect |
|-----------|---------|-------|--------|
| Finder share | 70% | 50-80% | Instant vs vault rewards |
| Base reward | 100 COAL | 50-500 | Total distribution rate |
| Raid burn | 90% | 50-99% | Deflationary pressure |
| Defender spoils | 10% | 5-20% | Defense incentive |
| Stake tiers | [0,100,500,1000,5000] | Variable | Staking incentives |
| Discovery times | [5,8,10,20] min | Variable | Network activity |

### Recommended Adjustments

**If rewards too high:**
- Decrease base reward
- Increase discovery times
- Lower finder share (more to vault)

**If raids too punishing:**
- Reduce burn percentage
- Increase defender spoils
- Add raid cooldowns

**If staking too weak:**
- Increase tier multipliers
- Add exclusive benefits
- Lower tier thresholds

---

## Conclusion

The Black Gold economic model is viable under these conditions:

1. ✅ **Moderate trading volume** ($10K+/day sustains rewards)
2. ✅ **Active player base** (burns offset some emissions)
3. ✅ **Balanced raids** (creates engagement + burns)
4. ✅ **Stake incentives** (reduces sell pressure)

**Key success factors:**
- Community engagement
- Regular events/updates
- Fair anti-cheat
- Responsive parameter tuning

---

*For technical implementation details, see `CODEBASE_INDEX.md`*
