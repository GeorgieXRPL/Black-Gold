# Black Gold Deployment Guide

Complete step-by-step guide to deploy Black Gold to Vercel (frontend) and Railway (backend).

---

## Architecture Overview

```
┌─────────────────┐         ┌─────────────────┐
│     VERCEL      │         │     RAILWAY     │
│  (Frontend)     │◄───────►│  (Game Server)  │
│  Next.js App    │   WSS   │  WebSocket      │
│                 │         │                 │
│  Port: 443      │         │  Port: 8080     │
└─────────────────┘         └─────────────────┘
        │                           │
        │                           │
        ▼                           ▼
┌─────────────────┐         ┌─────────────────┐
│     PRIVY       │         │   SOLANA RPC    │
│  (Wallet Auth)  │         │  (Blockchain)   │
└─────────────────┘         └─────────────────┘
```

---

## Prerequisites

Before starting, you'll need:

1. **GitHub Account** - Your repo is already at `github.com/GeorgieXRPL/Black-Gold`
2. **Vercel Account** - Free at https://vercel.com (sign in with GitHub)
3. **Railway Account** - Free tier at https://railway.app (sign in with GitHub)
4. **Privy Account** - Free at https://dashboard.privy.io (for wallet connection)
5. **Helius Account** (Optional) - Free tier at https://helius.dev (for Solana RPC)

---

## Step 1: Deploy Backend to Railway

### 1.1 Create Railway Project

1. Go to https://railway.app
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"**
4. Choose `GeorgieXRPL/Black-Gold`
5. Railway will detect it as a Node.js project

### 1.2 Configure Railway Service

1. Click on the deployed service
2. Go to **Settings** tab
3. Set these values:

| Setting | Value |
|---------|-------|
| **Root Directory** | `black-gold` |
| **Build Command** | `npm install && npm run build` |
| **Start Command** | `npm run server` |

### 1.3 Add Environment Variables

Go to **Variables** tab and add:

```
PORT=8080
ADMIN_SECRET=your-secure-password-here
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
SOLANA_NETWORK=mainnet-beta
```

Optional - Quarry Staking (add after running deploy-quarry.ts):
```
QUARRY_MINT_WRAPPER=your-mint-wrapper-address
QUARRY_REWARDER_ADDRESS=your-rewarder-address
QUARRY_ADDRESS=your-quarry-address
IOU_TOKEN_MINT=your-iou-token-mint
BET_ESCROW_WALLET=your-escrow-wallet-address
```

Optional - Other (add later when ready):
```
HELIUS_API_KEY=your-helius-key
TOKEN_MINT_ADDRESS=your-token-mint
REWARD_WALLET_PRIVATE_KEY=your-reward-wallet-key
REDEEMER_WALLET_ADDRESS=your-redeemer-wallet
```

### 1.4 Deploy and Get URL

1. Click **"Deploy"** or it will auto-deploy
2. Once deployed, go to **Settings → Networking**
3. Click **"Generate Domain"**
4. Copy your URL: `https://your-app-name.railway.app`

**Your WebSocket URL will be:** `wss://your-app-name.railway.app`

---

## Step 2: Deploy Frontend to Vercel

### 2.1 Create Vercel Project

1. Go to https://vercel.com
2. Click **"Add New → Project"**
3. Import `GeorgieXRPL/Black-Gold` from GitHub
4. Vercel will detect Next.js automatically

### 2.2 Configure Build Settings

| Setting | Value |
|---------|-------|
| **Framework Preset** | Next.js |
| **Root Directory** | `black-gold` |
| **Build Command** | `npm run build` |
| **Output Directory** | `.next` |

### 2.3 Add Environment Variables

In the Vercel project settings, add these environment variables:

```
NEXT_PUBLIC_WS_URL=wss://your-railway-app.railway.app
NEXT_PUBLIC_USE_MOCKS=false
```

Optional - Quarry Staking (add after running deploy-quarry.ts):
```
NEXT_PUBLIC_QUARRY_ENABLED=true
NEXT_PUBLIC_QUARRY_REWARDER=your-rewarder-address
NEXT_PUBLIC_QUARRY_ADDRESS=your-quarry-address
NEXT_PUBLIC_IOU_TOKEN_MINT=your-iou-token-mint
```

Optional - Other (add when you have them):
```
NEXT_PUBLIC_PRIVY_APP_ID=your-privy-app-id
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
ADMIN_SECRET=your-admin-password
```

### 2.4 Deploy

1. Click **"Deploy"**
2. Wait for build to complete (2-3 minutes)
3. Your site will be live at: `https://your-project.vercel.app`

---

## Step 3: Set Up Privy (Wallet Connection)

### 3.1 Create Privy App

1. Go to https://dashboard.privy.io
2. Create a new app
3. Set **App Name**: "Black Gold"
4. Set **Allowed Domains**:
   - `localhost:3000` (for local dev)
   - `your-project.vercel.app` (your Vercel URL)

### 3.2 Configure Privy Settings

In Privy Dashboard:

1. **Login Methods** → Enable "Wallet"
2. **Wallets** → Enable Solana wallets (Phantom, Solflare, etc.)
3. **Appearance** → Set theme to dark, accent color to `#F59E0B`

### 3.3 Get Your App ID

1. Go to **Settings** in Privy dashboard
2. Copy your **App ID**
3. Add to Vercel: `NEXT_PUBLIC_PRIVY_APP_ID=your-app-id`
4. Redeploy Vercel

---

## Step 4: Deploy Quarry Staking Infrastructure

> **Optional**: Only needed if you want on-chain Quarry staking

### 4.1 Prerequisites

- Solana wallet with devnet/mainnet SOL (~2 SOL)
- Private key in base58 format
- Token already created (via Pump.fun or `create-test-token.ts`)

### 4.2 Run Deploy Script

From the `black-gold` directory:

```bash
DEPLOYER_PRIVATE_KEY="your-base58-private-key" npx tsx scripts/deploy-quarry.ts
```

### 4.3 What Gets Deployed

The script creates:
1. **IOU-COAL Token** - Reward token with MintWrapper
2. **MintWrapper** - Controls IOU token minting
3. **Rewarder** - Manages reward distribution
4. **Quarry** - Staking pool for COAL tokens

### 4.4 Update Environment Variables

The script outputs environment variables to add:

**Railway:**
```
QUARRY_MINT_WRAPPER=...
QUARRY_REWARDER_ADDRESS=...
QUARRY_ADDRESS=...
IOU_TOKEN_MINT=...
```

**Vercel:**
```
NEXT_PUBLIC_QUARRY_ENABLED=true
NEXT_PUBLIC_QUARRY_REWARDER=...
NEXT_PUBLIC_QUARRY_ADDRESS=...
NEXT_PUBLIC_IOU_TOKEN_MINT=...
```

### 4.5 Architecture Overview

```
┌──────────────────────────────────────────────┐
│  QUARRY STAKING FLOW                         │
├──────────────────────────────────────────────┤
│  1. User stakes COAL → Quarry                │
│  2. User earns IOU-COAL over time            │
│  3. User claims IOU-COAL → wallet            │
│  4. User redeems IOU-COAL → real COAL        │
│     (Redeemer funded by buyback service)     │
│  5. User can unstake COAL anytime (instant)  │
└──────────────────────────────────────────────┘
```

---

## Step 5: Verify Deployment

### 5.1 Test Frontend

1. Open your Vercel URL
2. Check that the globe loads with continent outlines
3. Click on mine markers
4. Check browser console for errors

### 5.2 Test WebSocket Connection

1. Open browser DevTools → Network → WS
2. You should see a WebSocket connection to your Railway URL
3. If connected, you'll see ping/pong messages

### 5.3 Test Admin Console

1. Go to `https://your-vercel-url.vercel.app/admin`
2. Enter your `ADMIN_SECRET` password
3. You should see the admin dashboard

---

## Environment Variables Summary

### Vercel (Frontend)

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_WS_URL` | ✅ Yes | Railway WebSocket URL |
| `NEXT_PUBLIC_PRIVY_APP_ID` | ✅ Yes | Privy app ID for wallet auth |
| `NEXT_PUBLIC_USE_MOCKS` | No | Set to `false` for production |
| `NEXT_PUBLIC_SOLANA_RPC_URL` | No | Custom Solana RPC |
| `ADMIN_SECRET` | ✅ Yes | Admin console password |
| `NEXT_PUBLIC_QUARRY_ENABLED` | No | Enable Quarry staking UI |
| `NEXT_PUBLIC_QUARRY_REWARDER` | No | Quarry rewarder address |
| `NEXT_PUBLIC_QUARRY_ADDRESS` | No | Quarry staking pool address |
| `NEXT_PUBLIC_IOU_TOKEN_MINT` | No | IOU reward token mint |

### Railway (Backend)

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | ✅ Yes | Usually `8080` |
| `ADMIN_SECRET` | No | For server admin functions |
| `SOLANA_RPC_URL` | No | Solana RPC endpoint |
| `SOLANA_NETWORK` | No | `devnet` or `mainnet-beta` |
| `HELIUS_API_KEY` | No | For holder verification |
| `TOKEN_MINT_ADDRESS` | No | Your SPL token mint |
| `REWARD_WALLET_PRIVATE_KEY` | No | For reward distribution |
| `QUARRY_MINT_WRAPPER` | No | Quarry MintWrapper address |
| `QUARRY_REWARDER_ADDRESS` | No | Quarry Rewarder address |
| `QUARRY_ADDRESS` | No | Quarry staking pool address |
| `IOU_TOKEN_MINT` | No | IOU reward token mint |
| `BET_ESCROW_WALLET` | No | Escrow wallet for raid bets |
| `REDEEMER_WALLET_ADDRESS` | No | Wallet for IOU→COAL redemption |

---

## Troubleshooting

### Frontend won't connect to WebSocket

1. Check `NEXT_PUBLIC_WS_URL` is set correctly
2. Make sure it starts with `wss://` (not `ws://` or `https://`)
3. Check Railway logs for errors
4. Verify Railway service is running

### Globe appears black (no continents)

1. Check browser DevTools → Network
2. Look for `/geo/continents.json` request
3. If 404, the file might not be deployed
4. Try redeploying Vercel

### Admin console returns 401

1. Check `ADMIN_SECRET` is set in Vercel
2. Make sure you're using the correct password
3. Clear browser cookies and try again

### Railway deploy fails

1. Check that `Root Directory` is set to `black-gold`
2. Check build logs for errors
3. Verify `package.json` has all dependencies

---

## Cost Estimates

| Service | Free Tier | Paid |
|---------|-----------|------|
| **Vercel** | 100GB bandwidth/month | $20/month Pro |
| **Railway** | $5 free credits/month | ~$5-20/month |
| **Privy** | 1,000 users/month | $99/month |
| **Helius** | 100k requests/day | $49/month |

For testing and small launches, you can stay within free tiers.

---

## Next Steps After Deployment

1. **Test mining flow** - Connect wallet, join mine, start mining
2. **Test raids** - Launch expedition, check cooldowns
3. **Monitor logs** - Check Railway logs for errors
4. **Set up monitoring** - Consider adding error tracking (Sentry)
5. **Configure token** - Add `TOKEN_MINT_ADDRESS` when token launches
6. **Enable rewards** - Set up reward wallet when ready

---

## Quick Reference Commands

```bash
# Local development
cd black-gold
npm run dev          # Frontend on http://localhost:3000
npm run server       # Backend on ws://localhost:8080

# Build check
npm run build        # Check for build errors

# Type check
npx tsc --noEmit     # Check TypeScript errors

# Git workflow
git checkout dev     # Work on dev branch
git push origin dev  # Push changes
```
