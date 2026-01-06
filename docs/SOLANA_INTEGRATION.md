# Black Gold Solana Integration

This document describes the Solana integration for the Black Gold mining platform, including holder verification, reward distribution, and the automatic buyback service.

## Overview

The Solana integration consists of three main modules:

| Module | File | Purpose |
|--------|------|---------|
| Holder Verification | `server/solana/holder.ts` | Verifies wallet token holdings using Helius API |
| Reward Distribution | `server/solana/rewards.ts` | Sends SPL token rewards to miners |
| Buyback Service | `server/solana/buyback.ts` | Swaps SOL → COAL via Jupiter API |

## Environment Variables

```bash
# Required
HELIUS_API_KEY=your_helius_api_key        # Helius API key for RPC and holder verification
TOKEN_MINT_ADDRESS=your_token_mint        # COAL token mint address
REWARD_WALLET_ADDRESS=reward_wallet       # Wallet holding tokens for distribution
CREATOR_WALLET_ADDRESS=creator_wallet     # Wallet receiving creator fees

# Private Keys (JSON array or base58)
REWARD_WALLET_PRIVATE_KEY=[1,2,3,...]     # Private key for reward wallet
CREATOR_WALLET_PRIVATE_KEY=[1,2,3,...]    # Private key for creator wallet (buyback)

# Optional
SOLANA_RPC_URL=https://...                # Custom RPC endpoint (defaults to Helius)
```

## Module Documentation

### 1. Holder Verification (`server/solana/holder.ts`)

Verifies that wallets hold enough tokens to participate in mining. Requirements are dynamic based on market cap tiers defined in `config/holder-tiers.ts`.

#### Key Functions

```typescript
import { verifyHolder, verifyHoldersBatch, getCurrentTierInfo } from './server/solana';

// Verify a single wallet
const result = await verifyHolder('7xKX...abc');
console.log(result);
// {
//   walletAddress: '7xKX...abc',
//   balance: 5000000,
//   percentOfSupply: 0.5,
//   requiredPercent: 0.3,
//   isEligible: true,
//   cachedAt: Date,
//   marketCap: 15000
// }

// Verify multiple wallets (batched with rate limiting)
const results = await verifyHoldersBatch(['wallet1', 'wallet2', 'wallet3']);

// Get current tier requirements
const tier = await getCurrentTierInfo();
// { tierName: 'Early', requiredPercent: 0.3, requiredTokens: 3000000, marketCap: 15000 }
```

#### Caching

Verification results are cached for **5 minutes** to reduce API calls:

```typescript
// Cache is used by default
const result = await verifyHolder('wallet');

// Force refresh (bypass cache)
const fresh = await verifyHolder('wallet', true);

// Check cache without API call
const eligibility = getCachedEligibility('wallet'); // true, false, or null

// Clear cache
clearCache('wallet');  // Single wallet
clearCache();          // All wallets
```

### 2. Reward Distribution (`server/solana/rewards.ts`)

Sends COAL tokens to miners who discover barrels.

#### Key Functions

```typescript
import { sendReward, queueReward, getRewardPoolBalance } from './server/solana';

// Send reward immediately
const result = await sendReward(
  '7xKX...abc',  // Recipient wallet
  1000,          // Amount in tokens (not raw)
  42             // Barrel number (for logging)
);

if (result.success) {
  console.log(`TX: ${result.signature}`);
}

// Queue reward for batch processing
queueReward('wallet', 1000, 42);
queueReward('wallet2', 500, 43);

// Process all queued rewards
const results = await processPendingRewards();

// Check reward pool balance
const balance = await getRewardPoolBalance();
console.log(`Pool has ${balance} COAL remaining`);
```

#### Automatic Token Account Creation

If a recipient doesn't have a token account for COAL, one is automatically created in the same transaction.

#### Retry Logic

Failed rewards are automatically re-queued with retry tracking:

```typescript
// Process with max 5 retries (default is 3)
await processPendingRewards(5);

// Check pending rewards
console.log(`${getPendingRewardCount()} rewards pending`);
console.log(getPendingRewards()); // Detailed info
```

### 3. Buyback Service (`server/solana/buyback.ts`)

Monitors the creator wallet for SOL (from Pump.fun fees) and automatically swaps to COAL tokens via Jupiter API. Swapped tokens are sent to the reward pool.

#### Key Functions

```typescript
import { 
  executeBuyback, 
  shouldExecuteBuyback, 
  getSwapQuote,
  getBuybackStats 
} from './server/solana';

// Check if buyback should run
const { shouldBuyback, balance, minRequired } = await shouldExecuteBuyback();

// Execute buyback (swaps all available SOL)
const result = await executeBuyback();
if (result.success) {
  console.log(`Swapped ${result.solSpent} SOL for ${result.tokensReceived} COAL`);
}

// Execute with specific amount
const result = await executeBuyback(0.5); // Swap 0.5 SOL

// Get swap quote (for display)
const quote = await getSwapQuote(0.1);
console.log(`0.1 SOL = ${quote.outAmount} COAL`);

// Get service stats
const stats = await getBuybackStats();
```

#### Running the Buyback Service

```bash
# Development (with watch mode)
npm run buyback

# Production
npm run buyback:prod
```

The service will:
1. Check creator wallet balance every 3 minutes
2. If balance ≥ 0.01 SOL, execute a swap
3. Send swapped tokens to the reward pool
4. Log all activity and errors

## Configuration

### Holder Tiers (`config/holder-tiers.ts`)

Defines how much token holders need to mine based on market cap:

| Market Cap | Required % | Tier Name |
|------------|------------|-----------|
| < $10K | 0.5% | Genesis |
| $10K-$25K | 0.3% | Early |
| $25K-$50K | 0.2% | Growth |
| $50K-$100K | 0.1% | Expansion |
| $100K-$250K | 0.05% | Momentum |
| $250K-$500K | 0.025% | Velocity |
| $500K-$1M | 0.01% | Scale |
| > $1M | 0.005% | Mass |

### Buyback Configuration (`config/constants.ts`)

```typescript
export const BUYBACK_CONFIG = {
  CHECK_INTERVAL_MS: 3 * 60 * 1000,  // Check every 3 minutes
  MIN_SOL_FOR_BUYBACK: 0.01,         // Minimum SOL to trigger
  SLIPPAGE_BPS: 100,                  // 1% slippage tolerance
  JUPITER_API: 'https://quote-api.jup.ag/v6',
};
```

## Architecture

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────────┐
│  Miner Client   │────▶│  Pool Server │────▶│ Holder Verify   │
│  (WebSocket)    │     │  (manager.ts)│     │ (Helius API)    │
└─────────────────┘     └──────────────┘     └─────────────────┘
                               │
                               │ On Barrel Found
                               ▼
                        ┌──────────────┐
                        │ Reward Send  │
                        │ (SPL Token)  │
                        └──────────────┘

┌─────────────────┐     ┌──────────────┐     ┌─────────────────┐
│ Creator Wallet  │────▶│   Buyback    │────▶│  Reward Pool    │
│ (Pump.fun fees) │     │  (Jupiter)   │     │  (Token Wallet) │
└─────────────────┘     └──────────────┘     └─────────────────┘
```

## Error Handling

All modules use try/catch with detailed error logging:

```typescript
try {
  const result = await sendReward(wallet, amount, barrel);
  if (!result.success) {
    // Handle failure gracefully
    console.error(`Reward failed: ${result.error}`);
    queueReward(wallet, amount, barrel); // Re-queue
  }
} catch (error) {
  // Unexpected error
  console.error('Unexpected error:', error);
}
```

## Security Considerations

1. **Private Keys**: Store in environment variables, never commit to git
2. **Rate Limiting**: Batch operations respect API rate limits
3. **Validation**: All wallet addresses are validated before use
4. **Slippage Protection**: Jupiter swaps use configurable slippage tolerance

## Testing

```bash
# Test holder verification
npx tsx -e "
  import { verifyHolder } from './server/solana';
  verifyHolder('YOUR_WALLET').then(console.log);
"

# Test reward (dry run - check balance first)
npx tsx -e "
  import { getRewardPoolBalance } from './server/solana';
  getRewardPoolBalance().then(console.log);
"

# Test swap quote
npx tsx -e "
  import { getSwapQuote } from './server/solana';
  getSwapQuote(0.1).then(console.log);
"
```

## Troubleshooting

### "HELIUS_API_KEY environment variable is required"
Set your Helius API key in the environment or `.env` file.

### "Invalid wallet address"
Ensure the wallet address is a valid Solana base58 public key.

### "Insufficient reward pool balance"
The reward wallet doesn't have enough tokens. Top up the pool.

### "Jupiter quote failed"
The token may not have liquidity. Check the token is launched and has a pool.

### Buyback not executing
1. Check creator wallet has ≥ 0.01 SOL
2. Verify `CREATOR_WALLET_PRIVATE_KEY` is set correctly
3. Check logs for specific errors
