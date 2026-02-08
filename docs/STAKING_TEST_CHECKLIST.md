# Staking System Test Checklist

This document provides a comprehensive checklist for manually testing the Black Gold staking system on devnet before mainnet deployment.

## Pre-Test Setup

- [ ] Ensure devnet environment is configured
- [ ] Verify Quarry addresses are set in Railway environment
- [ ] Have at least 2 test wallets with devnet COAL tokens
- [ ] Have devnet SOL in test wallets for transaction fees
- [ ] Open browser console for logging

## Phase 1: Core Operations Testing

### Test 1.1: First-Time Staking
- [ ] Connect a new wallet (never staked before)
- [ ] Navigate to staking panel
- [ ] Enter stake amount: **100 COAL**
- [ ] Click Stake button
- [ ] Approve transaction in wallet
- [ ] **Expected Results:**
  - [ ] Miner account created (check logs)
  - [ ] Tokens staked successfully
  - [ ] Transaction confirmed on Solana Explorer
  - [ ] UI shows updated staked balance

**Transaction Signature:** _______________
**Explorer Link:** _______________

### Test 1.2: Additional Staking
- [ ] With existing stake, add **400 more COAL** (total: 500)
- [ ] Approve transaction
- [ ] **Expected Results:**
  - [ ] No new miner account created
  - [ ] Staked balance = 500 COAL
  - [ ] Tier displayed as "Silver"

**Transaction Signature:** _______________

### Test 1.3: Partial Unstake
- [ ] Unstake **200 COAL**
- [ ] Approve transaction
- [ ] **Expected Results:**
  - [ ] Remaining stake = 300 COAL
  - [ ] Tier = Bronze
  - [ ] 200 COAL returned to wallet

**Transaction Signature:** _______________

### Test 1.4: Full Unstake
- [ ] Unstake all remaining (**300 COAL**)
- [ ] **Expected Results:**
  - [ ] Stake = 0
  - [ ] Miner account still exists
  - [ ] Tier = Base
  - [ ] All tokens returned to wallet

**Transaction Signature:** _______________

### Test 1.5: Re-Stake After Full Unstake
- [ ] Stake **1000 COAL**
- [ ] **Expected Results:**
  - [ ] No new miner account created (reuses existing)
  - [ ] Tier = Gold

**Transaction Signature:** _______________

---

## Phase 2: Tier Benefits Testing

### Test 2.1: Hashrate Multiplier Verification

| Tier | Stake Amount | Expected Multiplier | Actual Multiplier | Pass? |
|------|--------------|---------------------|-------------------|-------|
| Base | 0 | 1.0x | | [ ] |
| Bronze | 100 | 1.5x | | [ ] |
| Silver | 500 | 2.0x | | [ ] |
| Gold | 1000 | 2.5x | | [ ] |
| Diamond | 5000 | 3.0x | | [ ] |

**Test Steps:**
1. Stake to reach tier
2. Start mining
3. Check server logs for effective hashrate
4. Verify multiplier matches expected

### Test 2.2: Defense Power Verification

| Tier | Stake | Home Base | Expected Defense | Actual | Pass? |
|------|-------|-----------|------------------|--------|-------|
| Bronze | 100 | No | 120 | | [ ] |
| Bronze | 100 | Yes | 180 | | [ ] |
| Silver | 500 | No | 750 | | [ ] |
| Silver | 500 | Yes | 1125 | | [ ] |
| Gold | 1000 | No | 1800 | | [ ] |
| Gold | 1000 | Yes | 2700 | | [ ] |
| Diamond | 5000 | No | 10000 | | [ ] |
| Diamond | 5000 | Yes | 15000 | | [ ] |

**Formula:** `defensePower = stakeAmount * defenseMultiplier * (1.5 if homeBase)`

### Test 2.3: Coal Loyalty Bonus
- [ ] Stake at coal mine for 7+ days (or simulate via config)
- [ ] **Expected:** +10% bonus to hashrate multiplier
- [ ] Verify in server logs

---

## Phase 3: Multi-Device Testing

### Test 3.1: Same Wallet, Multiple Browsers
- [ ] Open site in Chrome
- [ ] Open site in Firefox
- [ ] Connect same wallet in both
- [ ] Stake from Chrome
- [ ] **Verify:** Firefox shows updated balance within 5 seconds

### Test 3.2: Stake State Sync
- [ ] Device A shows staked balance
- [ ] Unstake from Device B
- [ ] **Verify:** Device A updates within 5 seconds

### Test 3.3: Concurrent Staking Attempt
- [ ] Open staking panel on both devices
- [ ] Try to stake simultaneously
- [ ] **Expected:** One succeeds, one fails gracefully with clear error

---

## Phase 4: Edge Case Testing

### Test 4.1: Zero Amount Operations
- [ ] Try to stake 0 tokens
- [ ] **Expected:** Validation error, no transaction

### Test 4.2: Insufficient Balance
- [ ] Try to stake more than wallet balance
- [ ] **Expected:** Clear error message

### Test 4.3: Unstake More Than Staked
- [ ] Try to unstake 1000 when only 500 staked
- [ ] **Expected:** Validation error or partial unstake

### Test 4.4: Rapid Operations
- [ ] Stake, immediately unstake, immediately stake
- [ ] **Expected:** All transactions process correctly

### Test 4.5: Network Interruption
- [ ] Start staking transaction
- [ ] Disconnect network mid-signing
- [ ] Reconnect
- [ ] **Expected:** Clear error, no stuck state

### Test 4.6: Wallet Disconnect
- [ ] Open staking panel
- [ ] Disconnect wallet
- [ ] Try to stake
- [ ] **Expected:** Redirect to connect wallet

### Test 4.7: Blockhash Expiry
- [ ] Build transaction, wait 2+ minutes
- [ ] Try to submit
- [ ] **Expected:** Error about expired transaction

---

## Phase 5: Automated Test Suite

Run the full automated test suite:

```bash
npm test                         # All 162 tests
npm run test:formulas            # 79 unit tests
npm run test:simulation          # 59 simulation tests
npm run test:e2e                 # 24 E2E tests
```

### Test Results (v3.4.1):
- [x] All tier calculation tests pass (79/79 formulas)
- [x] All hashrate multiplier tests pass
- [x] All defense power tests pass
- [x] All attack power tests pass
- [x] All staking lifecycle tests pass (10 tests)
- [x] All cooldown system tests pass (6 tests)
- [x] All expedition/raid tests pass (13 tests)
- [x] All bet escrow tests pass (6 tests)
- [x] All vault distribution tests pass (7 tests)
- [x] All REST API validation tests pass (9 tests)
- [x] All WebSocket protocol tests pass (10 tests)
- [x] All admin console tests pass (4 tests)
- [x] Rate limiting verified (1 test)
- [x] Edge case overflow/precision tests pass

**Total Tests:** 162/162
**Pass Rate:** 100%
**Duration:** ~11 seconds

---

## Phase 6: Raid Integration Testing

### Test 6.1: Attack Power Calculation
- [ ] Launch a raid
- [ ] Check server logs for attack power
- [ ] **Formula:** `attackPower = (effectiveHashrate * 0.5) + (stakeAmount * 0.1)`
- [ ] Verify calculation matches

### Test 6.2: Defense Power During Raid
- [ ] Verify 50% defense power when on expedition
- [ ] Verify full defense power when at home
- [ ] Check raid resolution logs

---

## Test Sign-Off

| Phase | Tester | Date | Pass/Fail | Notes |
|-------|--------|------|-----------|-------|
| Phase 1 | | | | |
| Phase 2 | | | | |
| Phase 3 | | | | |
| Phase 4 | | | | |
| Phase 5 | | | | |
| Phase 6 | | | | |

**Overall Status:** [ ] Ready for Mainnet / [ ] Needs Fixes

**Critical Issues Found:**
1. 
2. 
3. 

**Recommendations:**
1. 
2. 
3. 

---

## Appendix: Useful Commands

### Check Staking Config
```bash
curl http://localhost:3001/api/staking/config | jq
```

### Check User Stake Info
```bash
curl http://localhost:3001/api/staking/info/YOUR_WALLET_ADDRESS | jq
```

### View Transaction on Explorer
```
https://explorer.solana.com/tx/SIGNATURE?cluster=devnet
```

### Run Automated Tests
```bash
npx tsx scripts/test-staking.ts
```
