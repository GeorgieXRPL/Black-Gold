# Quarry Staking Deployment Guide

This guide walks through deploying the Quarry staking infrastructure on Solana devnet.

## Prerequisites

1. **Node.js 18+** installed
2. **Solana CLI** (optional, for verification)
3. A **wallet with devnet SOL** (at least 2 SOL recommended)
4. Get devnet SOL from: https://faucet.solana.com/

## Step 1: Prepare Your Wallet

You need a deployer wallet with devnet SOL. Export the private key as base58:

```bash
# If using Solana CLI:
solana-keygen recover -o deployer.json  # or use existing key
cat deployer.json | node -e "const bs58=require('bs58');const fs=require('fs');console.log(bs58.encode(Buffer.from(JSON.parse(fs.readFileSync('/dev/stdin','utf8')))))"

# Or create a new test wallet
solana-keygen new -o deployer.json --no-bip39-passphrase
```

## Step 2: Run Deployment Script

```bash
cd black-gold

# Install dependencies (if not already done)
npm install

# Run the deployment script with your private key
DEPLOYER_PRIVATE_KEY="your-base58-private-key" npx tsx scripts/deploy-quarry.ts
```

## Step 3: Save Output Addresses

The script will output environment variables. Save these!

```
┌──────────────────────────────────────────────────────────────────────┐
│ QUARRY_MINT_WRAPPER=<address>                                        │
│ QUARRY_REWARDER_ADDRESS=<address>                                    │
│ QUARRY_ADDRESS=<address>                                             │
│ IOU_TOKEN_MINT=<address>                                             │
└──────────────────────────────────────────────────────────────────────┘
```

## Step 4: Configure Environment

### Railway (Backend Server)

Add these environment variables in Railway dashboard:

```
QUARRY_MINT_WRAPPER=<from step 3>
QUARRY_REWARDER_ADDRESS=<from step 3>
QUARRY_ADDRESS=<from step 3>
IOU_TOKEN_MINT=<from step 3>
REDEEMER_WALLET_ADDRESS=<your redeemer wallet>
```

### Vercel (Frontend)

Add these environment variables in Vercel dashboard:

```
NEXT_PUBLIC_QUARRY_ENABLED=true
NEXT_PUBLIC_QUARRY_REWARDER=<from step 3>
NEXT_PUBLIC_QUARRY_ADDRESS=<from step 3>
NEXT_PUBLIC_IOU_TOKEN_MINT=<from step 3>
```

## Step 5: Set Up Redeemer Wallet

The Redeemer wallet exchanges IOU-COAL for real COAL. You need to:

1. Create a new wallet for the redeemer
2. Fund it with COAL tokens (from buyback service or manually)
3. Set `REDEEMER_WALLET_ADDRESS` in your environment

## Step 6: Test the Integration

1. Connect a wallet on the frontend
2. Open the staking panel
3. Try staking some COAL
4. Verify the transaction on Solscan/Solana Explorer

## Architecture Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   COAL Token    │     │   IOU-COAL      │     │   Redeemer      │
│  (Pump.fun)     │     │   (Quarry)      │     │   Wallet        │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │ stake                 │ rewards               │ redeem
         ▼                       ▼                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         QUARRY STAKING                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │
│  │ MintWrapper │──│  Rewarder   │──│   Quarry    │                 │
│  │ (IOU mint)  │  │ (rewards)   │  │ (stake)     │                 │
│  └─────────────┘  └─────────────┘  └─────────────┘                 │
└─────────────────────────────────────────────────────────────────────┘
```

## Flow

1. **Stake**: User stakes COAL tokens in Quarry
2. **Earn**: User earns IOU-COAL rewards over time
3. **Claim**: User claims IOU-COAL from Quarry
4. **Redeem**: User redeems IOU-COAL → real COAL at Redeemer

## Troubleshooting

### "Quarry staking not configured"

Make sure all four environment variables are set:
- `QUARRY_MINT_WRAPPER`
- `QUARRY_REWARDER_ADDRESS`
- `QUARRY_ADDRESS`
- `IOU_TOKEN_MINT`

### "Account does not exist"

The Quarry account might not be properly deployed. Re-run the deployment script.

### "insufficient funds"

The user doesn't have enough COAL to stake, or the deployer ran out of SOL.

### Transaction Signing Fails

Ensure Privy is properly configured and the user has approved transaction signing.

## Required Environment Variables

| Variable | Description | Where |
|----------|-------------|-------|
| `QUARRY_MINT_WRAPPER` | MintWrapper address | Server |
| `QUARRY_REWARDER_ADDRESS` | Rewarder address | Server |
| `QUARRY_ADDRESS` | Quarry staking pool address | Server + Client |
| `IOU_TOKEN_MINT` | IOU-COAL token mint | Server + Client |
| `REDEEMER_WALLET_ADDRESS` | Wallet that redeems IOU for COAL | Server |
| `TOKEN_MINT_ADDRESS` | COAL token mint (Pump.fun) | Server |

## Mainnet Deployment

For mainnet:

1. Change `SOLANA_NETWORK=mainnet` in environment
2. Use mainnet RPC in deployment script
3. Get real SOL for deployment fees
4. Update all environment variables with mainnet addresses
5. Ensure buyback service is properly funding the redeemer

**⚠️ SECURITY**: Never commit private keys or use test keys on mainnet!
