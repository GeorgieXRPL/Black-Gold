# Raid Flow Testing Guide

This document outlines how to test the raid betting system on devnet.

## Prerequisites

1. **Devnet COAL tokens** in your test wallet
2. **Devnet SOL** for transaction fees
3. **Server running** with proper environment variables
4. **Frontend deployed** or running locally

## Environment Setup

```bash
# Server environment variables needed:
export SOLANA_NETWORK=devnet
export TOKEN_MINT_ADDRESS=<your-devnet-coal-token>
export BET_ESCROW_WALLET=<your-escrow-wallet-address>
export QUARRY_REWARDER_ADDRESS=<from-deploy-quarry-script>
export QUARRY_ADDRESS=<from-deploy-quarry-script>
```

## Test Scenarios

### 1. Basic Raid Creation

**Steps:**
1. Connect wallet with COAL tokens
2. Select a mine to attack from
3. Select a target mine
4. Enter bet amount
5. Submit raid

**Expected Results:**
- Raid pool created in BetEscrowManager
- WebSocket broadcasts `raid_started` event
- UI shows raid in progress

**API Verification:**
```bash
# Check raid pool was created
curl http://localhost:8080/api/escrow/config
```

### 2. Bet Deposit Flow

**Steps:**
1. Start or join an existing raid
2. Enter bet amount
3. Sign deposit transaction

**Expected Results:**
- Transaction builds successfully
- User signs and transaction confirms
- Bet recorded in raid pool
- COAL transferred to escrow wallet

**API Verification:**
```bash
# Build deposit transaction
curl -X POST http://localhost:8080/api/escrow/deposit \
  -H "Content-Type: application/json" \
  -d '{"walletAddress": "<wallet>", "amount": 100, "raidId": "<raid-id>"}'

# Verify deposit after user signs
curl -X POST http://localhost:8080/api/escrow/verify \
  -H "Content-Type: application/json" \
  -d '{"signature": "<tx-sig>", "walletAddress": "<wallet>", "amount": 100, "raidId": "<raid-id>"}'
```

### 3. Raid Resolution - Attacker Wins

**Preconditions:**
- Active raid with bets
- Attack power > defense power

**Expected Results:**
- Attackers receive bet returns
- Target mine vault partially drained
- Activity feed shows raid result
- WebSocket broadcasts `raid_result`

### 4. Raid Resolution - Defender Wins

**Preconditions:**
- Active raid with bets
- Defense power > attack power

**Expected Results:**
- 90% of attacker bets burned
- 10% of attacker bets distributed to defenders
- Target mine protected
- Activity feed shows raid result

### 5. Multiple Simultaneous Raids

**Steps:**
1. Create raid on Mine A
2. Create raid on Mine B
3. Have users bet on both
4. Let both resolve

**Expected Results:**
- Raid pools tracked independently
- Resolutions don't interfere
- All payouts/burns correct

### 6. Raid with No Bets

**Steps:**
1. Create raid without any bets
2. Wait for raid to resolve

**Expected Results:**
- Raid resolves normally
- No payout/burn transactions
- Target mine vault may still be affected

## Verification Queries

### Check User's Active Bets
```bash
curl http://localhost:8080/api/escrow/bets/<wallet-address>
```

### Check Escrow Stats
```bash
curl http://localhost:8080/api/escrow/config
```

### Check Mine State
```bash
# Via WebSocket - connect and send:
{ "type": "mine_stats", "payload": { "mineId": "<mine-id>" } }
```

## Expected WebSocket Events

During a raid, clients should receive:

1. `raid_started` - When raid begins
2. `miner_joined` / `miner_left` - As miners participate
3. `raid_result` - When raid resolves (winner, amounts)
4. `game_event` - Activity feed updates

## Error Scenarios to Test

### Insufficient Balance
- Try to bet more than wallet has
- Expected: Error before transaction builds

### Invalid Raid ID
- Try to deposit for non-existent raid
- Expected: 400 error from API

### Duplicate Bet
- Try to bet twice on same raid
- Expected: Error "already has a bet"

### Raid Already Resolved
- Try to bet after raid ends
- Expected: Error "no longer accepting bets"

## On-Chain Verification

Use Solana Explorer (devnet) to verify:

1. **Deposit transactions** have correct memo: `bet_deposit:<raidId>:<amount>`
2. **Escrow wallet** receives COAL tokens
3. **Payout transactions** have memo: `bet_payout:<wallet>:<amount>`
4. **Burn transactions** have memo: `bet_burn:<amount>`

## Cleanup

After testing:
```bash
# Cleanup old raid pools (server-side)
getBetEscrowManager().cleanupResolvedPools(0) # 0 = immediate cleanup
```

## Known Limitations

1. **No automated tests** - Manual testing only for now
2. **Escrow keypair** - Server needs escrow private key for payouts
3. **No refunds** - Bets cannot be withdrawn mid-raid
4. **Devnet only** - Do not test on mainnet without full audit

## Reporting Issues

When reporting bugs, include:
- Transaction signatures
- Server logs
- Browser console logs
- Steps to reproduce
