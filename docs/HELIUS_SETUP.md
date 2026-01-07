# Helius API Setup for Black Gold

Helius provides enhanced Solana RPC endpoints and APIs for token holder verification.

## Why Helius?

- **Faster**: Dedicated RPC endpoints with lower latency
- **DAS API**: Efficient token balance lookups
- **Free Tier**: 100,000 credits/month (sufficient for testing)
- **Reliability**: 99.9% uptime SLA on paid plans

## Step 1: Create Account

1. Go to [helius.dev](https://helius.dev)
2. Click "Sign Up" (free, no credit card required)
3. Create a new project

## Step 2: Get API Key

1. In your Helius dashboard, find your API key
2. It looks like: `abc123-def456-ghi789`

## Step 3: Configure Black Gold

Add to your environment variables:

```bash
# .env.local (local development)
HELIUS_API_KEY=your_helius_api_key_here

# For devnet testing
SOLANA_NETWORK=devnet
```

For production (Railway/Vercel), add `HELIUS_API_KEY` in the dashboard.

## How Black Gold Uses Helius

### 1. Holder Verification
```
GET https://api.helius.xyz/v0/addresses/{wallet}/balances
```
- Checks if wallet holds enough COAL tokens
- Results cached for 5 minutes

### 2. RPC Endpoint
```
https://mainnet.helius-rpc.com/?api-key={API_KEY}
https://devnet.helius-rpc.com/?api-key={API_KEY}
```
- Used for transaction submission
- Staking operations
- Reward distribution

## Credit Usage

| Operation | Credits |
|-----------|---------|
| Balance lookup | 1 |
| RPC call | 1 |
| Enhanced RPC | 2-5 |

With 100,000 free credits/month, you can:
- ~50,000 balance checks/month
- Support ~1,600 verifications/day

## Fallback Behavior

If Helius is not configured:
- Uses public Solana RPC (slower, rate-limited)
- Token mint `TBD` allows all wallets (testing mode)

## Upgrading

When you need more capacity:

| Plan | Credits/Month | Price |
|------|---------------|-------|
| Free | 100,000 | $0 |
| Builder | 1,000,000 | $49/mo |
| Scale | 10,000,000 | Custom |

## Troubleshooting

### "Helius API error: 429"
You've hit rate limits. Solutions:
- Increase cache duration
- Upgrade to paid plan
- Add request throttling

### "Helius API error: 401"
Invalid API key. Check:
- Key is correctly copied
- No extra spaces
- Using correct environment variable name

### Balance shows 0 for known holder
- Token mint address might be wrong
- Wallet might be on different network (mainnet vs devnet)
- Cache might be stale (wait 5 minutes)

## Testing Without Helius

For development without a Helius key:
1. Token mint set to `TBD` returns mock data
2. All wallets are considered eligible
3. Balance shows test amounts

To test with real verification, you need:
- A Helius API key
- A deployed SPL token (or use devnet)
- Token mint address configured
