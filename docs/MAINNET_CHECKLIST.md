# Black Gold Mainnet Readiness Checklist

> Track progress from devnet to mainnet launch.
> Last updated: January 22, 2026

---

## Phase 0: Wallet Infrastructure

- [x] Generate 4 wallets (run `npx tsx scripts/setup-wallets.ts`)
- [ ] Fund Reward Pool wallet with devnet SOL (2+ SOL) via https://faucet.solana.com/
- [ ] Fund Creator wallet with devnet SOL (2+ SOL)
- [ ] Fund Bet Escrow wallet with devnet SOL (2+ SOL)
- [ ] Fund Redeemer wallet with devnet SOL (2+ SOL)
- [ ] Transfer devnet COAL tokens to Reward Pool wallet

**Wallet addresses saved to**: `.wallet-keys.env` (gitignored)

---

## Phase 1: Devnet Token Flow

- [x] Code change: `processRewardPayout()` allows real devnet transfers (v3.4.1)
- [ ] Set Railway env vars (see `.wallet-keys.env` + below):
  ```
  SOLANA_NETWORK=devnet
  TOKEN_MINT_ADDRESS=<your devnet COAL token mint>
  HELIUS_API_KEY=<your Helius API key>
  ADMIN_SECRET=<strong random password>
  CORS_ALLOWED_ORIGINS=https://your-vercel-domain.vercel.app
  ```
- [ ] Test discovery payout: mine, find discovery, check COAL arrives in wallet
- [ ] Test vault hourly distribution: mine 1+ hour, verify vault payouts
- [ ] Verify transactions on Solana Explorer (devnet)

---

## Phase 2: Quarry Staking (Devnet)

- [ ] Deploy Quarry: `DEPLOYER_PRIVATE_KEY="<key>" npx tsx scripts/deploy-quarry.ts`
- [ ] Set Quarry env vars in Railway:
  ```
  QUARRY_MINT_WRAPPER=<from deploy output>
  QUARRY_REWARDER_ADDRESS=<from deploy output>
  QUARRY_ADDRESS=<from deploy output>
  IOU_TOKEN_MINT=<from deploy output>
  ```
- [ ] Test on-chain staking via UI (stake COAL, verify on Explorer)
- [ ] Test unstaking (unstake, verify tokens return)
- [ ] Test IOU-COAL claim (stake, wait, claim rewards)
- [ ] Test IOU-COAL redeem (exchange IOU for real COAL)
- [ ] Fund Redeemer wallet with COAL for redemptions

---

## Phase 3: Raid Bets (Devnet)

- [ ] Test raid with bet: start expedition with betAmount > 0
- [ ] Verify bet deposit (COAL transferred to escrow wallet)
- [ ] Test defender win: verify 90% burned, 10% to defenders
- [ ] Test attacker win: verify bet returned + share of stolen rewards

---

## Phase 4: Buyback Service (Devnet)

- [ ] Fund Creator wallet with devnet SOL
- [ ] Run `npm run buyback` (separate terminal)
- [ ] Verify SOL -> COAL swap via Jupiter (may not work on devnet without liquidity)
- [ ] Verify COAL arrives in Reward Pool

---

## Phase 5: Mainnet Launch

### Pre-Launch

- [ ] Launch COAL token on Pump.fun (get real mint address)
- [ ] Generate FRESH mainnet wallets (`npx tsx scripts/setup-wallets.ts`)
- [ ] Fund Reward Pool with initial COAL supply
- [ ] Deploy Quarry on mainnet (same script, mainnet RPC)
- [ ] Update ALL Railway env vars to mainnet values:
  ```
  SOLANA_NETWORK=mainnet
  TOKEN_MINT_ADDRESS=<pump.fun COAL mint>
  SOLANA_RPC_URL=<helius mainnet RPC>
  HELIUS_API_KEY=<mainnet key>
  REWARD_WALLET_PRIVATE_KEY=<mainnet key>
  REWARD_WALLET_ADDRESS=<mainnet address>
  CREATOR_WALLET_PRIVATE_KEY=<mainnet key>
  CREATOR_WALLET_ADDRESS=<mainnet address>
  BET_ESCROW_WALLET=<mainnet address>
  REDEEMER_WALLET_ADDRESS=<mainnet address>
  QUARRY_MINT_WRAPPER=<mainnet>
  QUARRY_REWARDER_ADDRESS=<mainnet>
  QUARRY_ADDRESS=<mainnet>
  IOU_TOKEN_MINT=<mainnet>
  ADMIN_SECRET=<random 32+ char string>
  CORS_ALLOWED_ORIGINS=https://yourdomain.com
  ```
- [ ] Set `CORS_ALLOWED_ORIGINS` to production domain
- [ ] Verify WSS works (Railway handles TLS)
- [ ] Start buyback service: `npm run buyback:prod`

### Post-Launch Verification

- [ ] Test full flow with small amounts on mainnet
- [ ] Verify discovery rewards arrive in miner wallets
- [ ] Verify staking via Quarry works
- [ ] Monitor reward pool balance
- [ ] Monitor buyback service logs
- [ ] Check admin console for errors

---

## Security Reminders

- NEVER use devnet wallets on mainnet
- NEVER commit private keys to git
- Store mainnet keys in Railway env vars only (not in files)
- Use hardware wallet for high-value wallets if possible
- Set ADMIN_SECRET to a strong random value (32+ chars)
- Set CORS_ALLOWED_ORIGINS to your production domain only

---

## Automated Tests (Run Before Each Phase)

```bash
npm test                    # All 162 tests
npm run test:formulas       # 79 unit tests
npm run test:simulation     # 59 simulation tests
npm run test:e2e            # 24 E2E tests
```

All tests should pass before proceeding to the next phase.
