# Black Gold v3.3.13 - Codebase Index

> Complete file-by-file documentation for the Black Gold Interactive Mining Globe platform

**Last Updated**: January 21, 2026  
**Version**: 3.3.13 (Cache Bypass for Balance Refresh)  
**Total Files**: 90+ TypeScript/TSX/JS files

---

## 📋 Recent Changes (v3.3.13)

### Cache Bypass for Balance Refresh After Transactions

Fixed issue where balance wasn't updating after stake/unstake due to API cache.

#### Problem

After staking/unstaking:
- The `/api/verify-holder` endpoint has a 5-minute in-memory cache
- When `refreshWalletBalance()` was called, it returned cached (stale) data
- Users saw old balances even after successful on-chain transactions

#### Fixes in `app/api/verify-holder/route.ts`

Added `force=true` query parameter to bypass cache:
```typescript
export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get('wallet');
  const forceRefresh = request.nextUrl.searchParams.get('force') === 'true';
  
  // Get cached data (needed for error fallback even if force refresh)
  const cached = verificationCache.get(wallet);
  
  // Check cache first (unless force refresh is requested)
  if (!forceRefresh && cached && Date.now() - cached.timestamp < HOLDER_CONFIG.CACHE_DURATION_MS) {
    return NextResponse.json(cached.data);
  }
  
  if (forceRefresh) {
    console.log(`[API] Force refresh requested for ${wallet.slice(0,8)}...`);
  }
  // ... fetch fresh data from chain
}
```

#### Fixes in `app/page.tsx`

Updated `refreshWalletBalance()` to use `force=true`:
```typescript
const refreshWalletBalance = useCallback(async () => {
  if (!walletState.walletAddress) return;
  
  // Use force=true to bypass the 5-minute API cache after stake/unstake
  const response = await fetch(`/api/verify-holder?wallet=${encodeURIComponent(walletState.walletAddress)}&force=true`);
  if (response.ok) {
    const data = await response.json();
    setWalletState(prev => ({
      ...prev,
      tokenBalance: data.balance ?? prev.tokenBalance,
    }));
  }
}, [walletState.walletAddress]);
```

---

## 📋 Previous Changes (v3.3.12)

### Balance Refresh After Stake/Unstake Transactions

Fixed issues where wallet balance and staked balance weren't updating after transactions.

2. **Updated success handlers to refresh BOTH balances**:
```typescript
// In handleStakeSuccess and handleUnstakeSuccess
setTimeout(() => {
  console.log('[Stake] Refreshing balances from chain...');
  staking.refreshStakeInfo();    // Refresh staked balance
  refreshWalletBalance();         // Refresh wallet balance
}, 3000);  // 3 seconds for chain confirmation
```

#### Fixes in `app/components/game/StakingPanel.tsx`

1. **Added visual feedback during refresh**:
```typescript
const [isRefreshing, setIsRefreshing] = useState(false);

// After successful transaction
setIsRefreshing(true);
setTimeout(() => {
  staking.refreshStakeInfo();
  setIsRefreshing(false);
}, 3000);
```

2. **Shows "Updating..." while refreshing**:
```typescript
{staking.isLoading || isRefreshing ? (
  <span className="animate-pulse">Updating...</span>
) : (
  `${effectiveStake.toLocaleString()} COAL`
)}
```

3. **Success message shows refresh status**:
```typescript
{isRefreshing && (
  <span className="text-green-300 ml-2 animate-pulse">Updating balances...</span>
)}
```

#### User Experience After Fix

1. ✅ Transaction succeeds → Success message appears
2. ⏳ "Updating balances..." shows for ~3 seconds
3. ✅ Staked balance updates to new amount
4. ✅ Wallet balance in header updates to new amount

---

## 📋 Previous Changes (v3.3.11)

### Staking UI Now Uses On-Chain Data Correctly

Fixed issues where staking popup showed 0 balance for some users and unstaking appeared broken.

#### Root Cause

Two separate stake tracking systems were out of sync:
1. **Local `userStakes` Map** - Started at 0 for new sessions
2. **On-chain `staking.stakeInfo`** - Correct values from Quarry

The StakingPanel was using local state which showed 0 for users who hadn't staked in the current browser session.

#### Fixes in `app/components/game/StakingPanel.tsx`

1. **Use on-chain data as primary source**:
```typescript
const onChainStake = staking.stakeInfo?.stakedAmount ?? 0;
const effectiveStake = onChainStake > 0 ? onChainStake : currentStake;
```

2. **Refresh stake info when panel opens**:
```typescript
useEffect(() => {
  staking.refreshStakeInfo();
}, []);
```

3. **Show loading state**:
```typescript
{staking.isLoading ? (
  <span className="animate-pulse">Loading...</span>
) : (
  `${effectiveStake.toLocaleString()} COAL`
)}
```

#### Fixes in `app/page.tsx`

1. **userStakeAtSelected/userStakeAtHome prefer on-chain value**:
```typescript
const onChainStakedAmount = staking.stakeInfo?.stakedAmount ?? 0;
const userStakeAtSelected = selectedMineId 
  ? (onChainStakedAmount > 0 ? onChainStakedAmount : (userStakes.get(selectedMineId) || 0)) 
  : 0;
```

---

## 📋 Previous Changes (v3.3.10)

### Comprehensive Staking Test Suite

Added automated test suite and manual test checklist for thorough staking system verification before mainnet deployment.

#### New Files

| File | Purpose |
|------|---------|
| `scripts/test-staking.ts` | Automated test suite with 51 tests covering tier calculations, hashrate multipliers, defense power, attack power, API integration, edge cases, stress tests, and error handling |
| `scripts/test-utils.ts` | Test utilities including logger, result tracker, assertions, timing helpers, and report generator |
| `docs/STAKING_TEST_CHECKLIST.md` | Manual test checklist for Phase 1-6 testing including core operations, tier benefits, multi-device, edge cases, automated tests, and raid integration |

#### Test Suite Coverage (51 Tests)

| Suite | Tests | Coverage |
|-------|-------|----------|
| Tier Calculation | 11 | All tier boundaries and edge cases |
| Hashrate Multiplier | 9 | All tiers + coal loyalty bonus |
| Defense Power | 8 | All tiers + home base bonus |
| Attack Power | 4 | Formula verification |
| API Integration | 5 | Config, stake info, transactions |
| Edge Cases | 6 | Large amounts, boundaries, precision |
| Stress Tests | 4 | 10K iterations, concurrent ops |
| Error Handling | 4 | Network errors, invalid inputs |

#### Running Tests

```bash
# Run automated test suite
npx tsx scripts/test-staking.ts

# Expected output: 51/51 tests passed
```

#### Manual Test Phases

1. **Phase 1**: Core operations (stake/unstake/re-stake)
2. **Phase 2**: Tier benefits (hashrate/defense multipliers)
3. **Phase 3**: Multi-device sync testing
4. **Phase 4**: Edge cases (zero amounts, insufficient balance, etc.)
5. **Phase 5**: Automated test suite execution
6. **Phase 6**: Raid integration (attack/defense power)

---

## 📋 Previous Changes (v3.3.9)

### Staking UX Improvements & Bug Fixes

Multiple fixes to improve the staking experience and resolve on-chain transaction issues.

#### 1. Create Miner Account Automatically

**Problem**: First-time stakers got error `AccountNotInitialized (0xbc4)` because Quarry requires a miner PDA to be created before staking.

**Fix**: Server now automatically creates miner account if it doesn't exist:

```typescript
// server/solana/staking.ts - buildStakeTransaction
const minerKey = await quarry.getMinerAddress(userPubkey);
const minerAccountInfo = await connection.getAccountInfo(minerKey);
const minerExists = minerAccountInfo !== null;

if (!minerExists) {
  const pendingMiner = await quarry.createMiner({ authority: userPubkey });
  transaction.add(...pendingMiner.tx.instructions);
}
```

#### 2. Fix Stake Info BN/BigInt Handling

**Problem**: Staked balance showed 0 because Quarry SDK returns BN (BigNumber) objects, not raw numbers.

**Fix**: Properly convert BN/BigInt to numbers with detailed logging:

```typescript
// server/solana/staking.ts - getUserStakeInfo
let stakedBalance = miner.balance;
if (stakedBalance && typeof stakedBalance.toNumber === 'function') {
  stakedBalance = stakedBalance.toNumber();
} else if (typeof stakedBalance === 'bigint') {
  stakedBalance = Number(stakedBalance);
}
```

#### 3. Non-Blocking Backend Verification

**Problem**: Users saw "verification pending" error even when on-chain tx succeeded.

**Fix**: Made backend verification non-blocking - wallet confirmation is authoritative:

```typescript
// app/hooks/useStaking.ts
// Transaction confirmed on-chain by wallet - this IS success!
verifyTransaction(signature, wallet.walletAddress, 'stake', amount)
  .then(v => { if (!v.verified) console.warn('Backend verification pending'); })
  .catch(e => console.warn('Backend verification error (non-blocking):', e));
```

#### 4. Staked Balance Display in Header

**New Feature**: Shows staked balance alongside wallet balance:

```
Wallet: 1,000,000 COAL | Staked: 450 COAL (green)
```

**File**: `app/page.tsx`
- Added `useStaking` hook import
- Added `stakedBalance` derived from `staking.stakeInfo?.stakedAmount`
- New UI section with staked amount in green

#### 5. Phantom Transaction Signing Improvements

**Problem**: Transactions failed with "Unexpected error" due to wrong transaction type detection.

**Fixes in** `app/providers/PrivyBridge.tsx`:
- Try legacy Transaction parsing FIRST (server builds legacy txs)
- Use `skipPreflight: true` to avoid simulation issues
- Better error logging with Phantom connection state
- Handle "already processed" transactions gracefully

---

## 📋 Previous Changes (v3.3.8)

### Preflight Check Endpoint Fix

**Problem**: The `preflightCheck` function in `useStaking.ts` was calling the Vercel frontend's API endpoints, which don't have the Quarry environment variables configured. This caused the "Staking system not configured. Contact support." error even though Railway backend was properly configured.

**Fix**: Updated `preflightCheck` to use `getApiBaseUrl()` which points to the Railway backend.

#### Changes in `app/hooks/useStaking.ts`

```typescript
// Before (broken): Called Vercel frontend
const response = await fetch('/api/staking/debug');

// After (fixed): Calls Railway backend
const baseUrl = getApiBaseUrl(); // Returns Railway URL
const configResponse = await fetch(`${baseUrl}/api/staking/config`);
const config = await configResponse.json();

if (!config.available) {
  return { ok: false, error: 'Staking system not configured. Contact support.' };
}

if (!config.quarryAddress || !config.rewarderAddress) {
  return { ok: false, error: 'Staking infrastructure not deployed. Contact support.' };
}
```

**Key Insight**: The frontend is hosted on Vercel, but the backend API is on Railway. Environment variables like `QUARRY_ADDRESS`, `QUARRY_REWARDER_ADDRESS`, and `IOU_TOKEN_MINT` are only set on Railway.

---

## 📋 Previous Changes (v3.3.7)

### Critical Staking Fix - Actual On-Chain Transactions

**Problem**: The StakingPanel was using `signMessage` (message signing) instead of actual blockchain transactions. Users would sign a message, see fake "success", but nothing happened on-chain.

**Fix**: Rewired StakingPanel to use the `useStaking` hook for real Quarry staking transactions.

#### StakingPanel Changes (`app/components/game/StakingPanel.tsx`)

- Now imports and uses `useStaking` hook instead of just `signMessage`
- Calls `staking.stake(amount)` and `staking.unstake(amount)` for real on-chain transactions
- Shows proper loading state during transaction
- Shows Solana Explorer link on success
- Shows specific error messages on failure
- Changed callback props to `onStakeSuccess` / `onUnstakeSuccess`

#### useStaking Hook Updates (`app/hooks/useStaking.ts`)

Added convenience accessors:
- `isStaking`, `isUnstaking`, `isClaiming` - loading states
- `error` - current error message
- `lastSignature` - last successful transaction signature
- `stakeInfo` - current on-chain stake info
- `clearError()` - function to clear error state

---

## 📋 Previous Changes (v3.3.6)

### WebSocket Connection, Balance Display, and Privy Hook Fixes

Fixed three critical issues: WebSocket reconnection spam, dual balance display (10M vs 1B), and Privy useWallets hook error.

#### 1. WebSocket Reconnection Strategy (`app/hooks/useGameSocket.ts`)

Added exponential backoff to prevent connection spam:
- Initial delay: 1 second
- Backoff multiplier: 2x each failure
- Max delay: 30 seconds
- Max retries: 10 attempts
- New `failed` status for giving up
- New `reconnect()` function to manually retry (resets backoff)
- New `connectionError` and `retryCount` state for UI feedback

```typescript
const RECONNECT_CONFIG = {
  INITIAL_DELAY_MS: 1000,
  MAX_DELAY_MS: 30000,
  MAX_RETRIES: 10,
  BACKOFF_MULTIPLIER: 2,
};
```

#### 2. Real Balance Display (`app/api/verify-holder/route.ts`)

Fixed devnet bypass to return REAL balance instead of fake 1% supply:
- Renamed `BYPASS_HOLDER_CHECK` to `BYPASS_ELIGIBILITY_CHECK`
- Now only bypasses eligibility CHECK (always eligible), not balance display
- Always fetches real on-chain balance via Helius or RPC fallback
- Removed all fake balance returns (10M was 1% of 1B supply)

#### 3. Privy Hook Context Fix (`app/providers/`)

Fixed "useWallets called outside PrivyProvider" error:
- Created new `PrivyBridge.tsx` with static Privy imports
- Uses Next.js `dynamic()` to lazy-load PrivyBridge
- Ensures hooks are called within proper React context
- Removed problematic dynamic component creation in useEffect

**New File**: `app/providers/PrivyBridge.tsx`
- Statically imports `usePrivy`, `useLogin`, `useLogout`, `useWallets`
- Contains all wallet signing logic
- Exported as default for dynamic import

---

## 📋 Previous Changes (v3.3.5)

### Staking Transaction Flow and Balance Display Fix

Fixed issues where staking transactions appeared to work but didn't go on-chain, and users saw mock balance instead of real tokens.

#### Root Cause Analysis

1. **Mock Data Masking Real Balances**: Frontend was showing `DEMO_USER.walletBalance: 10000` instead of fetching real on-chain balance
2. **Silent Transaction Failures**: Transactions were signed but errors weren't surfaced to users
3. **No Pre-flight Checks**: Users weren't warned about insufficient SOL for fees or missing tokens

#### New Balance API (`app/api/balance/route.ts`)

**New Endpoint**: `GET /api/balance?wallet=<address>`
- Fetches real on-chain SPL token balance
- Uses Helius API (primary) with direct RPC fallback
- Returns wallet address, balance, symbol, mint address, network

#### Staking Debug API (`app/api/staking/debug/route.ts`)

**New Endpoint**: `GET /api/staking/debug?wallet=<address>`
- Returns comprehensive diagnostics:
  - Quarry configuration status
  - Account existence checks (Quarry, Rewarder, mints)
  - Wallet SOL and COAL balances
  - Specific error messages for common issues

#### Frontend Balance Fetching (`app/page.tsx`)

**New Effect**: Fetches real balance when wallet connects
- Calls `/api/balance` on wallet connection
- Updates `walletState.tokenBalance` with real on-chain balance
- Refreshes every 30 seconds while connected
- No longer shows mock `DEMO_USER.walletBalance`

#### Improved Staking Hook (`app/hooks/useStaking.ts`)

**Pre-flight Checks**:
- `preflightCheck()` function validates before transaction
- Checks SOL balance for fees
- Checks COAL token balance
- Verifies Quarry configuration

**Better Error Handling**:
- Catches signing errors with specific messages
- Handles "User rejected" cancellations
- Logs Solana Explorer links for sent transactions
- Returns partial success if tx sent but verification pending

---

## 📋 Previous Changes (v3.3.4)

### Privy Solana Wallet Signing Fix

Fixed a critical bug where transaction signing failed with "No embedded or connected wallet found for address" error.

#### Root Cause

The `WalletProvider.tsx` was using Privy's `signMessage` function from `usePrivy()`, which is designed for Ethereum embedded wallets, not Solana wallets. Solana wallets require the `useWallets()` hook to access the wallet provider.

#### Fix (`app/providers/WalletProvider.tsx`)

**Updated to use `useWallets()` hook:**
- Now imports `useWallets` from `@privy-io/react-auth`
- Finds Solana wallet using `wallets.find(w => w.walletClientType === 'solana')`
- Gets provider via `await solanaWallet.getProvider()`
- Uses provider's `signMessage()`, `signTransaction()`, `signAndSendTransaction()` methods
- Maintains fallback to `window.solana` for external wallets (Phantom, etc.)

**Transaction Signing Flow:**
1. Check for Privy Solana wallet first (`solanaWallet`)
2. Get wallet provider via `getProvider()`
3. Use provider's signing methods
4. Fallback to `window.solana` if Privy wallet unavailable

**Affected Functions:**
- `handleSignMessage()` - Now uses `provider.signMessage(encodedMessage)`
- `handleSignTransaction()` - Now uses `provider.signTransaction(transaction)`
- `handleSignAndSendTransaction()` - Now uses `provider.signAndSendTransaction()` or signs and sends manually

---

## 📋 Previous Changes (v3.3.3)

### Enhanced Admin Console Logging

This release adds comprehensive logging to the admin console with deduplication to prevent spam.

#### Deduplication System (`server/index.ts`)

**New Helper Function:**
- `addServerLogDeduped()` - Prevents duplicate logs within 60-second window
- Tracks recent log keys and skips duplicates
- Auto-cleans old entries when map exceeds 100 items

#### Events Now Logged

| Event | Level | Source | Description |
|-------|-------|--------|-------------|
| Discovery found | `info` | Mining | When a miner finds a solution |
| Timeout winner | `info` | Mining | Round times out with winner |
| Timeout no winner | `warn` | Mining | Round times out, no qualified miners |
| Raid started | `info` | Raids | When an expedition begins |
| Large stake (≥1000) | `info` | Staking | Significant stake event |
| Large unstake (≥1000) | `info` | Staking | Significant unstake event |
| Rate limited | `warn` | Security | User hit rate limit (deduped) |
| Validation error | `warn` | Security | Invalid message format (deduped) |
| Internal error | `error` | System | Uncaught exception (deduped) |
| WebSocket error | `error` | Network | Connection error (deduped) |

#### Log Format

Logs use consistent emoji prefixes for easy scanning:
- ⛏️/🥇/🛢️/🥈 Mining discoveries (by resource)
- ⏱️ Timeout events
- ⚔️ Raid events
- 🔒/🔓 Staking events
- 🚫 Rate limit violations
- ⚠️ Validation errors
- 🔥 Internal errors
- 🔌 Network errors

**Privacy:** IP addresses are masked to show only first 3 octets (e.g., `192.168.1.x`)

---

## 📋 Previous Changes (v3.3.2)

### Admin Console Validation Fix

Fixed a critical bug where admin console WebSocket messages were being rejected by Zod validation.

#### Root Cause

Admin message types (`admin_auth`, `admin_subscribe`, `admin_action`) were added to handlers but not to the validation schema.

#### Fix (`server/middleware/validate.ts`)

Added `AdminAuthSchema`, `AdminSubscribeSchema`, `AdminActionSchema` to `WSMessageSchema`.

---

## 📋 Previous Changes (v3.3.1)

### Quarry SDK Integration for On-Chain Staking

This release implements full Quarry staking infrastructure, enabling users to stake COAL tokens on-chain and earn IOU-COAL rewards.

#### Staking Backend (`server/solana/staking.ts`)

**Updated to use real Quarry SDK:**
- `loadQuarrySDK()` - Lazy load SDK to avoid initialization errors
- `buildStakeTransaction()` - Build stake tx using Quarry SDK's `minerActions.stake()`
- `buildUnstakeTransaction()` - Build withdraw tx using `minerActions.withdraw()`
- `buildClaimRewardsTransaction()` - Build claim tx using `minerActions.claim()`
- `getUserStakeInfo()` - Query on-chain miner account for stake/rewards
- `verifyStakeTransaction()` - Verify tx success and parse memo
- `getQuarryStats()` - Admin endpoint for Quarry metrics

**New Transaction Flow:**
1. Server builds unsigned transaction with Quarry instructions
2. Frontend receives serialized tx (base64)
3. User signs with Privy wallet
4. Frontend sends to network
5. Server verifies on-chain

#### Staking REST API (`server/index.ts`)

**New HTTP Endpoints:**
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/staking/config` | GET | Get Quarry configuration status |
| `/api/staking/info/:wallet` | GET | Get user's on-chain stake info |
| `/api/staking/stake` | POST | Build stake transaction |
| `/api/staking/unstake` | POST | Build unstake transaction |
| `/api/staking/claim` | POST | Build claim rewards transaction |
| `/api/staking/verify` | POST | Verify transaction success |

#### Wallet Provider (`app/providers/WalletProvider.tsx`)

**Transaction Signing Support (v3.3.4 Fix):**
- `signMessage(message)` - Sign arbitrary message using Solana wallet
- `signTransaction(serializedTx)` - Sign tx without sending
- `signAndSendTransaction(serializedTx)` - Sign and send tx, return signature
- Uses `useWallets()` hook to find Solana wallet from Privy
- Gets wallet provider via `solanaWallet.getProvider()` for signing
- Graceful fallback chain: Privy Solana wallet → `window.solana` (Phantom, etc.)

#### Staking Hook (`app/hooks/useStaking.ts`)

**Complete Rewrite for Quarry:**
- `stake(amount)` - Request tx from server, sign, send, verify
- `unstake(amount)` - Same flow for withdrawals
- `claimRewards()` - Claim pending IOU-COAL rewards
- `refreshStakeInfo()` - Refresh on-chain stake data
- New state: `stakeInfo`, `isClaiming`, `config`
- API client functions for server communication

#### Deployment Documentation (`docs/QUARRY_DEPLOYMENT.md`)

**New File:** Complete deployment guide including:
- Prerequisites and wallet setup
- Running deployment script
- Environment variable configuration
- Architecture overview (COAL → Quarry → IOU-COAL → Redeemer)
- Troubleshooting guide
- Mainnet deployment checklist

#### Required Environment Variables

```
# Quarry Staking (set after running deploy-quarry.ts)
QUARRY_MINT_WRAPPER=<address>
QUARRY_REWARDER_ADDRESS=<address>
QUARRY_ADDRESS=<address>
IOU_TOKEN_MINT=<address>
REDEEMER_WALLET_ADDRESS=<address>

# Bet Escrow (for raid betting)
BET_ESCROW_WALLET=<address>
```

---

## 📋 Bet Escrow System (v3.3.1)

### On-Chain Bet Locking for Raids

Updated `server/game/bet-escrow.ts` to support on-chain SPL token transfers:

**New Transaction Building Methods:**
- `buildBetDepositTransaction()` - Build tx for user to deposit bet to escrow
- `verifyBetDeposit()` - Verify deposit tx was successful on-chain
- `buildPayoutTransactions()` - Build server-side payout txs for winners
- `buildBurnTransaction()` - Build server-side burn tx for loser bets
- `isConfigured()` - Check if escrow wallet is properly configured

**New REST API Endpoints:**
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/escrow/config` | GET | Get escrow configuration and stats |
| `/api/escrow/deposit` | POST | Build bet deposit transaction |
| `/api/escrow/verify` | POST | Verify bet deposit on-chain |
| `/api/escrow/bets/:wallet` | GET | Get user's active bets |

**Bet Flow:**
1. User calls `/api/escrow/deposit` to get unsigned transaction
2. User signs and sends transaction (COAL → escrow wallet)
3. Server calls `/api/escrow/verify` to confirm deposit
4. Server calls `placeBet()` to record the bet in the pool
5. When raid resolves, server builds payout/burn transactions
6. Server signs and sends payout/burn with escrow keypair

---

## 📋 Previous Changes (v3.3.0)

### Real-Time Admin Console

This release implements a fully functional admin console with real-time WebSocket data, replacing all mock data with live server metrics.

#### Server Admin API (`server/types.ts` & `server/index.ts`)

**New Message Types:**
- `admin_auth` - Admin authentication with password
- `admin_subscribe` - Subscribe to admin updates
- `admin_stats` - Dashboard statistics
- `admin_users` - Connected users list
- `admin_mines` - Mine statistics
- `admin_raids` - Active/recent raids
- `admin_logs` - Server logs
- `admin_action` - Admin actions (ban, unban, configure, etc.)

**New Interfaces:**
- `AdminStats` - Dashboard metrics (miners, hashrate, discoveries, health)
- `AdminUser` - User entry (wallet, status, stake, hashrate)
- `AdminMine` - Mine stats (miners, hashrate, vault, multipliers)
- `AdminRaid` - Raid log entry
- `AdminLog` - Server log entry
- `AdminActionPayload` - Admin action request

**New Server Functions:**
- `getAdminStats()` - Collect dashboard statistics
- `getAdminUsers()` - List connected users with their states
- `getAdminMines()` - Get mine statistics from registry
- `getAdminRaids()` - Get raid logs from expedition tracker
- `getAdminLogs()` - Get in-memory server logs
- `handleAdminAuth()` - Authenticate admin with ADMIN_SECRET
- `handleAdminSubscribe()` - Send initial data and subscribe to updates
- `handleAdminAction()` - Execute admin actions
- `broadcastAdminUpdates()` - Send updates every 2 seconds to subscribed admins
- `addServerLog()` - Add log entries for admin console

**Admin Actions:**
- `ban_user` - Ban wallet and disconnect
- `unban_user` - Remove ban
- `set_mine_config` - Update mine difficulty/reward multipliers
- `force_buyback` - Trigger buyback service
- `trigger_distribution` - Trigger vault distribution
- `clear_cache` - Clear in-memory caches

#### Frontend Admin Hook (`app/admin/hooks/useAdminSocket.ts`)

**New File:** WebSocket hook for admin console
- Connects to game server with admin authentication
- Auto-reconnects with stored password
- Manages state for stats, users, mines, raids, logs
- Provides `executeAction()` for admin commands

#### Admin Layout (`app/admin/layout.tsx`)

**Updated:**
- Integrated `useAdminSocket` hook
- Created `AdminContext` for sharing data across pages
- Added connection status indicator (Live/Connected/Connecting/Disconnected)
- Password stored in sessionStorage for WS auth

#### Admin Pages (Updated to use real data)

| Page | Changes |
|------|---------|
| `page.tsx` (Dashboard) | Uses `useAdminContext()`, real stats/health/logs |
| `users/page.tsx` | Real connected users, ban/unban via `executeAction` |
| `mines/page.tsx` | Real mine stats, configure via `executeAction` |
| `raids/page.tsx` | Real raid data from expedition tracker |
| `logs/page.tsx` | Real server logs, WS connection stats |
| `tokens/page.tsx` | Real wallet balance (partial - needs backend) |

---

## 📋 Previous Changes (v3.2.3)

### Duplicate Join Prevention (Connection Loop Fix)

**Problem**: Client and server kept disconnecting in an infinite loop, even when the user clicked "stop mining". The WebSocket would connect, disconnect after 1-5 seconds, reconnect, and repeat.

#### Root Cause Analysis

From logs - a repeating pattern every ~1 second:
```
[WS] Auto-joining mine coal-appalachian for FToSaSs7...      <- Server auto-joins
[WS] Client authenticated: FToSaSs7... (home: coal-appalachian)
[WS] join_mine from FToSaSs7...                              <- Client ALSO sends join_mine
[PoolManager] Wallet already connected, replacing connection  <- Server closes the WS!
[WS] Disconnected: FToSaSs7...                               <- Client reconnects
```

**The Bug**: Both server AND client try to join the mine:
1. Server: On `connect`, auto-joins the restored home mine (added in v3.2.2)
2. Client: When receiving `result` with `homeMineId`, sends `join_mine` as "belt-and-suspenders"
3. Server sees the same wallet joining → calls `handleConnect` → "Wallet already connected"
4. Server closes the **existing WebSocket** (which is the **SAME** WebSocket!)
5. Client's onclose fires → triggers reconnection
6. Cycle repeats indefinitely

#### The Fix (`server/pool/manager.ts`)

Detect when the **same WebSocket** is trying to register again and skip the operation:
```typescript
if (this.state.miners.has(walletAddress)) {
  const existingMiner = this.state.miners.get(walletAddress)!;
  
  // CRITICAL FIX: If same WebSocket is trying to join again, skip duplicate registration
  // This happens when client sends join_mine after server already auto-joined on connect
  if (existingMiner.ws === ws) {
    console.log(`[PoolManager] Same wallet/WS already registered, skipping duplicate join`);
    this.assignWork(walletAddress);  // Still give them fresh work
    return true;
  }
  
  // Only replace if it's a DIFFERENT WebSocket (e.g., browser refresh)
  console.log(`[PoolManager] Wallet already connected with DIFFERENT WS, replacing connection`);
  // ... rest of replacement logic
}
```

This allows:
- Duplicate `join_mine` from same WS → silently ignored, fresh work assigned
- New connection from different WS → old connection replaced (existing behavior)

---

## 📋 Previous Changes (v3.2.2)

### IP Connection Count Tracking Fix

**Problem**: IP connection count was accumulating incorrectly, eventually blocking legitimate users from reconnecting. After many reconnections, the IP count would reach 10 (the limit) and never go back down.

#### Root Cause Analysis

From logs:
```
[PoolManager] IP 212.15.87.88 exceeded connection limit
[PoolManager] ❌ IP limit check FAILED for BhjWTLy3
```

Two bugs caused this:

**Bug 1: Connection count not decremented on miner replacement**

When a miner reconnects (same wallet), the old connection is replaced:
```typescript
// OLD CODE (BROKEN)
if (this.state.miners.has(walletAddress)) {
  const existingMiner = this.state.miners.get(walletAddress)!;
  existingMiner.ws.close(1000, 'New connection from same wallet');
  this.state.miners.delete(walletAddress);  // Deleted BEFORE close event fires!
}
```

Problem: The miner entry is deleted before the WebSocket close event fires. When `handleDisconnect` is called, it can't find the miner and doesn't decrement the counter.

**Bug 2: handleJoinMine ignored handleConnect's return value**

When IP limit check failed, `handleConnect` returned `false`, but `handleJoinMine` didn't check it and still sent success responses/assigned work.

#### The Fix (`server/pool/manager.ts`)

Decrement connection count BEFORE deleting the miner entry:
```typescript
if (this.state.miners.has(walletAddress)) {
  const existingMiner = this.state.miners.get(walletAddress)!;
  
  // CRITICAL FIX: Decrement the IP connection count for the replaced miner
  const tracker = this.state.ipTrackers.get(existingMiner.ip);
  if (tracker && tracker.connectionCount > 0) {
    tracker.connectionCount--;
    console.log(`[PoolManager] Decremented connectionCount for replaced miner`);
  }
  
  existingMiner.ws.close(1000, 'New connection from same wallet');
  this.state.miners.delete(walletAddress);
}
```

#### The Fix (`server/index.ts`)

Check `handleConnect` return value and don't proceed on failure:
```typescript
const connectSuccess = poolManager.handleConnect(ws, {...}, clientInfo.ip);

if (!connectSuccess) {
  // Undo the MineRegistry add since they couldn't actually join
  registry.removeMiner(clientInfo.walletAddress!, 0);
  clientInfo.currentMineId = previousMineId;
  return;  // Don't send success, don't assign work
}

// Only proceed with success response/work assignment if connect succeeded
```

---

## 📋 Previous Changes (v3.2.1)

### Cache Control Headers

**Problem**: Users were seeing stale cached JavaScript that didn't understand new message types like `timeout_pending`. Even after server deployment, clients kept running old code.

#### The Fix (`next.config.ts`)

Added cache-control headers to force browsers to revalidate JS files:
```typescript
headers: async () => [
  {
    source: '/:path*.js',
    headers: [
      { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
    ],
  },
  {
    source: '/:path*',
    headers: [
      { key: 'X-App-Version', value: '3.2.1' },
    ],
  },
],
```

This ensures browsers always check for fresh code after deployments.

---

## 📋 Previous Changes (v3.2.0)

### Popup Visibility Fix - Don't Close Immediately

**Problem**: Winner popups (both `discovery_found` and `timeout_winner`) were being closed almost immediately (within microseconds) because a `round_restart` FALLBACK message was sent right after them.

#### The Bug
From logs:
```
01:59:00.571122704Z - timeout_winner broadcast
01:59:00.571172449Z - round_restart FALLBACK broadcast (50μs later!)
```

The client's `round_restart` handler closes all popups:
```typescript
if (event.type === 'round_restart') {
  setTimeoutPopup({ isOpen: false });  // CLOSES THE POPUP!
}
```

So the popup appeared for ~50 microseconds before being closed!

#### The Fix (`server/index.ts`)

Removed the immediate `round_restart` FALLBACK broadcasts from both:
1. `handleDiscoveryFound` - discovery_found no longer followed by immediate round_restart
2. `handleTimeoutWinnerEvent` - timeout_winner no longer followed by immediate round_restart

The `round_restart` will now only be sent by `PoolManager.startNewRound()` after the appropriate delay (5 seconds for timeout, or after discovery popup auto-closes).

#### Flow After Fix
1. `timeout_winner` broadcast → popup shows
2. [5 seconds for users to see it]
3. `round_restart` from startNewRound → popup closes, mining resumes

---

## 📋 Previous Changes (v3.1.9)

### Timeout Pending Flow (30-Second Countdown)

**Problem**: Timeout flow was missing the 30-second countdown phase that discovery flow has. The timeout winner popup appeared and disappeared after only a few seconds with no proper announcement.

#### Expected Flow (Discovery)
1. Solution found → `discovery_pending` shows 30s countdown overlay
2. 30 seconds later → `discovery_found` shows winner popup
3. Popup auto-closes after 5-8 seconds

#### Old Timeout Flow (BROKEN)
1. Timeout → `timeout_winner` immediately (no countdown!)
2. Client auto-closed popup after 5 seconds

#### New Timeout Flow (FIXED)
1. Timeout → `timeout_pending` shows 30s countdown overlay (same as discovery)
2. 30 seconds later → `timeout_winner` shows winner popup (or "no winner")
3. Popup auto-closes after 5 seconds
4. Mining resumes with new round

#### Server Changes (`server/pool/manager.ts`)

Split `handleTimeoutWinner` into two phases:
```typescript
// STEP 1: Broadcast timeout_pending (like discovery_pending)
this.broadcastMessage('timeout_pending', {
  mineId, mineName, resource,
  announceAt: Date.now() + 30000,
  countdownSeconds: 30,
  message: 'Round timed out! Winner being determined...',
  hasWinner: !!winner,
  participantCount,
});

// STEP 2: After 30s, announce winner
setTimeout(() => this.announceTimeoutWinner(...), 30000);
```

New `announceTimeoutWinner` method handles the actual winner broadcast.

#### Client Changes
- **`server/types.ts`**: Added `timeout_pending` message type
- **`app/hooks/useGameSocket.ts`**: Added handler for `timeout_pending`
- **`app/page.tsx`**: 
  - Added `timeout_pending` event handler (reuses `PendingDiscoveryOverlay` component)
  - Updated `timeout_winner` handler to clear overlay first
  - Uses `nextRoundIn` from server for popup close timing

---

## 📋 Previous Changes (v3.1.8)

### Timeout Handler Loop Fix

**Problem**: When a round timed out, the popup kept glitching and re-appearing on all devices, with 4 notifications showing in the activity feed. The timeout handler was firing repeatedly every second.

#### The Bug
```
1. checkRoundTimeout() fires → handleTimeoutWinner() called
2. handleTimeoutWinner() broadcasts and schedules startNewRound() after delay
3. 1 second later, checkRoundTimeout() fires AGAIN
4. roundStartTime hasn't been reset yet (happens in startNewRound)
5. Timeout condition STILL true → handleTimeoutWinner() called AGAIN
6. Repeats every second until startNewRound() finally runs!
```

#### The Fix (`server/pool/manager.ts`)

Added `handlingTimeout` flag to `PoolState` interface:
```typescript
export interface PoolState {
  // ... other fields
  /** Flag to prevent multiple timeout handlers from firing */
  handlingTimeout: boolean;
}
```

Modified `checkRoundTimeout()` to check the flag:
```typescript
private checkRoundTimeout(): void {
  // ... other checks
  
  // CRITICAL: Skip if already handling a timeout
  if (this.state.handlingTimeout) return;
  
  if (elapsed >= this.mineConfig.maxTimeMs) {
    // Set flag IMMEDIATELY to prevent re-entry
    this.state.handlingTimeout = true;
    this.handleTimeoutWinner();
  }
}
```

Reset flag in `startNewRound()`:
```typescript
private startNewRound(keepRollover: boolean): void {
  // ... reset other state
  
  // CRITICAL: Clear the timeout handling flag
  this.state.handlingTimeout = false;
}
```

---

## 📋 Previous Changes (v3.1.7)

### IP Rate Limiting Bug Fix

**Problem**: Users were being blocked with "IP exceeded connection limit" after a few reconnections. The `connectionCount` in the IP tracker was incremented on connect but **NEVER decremented on disconnect**, causing it to accumulate forever.

#### The Bug
```
1. User connects → connectionCount++ (now 1)
2. User disconnects → connectionCount stays 1 (BUG!)
3. User reconnects → connectionCount++ (now 2)
4. User disconnects → stays 2
5. User reconnects → connectionCount++ (now 3)
6. User reconnects → BLOCKED! (3 >= MAX_CONNECTIONS_PER_IP)
```

#### The Fix (`server/pool/manager.ts`)

Added connection count decrement in `handleDisconnect`:
```typescript
// CRITICAL: Decrement IP tracker connection count
const tracker = this.state.ipTrackers.get(miner.ip);
if (tracker && tracker.connectionCount > 0) {
  tracker.connectionCount--;
  console.log(`[PoolManager] IP ${miner.ip} connectionCount decremented to ${tracker.connectionCount}`);
}
```

#### Rate Limit Config Changes (`config/constants.ts`)

Increased limits to be more lenient while still preventing abuse:

| Setting | Old | New | Reason |
|---------|-----|-----|--------|
| `MAX_CONNECTIONS_PER_IP` | 3 | 10 | Handle reconnection spam, multiple devices |
| `MAX_IPS_PER_WALLET` | 3 | 5 | Allow household/office scenarios |

#### Why This Still Prevents Gaming

1. **Sybil Protection**: `MAX_IPS_PER_WALLET` limits wallets per IP
2. **Connection Spam**: 10 connections is still a reasonable limit
3. **Submission Rate Limiting**: `MAX_SUBMISSIONS_PER_MINUTE` prevents proof spam
4. **Work ID Validation**: Each miner gets unique work - more connections ≠ more mining power

---

## 📋 Previous Changes (v3.1.6)

### Auto-Restart Mining After Discovery/Timeout

**Problem**: After a discovery was found, mining didn't auto-restart on all devices. The client received `round_restart` but just waited for work that never came (because server's `state.miners` was empty).

#### The Fix (`app/page.tsx`)

Client now re-joins the mine in THREE scenarios to ensure mining restarts:

1. **discovery_found popup auto-close** (after 5-8 seconds):
```typescript
setTimeout(() => {
  setDiscoveryPopup(prev => ({ ...prev, isOpen: false }));
  if (isMiningRef.current && homeMineId) {
    joinMineRef.current(homeMineId);  // Safety net
  }
}, closeDelay);
```

2. **timeout_winner popup auto-close** (after 5-8 seconds):
   - Added missing auto-close timer
   - Calls `joinMineRef.current(homeMineId)` on close

3. **round_restart event** (immediately):
```typescript
if (isMiningRef.current && homeMineId) {
  setTimeout(() => {
    joinMineRef.current(homeMineId);
  }, 500);  // Small delay for server to process
}
```

#### Implementation Detail
Uses `joinMineRef` (instead of `gameSocket.joinMine` directly) to avoid circular dependency - `handleGameEvent` is defined before `gameSocket`.

---

## 📋 Previous Changes (v3.1.5)

### Critical Fix - Clients Not Sending join_mine

**Problem**: Server logs showed `Hashrate update from unknown miner` and `state.miners is empty`. Clients were authenticating but NOT sending `join_mine`, so miners were never registered with PoolManager.

#### Root Cause
On reconnection or page refresh:
1. `currentMineIdRef.current` could be null (React refs cleared on refresh)
2. The useEffect that joins `homeMineId` relies on timing/state that could be stale
3. Server received `connect` but no `join_mine` followed
4. Mining continued locally but server had no registered miners

#### Server-Side Fix (`server/index.ts`)
- `handleConnect` now **auto-joins** the restored home mine (or explicit mineId):
```typescript
const mineToJoin = payload.mineId || restoredHomeMine;
if (mineToJoin) {
  handleJoinMine(ws, { type: 'join_mine', mineId: mineToJoin }, clientInfo);
}
```
- This ensures miners are ALWAYS registered when they have a home mine

#### Client-Side Fix (`app/hooks/useGameSocket.ts`)
- When receiving `result` with `homeMineId`, immediately sends `join_mine`:
```typescript
if (data.payload?.homeMineId) {
  currentMineIdRef.current = data.payload.homeMineId;
  send('join_mine', { mineId: data.payload.homeMineId });
}
```
- Updates `currentMineIdRef` to track the mine for future reconnections

#### Diagnostic Logging Added
- Server logs all `JOIN_MINE` requests with wallet/mine/auth status
- Server logs PoolManager creation (NEW vs EXISTING)
- Server logs miner registration with PoolManager
- Client logs WebSocket open with full state
- Client logs all `joinMine` calls with previous mine ID

---

## 📋 Previous Changes (v3.1.4)

### Critical Race Condition Fix - Miners Disappearing from state.miners

This was the ROOT CAUSE of all broadcast failures - `state.miners` was being emptied due to a race condition!

#### The Bug
When a miner reconnects (same wallet), the following race occurred:
1. `handleConnect` finds existing entry, calls `existingMiner.ws.close()`
2. `handleConnect` deletes old entry and adds new entry to `state.miners`
3. Old WebSocket close event fires asynchronously
4. `handleClose` calls `poolManager.handleDisconnect(walletAddress)`
5. `handleDisconnect` deletes the miner entry - **but it deleted the NEW entry!**

This caused `state.miners` to be empty, which broke ALL broadcasts (discovery_pending, discovery_found, timeout_winner, round_restart, etc.).

#### The Fix
- **`server/pool/manager.ts`** - `handleDisconnect` now accepts optional `ws` parameter:
  - If WebSocket is provided, only disconnects if it matches the current entry
  - Stale disconnect events (from old connections) are ignored
  - Added log message: "Ignoring stale disconnect - WS mismatch (new connection active)"

- **`server/index.ts`** - `handleClose` passes the closing WebSocket:
  - `poolManager.handleDisconnect(walletAddress, ws)`
  - Prevents the race condition

---

## 📋 Previous Changes (v3.1.3)

### Timeout Winner Popup & Activity Feed Fix

Fixes issues where timeout winner popups weren't showing on PC and activity feed wasn't displaying timeout events.

#### RaidFeed Timeout Winner Support
- **`app/components/game/RaidFeed.tsx`**:
  - Added `timeout_winner` to `RaidEvent` type
  - Added timeout icon (⏰) to `EventIcon` component
  - Added `EventMessage` case for timeout events:
    - Shows mine name with resource color
    - Displays winner address (or "no qualified winner")
    - Shows finder share amount
    - Displays rollover amount with 🔄 icon

#### Timeout Winner Fallback Broadcast
- **`server/pool/manager.ts`**:
  - Added `TimeoutResult` interface
  - Added `onTimeoutWinner` callback to `PoolEventHandlers`
  - `handleTimeoutWinner` now calls the callback for fallback broadcast

- **`server/index.ts`**:
  - Added `handleTimeoutWinnerEvent` function:
    - Broadcasts `timeout_winner` via `broadcastToMine` (using clientConnections)
    - Broadcasts `round_restart` via `broadcastToMine`
    - Broadcasts `game_event` to other mines for global activity feed
  - Registered `onTimeoutWinner` callback when creating PoolManager

This ensures timeout winner events reach all clients even if the PoolManager's `state.miners` map is out of sync with `clientConnections`.

---

## 📋 Previous Changes (v3.1.2)

### Discovery Broadcast Critical Fix

Fixes critical bug where `discovery_pending` and `discovery_found` messages were not reaching clients despite the server accepting valid proofs. Mining was continuing indefinitely after a solution was found.

#### Root Cause
The PoolManager's `broadcastMessage` method was iterating over `this.state.miners`, but this map could become out of sync with the actual WebSocket connections stored in `clientConnections` in `index.ts`.

#### Diagnostic Logging Added
- **`server/pool/manager.ts`** - Enhanced `broadcastMessage`:
  - Logs miner count before broadcast
  - Warns if `state.miners` is empty
  - Tracks sent/failed/closed counts
  - Try-catch around each `ws.send()` to catch silent failures
  - Logs WebSocket readyState for each miner

- **`server/pool/manager.ts`** - Enhanced `handleDiscoveryFound`:
  - Detailed logging at each step of discovery flow
  - Logs all registered miners and their WebSocket states
  - Logs share calculation results
  - Logs broadcast completion status

- **`server/pool/manager.ts`** - Enhanced `handleSubmission`:
  - Checks if submitting miner is registered in `state.miners`
  - Warns if miner is NOT registered (helps diagnose sync issues)

#### Fallback Broadcast via clientConnections
- **`server/index.ts`** - Added fallback broadcasts using the authoritative `clientConnections` map:
  - After successful proof submission, broadcasts `discovery_pending` via `broadcastToMine`
  - In `handleDiscoveryFound` callback, broadcasts `discovery_found` and `round_restart` via `broadcastToMine`
  - These fallbacks ensure clients receive notifications even if PoolManager's state is out of sync

---

## 📋 Previous Changes (v3.1.1)

### Discovery Flow Bug Fixes

Fixes issues where discovery winners didn't auto-restart mining, popups weren't showing consistently, and activity feed was hidden during mining.

#### Activity Feed Always Visible
- **`app/page.tsx`** - Show both MiningStatus AND RaidFeed:
  - Changed from either/or to stacked layout
  - MiningStatus shows on top when mining with timeout
  - RaidFeed always visible (condensed to 4 items during mining)
  - **Fixes**: Activity feed now visible during mining

#### Discovery Popup Debug Logging
- **`app/page.tsx`** - Enhanced logging for discovery events:
  - Logs full event data when `discovery_found` received
  - Logs popup state changes and auto-close timing
  - Helps debug why popup might not show on some devices

#### Round Restart Broadcast
- **`server/pool/manager.ts`** - Added `round_restart` message:
  - Broadcast after discovery announcement before work assignment
  - Also broadcast from `startNewRound()` for timeout scenarios
  - Includes mine info, resource type, and rollover amount

- **`server/types.ts`** - Added `round_restart` message type

- **`app/hooks/useGameSocket.ts`** - Added handlers:
  - `round_status` - Processes timeout timer updates
  - `timeout_winner` - Handles timeout winner announcements
  - `round_restart` - Signals mining is resuming
  - All properly forwarded to `onEvent` callback

#### Client Round Restart Handler
- **`app/page.tsx`** - Handle `round_restart` event:
  - Closes any open discovery/timeout popups
  - Clears pending discovery overlay
  - Mining auto-continues when new work arrives

#### Round Status Update Fix
- **`app/page.tsx`** - Fixed round status updates:
  - Changed to update for `homeMineId` instead of `selectedMineId`
  - Ensures MiningStatus shows correct timer for current mine
  - Added `homeMineId` to callback dependencies

---

## 📋 Previous Changes (v3.1.0)

### Hybrid Timeout Mining System

This release introduces time-limited mining rounds with closest-hash fallback for Coal, Silver, and Oil mines. Gold mines remain unlimited for jackpot hunters. Features include progressive rollover jackpots, anti-manipulation safeguards, and real-time leaderboards.

#### Mine Timing Configuration
- **`config/constants.ts`** - Added timing configuration per resource type:
  - `MINE_TIMING` record defines `targetTimeMs`, `maxTimeMs`, and `hasTimeout` per resource
  - Coal: 3min target, 6min max (2x)
  - Silver: 5min target, 10min max (2x)
  - Oil: 8min target, 16min max (2x)
  - Gold: 15min target, NO timeout (pure mining)
  - `TIMEOUT_REWARDS` constants for reward splits:
    - Solution: 70% finder, 30% vault, 0% rollover
    - Timeout: 35% closest, 30% vault, 35% rollover
    - Finder bonus: 20% (solution) vs 10% (timeout)
  - Anti-manipulation: `MIN_SUBMISSIONS=10`, `MIN_TIME_PERCENT=50%`, `COOLDOWN_SECONDS=30`

#### Best Hash Tracking
- **`server/pool/manager.ts`** - Track closest hashes per miner:
  - New `MinerBestHash` interface: `hash`, `nonce`, `distance`, `submittedAt`, `submissionCount`, `firstSeenAt`
  - Added to `PoolState`: `bestHashes` map, `roundStartTime`, `rolloverAmount`
  - `calculateHashDistance()` computes bigint distance from target
  - `updateBestHash()` updates tracker if submission is better
  - Cooldown cap: In final 30s, improvements capped at 10%

#### Round Timeout Logic
- **`server/pool/manager.ts`** - Timeout checker and winner selection:
  - `timeoutInterval` runs every second (only for timed mines)
  - `checkRoundTimeout()` triggers `handleTimeoutWinner()` when `maxTime` exceeded
  - `findClosestHashWinner()` finds miner with lowest distance who qualifies
  - `isQualifiedForClosest()` checks: 10+ submissions, 50%+ round time
  - `handleTimeoutWinner()` calculates 35/30/35 split, broadcasts winner
  - `startNewRound()` resets state, carries over rollover, assigns new work
  - `getRoundStatus()` returns leaderboard data for UI

#### Timeout Reward Distribution
- **`server/game/reward-orchestrator.ts`** - New timeout handling:
  - `handleTimeoutDiscovery()` function for timeout-based rewards
  - 35% to closest hash winner (+ shares), 30% to vault, 35% rollover
  - If no qualified winner, 70% rolls over (vault still gets 30%)
  - Uses reduced finder bonus (10% vs 20% for solution)
  - Integrates with existing share-based distribution system

#### WebSocket Message Types
- **`server/types.ts`** - Added 4 new message types:
  - `round_status` - Periodic (5s) update with time remaining, leaderboard
  - `best_hash_update` - Notify miner their best hash improved
  - `timeout_winner` - Round ended by timeout, closest hash won
  - `rollover_update` - Rollover jackpot amount changed

- **`server/index.ts`** - Round status broadcasting:
  - New interval broadcasts `round_status` every 5 seconds to active mines
  - Contains `roundStartTime`, `maxTime`, `timeRemaining`, `rolloverAmount`, `leaderboard`

#### Mining Status UI Component
- **`app/components/game/MiningStatus.tsx`** - New component showing:
  - Time remaining progress bar (color changes when < 1min)
  - Current pot + rollover jackpot amount
  - Top 5 closest hash leaderboard with rank, wallet, submissions
  - Your current rank and submission count
  - Resource-specific styling (coal/gold/oil/silver)
  - Explanatory footer about timeout vs solution rewards

#### Timeout Popup Component
- **`app/components/game/TimeoutPopup.tsx`** - Timeout announcement:
  - Shows winner (closest hash) or "No qualified miners"
  - Displays reduced reward (35%) with comparison to 70%
  - Shows rollover amount going to next round
  - Countdown timer to next round start
  - Auto-closes when countdown reaches 0
  - Winner celebration for timeout winner

#### Page Integration
- **`app/page.tsx`** - Round state management:
  - Added `roundStatus` state for tracking timeout info
  - Added `timeoutPopup` state for timeout announcements
  - `handleGameEvent` handles `round_status` and `timeout_winner`
  - `MiningStatus` replaces `RaidFeed` during active mining with timeout
  - `TimeoutPopup` component rendered alongside discovery popup

#### Component Exports
- **`app/components/game/index.ts`** - Added exports:
  - `MiningStatus` component
  - `TimeoutPopup` component

---

## 📋 Previous Changes (v3.0.1)

### Mining Continuation and Rate Limiting Fixes

This release fixes issues where discovery winners didn't receive new work, rate limiting blocked essential messages, and work wasn't assigned on mine join.

#### Expanded Rate Limit Exemptions
- **`server/index.ts`** - More essential messages exempt from rate limiting:
  - `hashrate` - high frequency, expected (3 workers = 180/min)
  - `stats` - read-only informational queries
  - `join_mine` - essential for getting work after reconnection
  - `leave_mine` - cleanup, no abuse potential
  - `connect` - authentication, essential for session
  - `set_home` - user preference, low frequency
  - `request_work` - essential for mining continuation
  - **Fixes**: No more rate limit errors blocking reconnection or mining start

#### Request Work Handler
- **`server/index.ts`** - New `handleRequestWork()` function:
  - Allows clients to explicitly request work from server
  - Used after reconnection or if `discovery_found` was missed
  - Gets mine-specific target and assigns work immediately
  
- **`server/middleware/validate.ts`** - Added `RequestWorkSchema`:
  - Simple schema with just `type: 'request_work'`
  - Added to `WSMessageSchema` discriminated union

- **`server/types.ts`** - Added `request_work` to `WSMessageType`

#### Work Always Assigned on Join
- **`server/index.ts`** - `handleJoinMine()` now assigns work immediately:
  - After successful join, calls `poolManager.assignWork()`
  - Uses mine-specific difficulty target
  - **Fixes**: No more "waiting for work" after starting to mine

#### Increased Worker Stop Delay
- **`app/hooks/useMining.ts`** - More robust work switching:
  - Increased delay from 10ms to 50ms for workers to process stop
  - Added solution check during delay to prevent race conditions
  - If solution found during switch, aborts new work distribution
  - **Fixes**: No duplicate hashrate reports after work switch

#### Reconnect Requests Work
- **`app/hooks/useGameSocket.ts`** - Mining state awareness:
  - Added `isMining` prop and `isMiningRef` to track mining state
  - On WebSocket reconnect, if was mining, sends `request_work` after rejoin
  - Ensures mining continues after connection issues

- **`app/page.tsx`** - Passes `isMining` to useGameSocket:
  - Keeps hook informed of current mining state

---

## 📋 Previous Changes (v3.0.0)

### Mining Flow Overhaul

This release fixes critical issues with work validation, auto-continuation of mining after discoveries, and home mine persistence. These changes ensure a seamless, continuous mining experience.

#### Work ID Grace Period (60 seconds)
- **`server/pool/work.ts`** - Added grace period for late submissions:
  - New `GracePeriodWork` interface tracks invalidated work with wallet + timestamp
  - `previousWork` map added to `WorkTracker` to hold recently invalidated work
  - `validateWork()` now checks `previousWork` if not found in `activeWork`
  - Work valid for 60 seconds after invalidation (e.g., after difficulty change)
  - `invalidateWork()` moves work to `previousWork` instead of deleting
  - `startNewDiscovery()` moves all active work to grace period
  - `cleanupExpiredWork()` also cleans up old grace period entries
  - **Fixes**: Valid proofs no longer rejected due to difficulty updates

#### Auto-Continue Mining After Discovery
- **`app/page.tsx`** - Seamless mining continuation:
  - `discovery_pending` now calls `pauseMining()` instead of `stopMining()`
  - `isMining` state preserved during discovery countdown
  - When new work arrives after `discovery_found`, mining auto-resumes
  - Discovery popup auto-closes (8s for winners, 5s for others)
  - Removed manual "Continue Mining" button requirement
  - **Fixes**: UI "Stop Mining" now accurately reflects worker state

- **`app/hooks/useMining.ts`** - Immediate worker stop on new work:
  - `startMining()` now calls `stopAllWorkers()` before distributing new work
  - 10ms delay added to ensure workers process stop command
  - Prevents old work submissions after new work arrives
  - `solutionFoundRef` reset before distributing new work

#### Home Mine Persistence (Client + Redis)
- **`app/hooks/useGameSocket.ts`** - Server home mine restoration:
  - Added `onHomeMineRestored` callback option
  - `result` message handler extracts `homeMineId` from connect response
  - Calls callback to update client state when home mine restored

- **`app/page.tsx`** - localStorage backup + server sync:
  - `homeMineId` initial state checks localStorage fallback
  - `handleHomeMineRestored()` callback saves to state and localStorage
  - `handleSetHome()` persists to both localStorage and server
  - Three-tier persistence: localStorage → Redis → localStorage (backup)
  - **Fixes**: Home mine persists across page refresh and reconnection

---

## 📋 Previous Changes (v2.9.9)

### Multi-User Mining Sync and Persistence

This release fixes difficulty scaling after discoveries, adds real-time miner join/leave broadcasts, and persists home mine selection in Redis.

#### Difficulty Recalculation After Discovery
- **`server/pool/manager.ts`** - Fixed difficulty not scaling after discoveries:
  - `announceDiscovery()` now calls `MineRegistry.recalculateMineDifficulty()` BEFORE assigning new work
  - Updates local `difficultyState.target` to match mine-specific target
  - Passes updated target to `assignWork()` for all miners
  - Prevents back-to-back fast discoveries with same easy target
  - Ensures difficulty scales with network hashrate in real-time

#### Miner Join/Leave Broadcasts
- **`server/index.ts`** - Real-time miner presence updates:
  - Added `broadcastToMine(mineId, type, payload)` helper function
  - `handleJoinMine()` broadcasts `miner_joined` to all miners at the mine
  - `handleClose()` broadcasts `miner_left` when miners disconnect
  - Payload includes `minerCount`, `totalHashrate`, `walletPrefix`
  - Miners see other miners immediately without refresh

- **`server/types.ts`** - Added new message types:
  - `miner_joined` - Broadcast when miner joins a mine
  - `miner_left` - Broadcast when miner leaves/disconnects

#### Home Mine Persistence in Redis
- **`server/storage/redis-store.ts`** - User preference storage:
  - Added `USER_HOME_MINE_KEY` for wallet-specific home mine
  - `setUserHomeMine(wallet, mineId)` - Persist home mine selection
  - `getUserHomeMine(wallet)` - Retrieve stored home mine
  - `clearUserHomeMine(wallet)` - Remove preference
  - Key pattern: `blackgold:user:{walletAddress}:home_mine`

- **`server/game/stake-manager.ts`** - Integrated Redis persistence:
  - `setHomeBase()` now persists to Redis asynchronously
  - Added `restoreHomeMine(wallet)` async method for session recovery
  - Home mine restored when miner reconnects

- **`server/index.ts`** - Session recovery on connect:
  - `handleConnect()` now async to await Redis lookup
  - Calls `stakeManager.restoreHomeMine()` on connect
  - Returns `homeMineId` in welcome response if found
  - Client can auto-join restored home mine

---

## 📋 Previous Changes (v2.9.8)

### Mining Fairness Overhaul

This release implements share-based pool mining for fair reward distribution, fixes the core selector flow, and increases difficulty for realistic mining times.

#### Share-Based Pool System (Fair Mining)
- **`server/pool/manager.ts`** - New contribution tracking and share calculation:
  - Track `hashSeconds` per miner (hashrate × time_mining)
  - On discovery: calculate shares proportional to contribution
  - Finder gets 20% bonus on top of their proportional share
  - All active miners receive rewards, not just the finder
  - Prevents high-end CPUs from monopolizing all rewards
  - `MinerContribution` interface tracks `hashSeconds` and `lastUpdate`
  - `calculateShares()` computes fair distribution percentages

#### Increased Difficulty (5x)
- **`config/constants.ts`** - Difficulty calibration for 8-20 minute solve times:
  - `MIN_DIFFICULTY`: 1,500,000 → **7,500,000** (5x increase)
  - `MAX_DIFFICULTY`: 500,000,000 → **2,000,000,000** (4x increase)
  - `BASELINE_HASHRATE`: 5,000 → **25,000** H/s
  - `NONCE_RANGE_SIZE`: 10,000,000 → **50,000,000** (5x larger)
  - `WORK_EXPIRY_MS`: 300,000 → **600,000** (10 minutes)
  - Mining now takes realistic 5-20 minutes per mine based on resource type

#### Core Selector Flow Fix
- **`app/page.tsx`** - Fixed mining start sequence:
  - `handleStartMining()` now shows core selector popup first
  - Mining only starts after user confirms core count
  - Removed race condition where mining started before cores were set
  - Workers initialized lazily on actual mining start

- **`app/hooks/useMining.ts`** - Lazy worker initialization:
  - Workers no longer auto-initialize on component mount
  - `startMining()` checks if workers need initialization
  - Uses `setTimeout` to wait for workers to be ready before distributing work
  - Fixes "mining doesn't start on first click" bug

#### Activity Feed Filtering
- **`app/page.tsx`** - Cleaner activity feed:
  - Filter out `discovery_pending` events from `raidEvents`
  - Only show actual discoveries (seam, nugget, gusher, lode)
  - Prevents duplicate/repeat notifications for miners
  - `discovery_pending` only shown in countdown overlay, not feed

#### Duplicate Broadcast Fix
- **`server/index.ts`** - Removed duplicate `discovery_found` broadcasts:
  - Added `broadcastToAllExceptMine()` function
  - Global `game_event` broadcast excludes miners at the winning mine
  - Miners at the mine receive event via `PoolManager` only
  - Prevents "Seam found" appearing multiple times in feed

---

## 📋 Previous Changes (v2.9.7)

### Mining Experience Improvements

This release improves the mining experience with dynamic difficulty, Redis persistence, and a 30-second announcement delay.

#### Rate Limiting Exemption
- **`server/index.ts`** - Exempt high-frequency messages from rate limiting:
  - `hashrate` messages no longer count toward rate limit (sent every second per worker)
  - `stats` and `join_mine` messages also exempt
  - Prevents rate limit errors with multi-core mining (3 workers = 180 messages/min)
  - Only rate limits: `submit`, `stake`, `unstake`, `start_expedition`

#### Dynamic Difficulty Adjustment
- **`server/index.ts`** - Added real-time difficulty scaling:
  - Tracks `lastMineHashrates` and `lastDifficultyRecalc` per mine
  - Recalculates difficulty when hashrate changes by ≥20%
  - Minimum 10 seconds between recalculations (`DIFFICULTY_RECALC_INTERVAL_MS`)
  - Broadcasts `difficulty_update` event to all miners when target changes
  - `broadcastDifficultyUpdate()` function sends new target and assigns fresh work

#### Redis Persistence Layer (New)
- **`server/storage/redis-store.ts`** - New file for persistent storage:
  - `StoredDiscovery` - Discovery records with mine, finder, rewards, hash
  - `StoredActivity` - Activity feed events (discoveries, raids, stakes)
  - `StoredMineStats` - Per-mine statistics (totalDiscoveries, peakHashrate)
  - Gracefully degrades if Redis unavailable
  - Key structure: `blackgold:mine:{mineId}:discoveries`, `blackgold:activity:global`

- **`server/storage/index.ts`** - Storage module barrel exports

- **`server/index.ts`** - Integrated Redis storage:
  - Calls `initRedisStore()` on startup
  - Stores discoveries and activities in Redis on announcement
  - Added `handleGetActivity()` handler for `get_activity` message
  - New message types: `get_activity`, `activity_feed`, `discovery_pending`

- **`server/middleware/validate.ts`** - Added validation schemas:
  - `StatsRequestSchema` - For `stats` messages
  - `GetActivitySchema` - For `get_activity` messages

#### 30-Second Announcement Delay
- **`server/pool/manager.ts`** - Suspense countdown before revealing winner:
  - New `PendingDiscovery` interface for storing pending discoveries
  - `isMiningPaused()` - Check if mine is in countdown
  - `getAnnouncementCountdown()` - Time remaining until announcement
  - On valid proof:
    1. Broadcasts `discovery_pending` event (no winner revealed)
    2. Pauses mining at that mine for 30 seconds
    3. After countdown, broadcasts `discovery_found` with winner
  - `forceAnnounce()` - Force-announce on pool shutdown
  - Mining submissions return "paused" message during countdown

- **`server/index.ts`** - Updated submit handler:
  - Checks `poolManager.isMiningPaused()` before accepting proofs
  - Returns countdown remaining if mining is paused

#### Message Type Updates
- **`server/index.ts`** - Added new message types:
  - `discovery_pending` - Sent when discovery found (before winner reveal)
  - `get_activity` - Client request for activity feed
  - `activity_feed` - Server response with stored activities

---

## 📋 Previous Changes (v2.9.6)

### Mining System Overhaul

This release completely fixes the mining system with proper difficulty calibration and worker management.

#### Inline Blob Workers (Turbopack Fix)
- **`app/hooks/useMining.ts`** - Complete rewrite with inline blob workers:
  - Worker code embedded as a string constant `MINER_WORKER_CODE`
  - Creates workers from Blob URLs - works with any bundler
  - Eliminates `importScripts` errors from Turbopack chunk splitting
  - Properly cleans up Blob URLs on worker termination
  - Added `solutionFoundRef` to coordinate workers

#### Worker Coordination
- **`app/hooks/useMining.ts`** - Fixed multiple solution submissions:
  - When any worker finds a solution, immediately stops ALL workers
  - `solutionFoundRef` flag prevents duplicate submissions
  - Only the first valid solution is submitted to server
  - Other workers stopped via `postMessage({ type: 'stop' })`
  - Prevents "Invalid or expired work unit" errors

#### Proper Difficulty Calibration
- **`config/constants.ts`** - Completely recalibrated difficulty:
  - `MIN_DIFFICULTY`: 256 → **7,500,000** (for 5-minute Coal mines, updated v2.9.8)
  - `MAX_DIFFICULTY`: 1,000,000 → **2,000,000,000** (for scaling, updated v2.9.8)
  - Added `BASELINE_HASHRATE`: 25,000 H/s (mid-range estimate, updated v2.9.8)
  - `NONCE_RANGE_SIZE`: 1,000,000 → 50,000,000 (longer ranges, updated v2.9.8)
  - `WORK_EXPIRY_MS`: 60,000 → 600,000 (10 minutes, updated v2.9.8)
  
  **Difficulty by Resource (at 25,000 H/s baseline):**
  | Resource | Target Time | Base Difficulty |
  |----------|-------------|-----------------|
  | Coal     | 5 minutes   | ~7,500,000      |
  | Silver   | 8 minutes   | ~12,000,000     |
  | Oil      | 10 minutes  | ~15,000,000     |
  | Gold     | 20 minutes  | ~30,000,000     |

#### Per-Mine Difficulty System
- **`server/pool/difficulty.ts`** - New per-mine difficulty functions:
  - `createDifficultyStateForMine(targetTimeMs)` - Initialize with mine's target time
  - `calculateBaseDifficulty(targetTimeMs)` - Base difficulty for single miner
  - `calculateScaledDifficulty(targetTimeMs, networkHashrate)` - Scale with miners
  - `recalculateDifficultyFromHashrate(state)` - Dynamic adjustment
  - `getDifficultyInfo(state)` - Human-readable stats

- **`server/game/mine-registry.ts`** - Per-mine difficulty tracking:
  - Added `mineDifficultyStates` Map for per-mine difficulty states
  - `createMineState()` now uses mine's `baseDiscoveryTimeMs`
  - `getMineDifficultyState()` / `setMineDifficultyState()` accessors
  - `recalculateMineDifficulty()` - Update on hashrate changes
  - `getMineTarget()` / `getMineTargetTime()` - Access mine difficulty

- **`server/pool/manager.ts`** - Mine-aware pool manager:
  - Constructor accepts optional `mineId` parameter
  - Uses mine-specific difficulty when creating initial state
  - `assignWork()` accepts optional `mineId` and `mineTarget` params
  - Logs mine-specific difficulty info

- **`server/index.ts`** - Updated pool manager creation:
  - Passes mine ID when creating per-mine pool managers
  - Each mine now has properly calibrated difficulty

---

## 📋 Previous Changes (v2.9.5)

### Critical Mining Fixes

#### Work ID Validation Fix
- **`server/middleware/validate.ts`** - Fixed work ID schema mismatch:
  - Changed `WorkIdSchema` from `z.string().uuid()` to `z.string().regex(/^[a-f0-9]{32}$/)`
  - Server generates 32-char hex IDs, validation now matches

#### Worker Stability Improvements  
- **`app/hooks/useMining.ts`** - Fixed multiple re-initialization bug:
  - Added `isInitializedRef` and `isInitializingRef` guards
  - Used refs for callbacks (`onHashrateRef`, `onSolutionRef`) to prevent dependency cycles
  - Added `coresRef` to track core count changes
  - Reduced console noise (only 10% of hashrate updates logged)

#### Pure JavaScript Worker
- **`app/workers/miner.worker.js`** - New file replacing TypeScript worker:
  - Pure JavaScript, no TypeScript syntax
  - No external imports - completely self-contained
  - Fixes `importScripts` errors in production builds
- **`app/workers/miner.worker.ts`** - Deleted (replaced by JS version)

#### Home Mine Enforcement
- **`app/page.tsx`** - Enforced home mine selection before mining:
  - Added check for `homeMineId` in `handleStartMining`
  - Shows alert if user tries to mine without setting home base
  - Mining button disabled on non-home mines

#### Initial Difficulty Fix
- **`config/constants.ts`** - Previous MIN_DIFFICULTY changes (now superseded by v2.9.6)

#### Next.js Configuration
- **`next.config.ts`** - Added webpack fallback for crypto

---

## 📋 Previous Changes (v2.9.4)

### WebSocket Message Validation Fix
- **`server/index.ts`** - Fixed message parsing:
  - Updated `parseMessage()` to handle `{ type, payload, timestamp }` format
  - Removed strict validation that rejected valid messages
  - Added better error logging for debugging

- **`server/middleware/validate.ts`** - Schema fixes:
  - Changed `'submit_proof'` to `'submit'` to match client
  - Added optional `walletAddress` to hashrate schema
  - Made `signature` optional on stake/unstake for devnet testing
  - Added `TODO [MAINNET]` comments for fields to re-enable

---

## 📋 Previous Changes (v2.9.3)

### Mining Flow Fixes
- **`app/hooks/useMining.ts`** - Comprehensive mining worker improvements:
  - Added detailed logging throughout worker lifecycle
  - Fixed hashrate aggregation (per-worker tracking with Map)
  - Added `workersReady` and `workersCount` state for UI feedback
  - Improved worker initialization with retry logic
  - Better error handling for worker creation failures
  - Added browser environment check for SSR safety

### Core Selector Component (New File)
- **`app/components/CoreSelector.tsx`** - Mining settings modal:
  - Slider to select 1 to max available CPU cores
  - Quick select buttons (1 Core, Half, Max)
  - Estimated hashrate display based on core count
  - Performance impact descriptions
  - Warning for max cores usage
  - Responsive design with proper modal positioning

### Page Updates
- **`app/page.tsx`** - Mining integration improvements:
  - Added core selector modal before mining starts
  - Added WebSocket status indicator (Online/Connecting/Offline)
  - Improved mining status display (Starting... vs hashrate)
  - Shows worker count during mining
  - Better logging throughout mining flow
  - Stores selected core count in state

---

## 📋 Previous Changes (v2.9.2)

### Railway WebSocket Fix
- **`server/index.ts`** - Fixed WebSocket for Railway proxy:
  - Attached WebSocket server to HTTP server (required for Railway)
  - Added `/health` endpoint for health checks
  - Returns proper `426 Upgrade Required` for non-WS requests
  - Browser WebSocket connections now work through Railway's edge proxy

### Previous Changes (v2.9.1)

#### Devnet Testing Mode
- **`app/api/verify-holder/route.ts`** - Added devnet bypass for testing:
  - `IS_DEVNET` flag detects `SOLANA_NETWORK=devnet`
  - `DEVNET_CONFIG.BYPASS_HOLDER_CHECK` skips holder requirements
  - `DEVNET_CONFIG.SIMULATED_MARKET_CAP` returns $5K (Genesis tier)
  - Fallback handlers ensure testing works without Helius/Jupiter
  - All devnet blocks marked with `TODO [MAINNET]: Remove for production`

### Build Fixes
- **`tsconfig.json`** - Added `scripts/` to exclude (fixes Vercel build)
- **`server/game/index.ts`** - Removed deleted `UnstakeRequest` export, added BetEscrow exports
- **`.gitignore`** - Enhanced security entries (keypairs, wallets, secrets)

### Previous Changes (v2.9)

#### Quarry Staking Infrastructure
- **`scripts/deploy-quarry.ts`** - Deploy script for Quarry Protocol:
  - Creates IOU-COAL token + MintWrapper
  - Deploys Rewarder for reward distribution
  - Creates Quarry for COAL staking
  - Configures Minter for reward minting
  - Outputs env vars for Railway/Vercel

### Bet Escrow System (New File)
- **`server/game/bet-escrow.ts`** - Raid bet management separate from staking:
  - `BetEscrowManager` class for raid bets
  - Bets locked during active raids
  - Resolution: 90% burned, 10% to defenders
  - Tracks bets by wallet, by raid

### Stake Manager Updates
- **`server/game/stake-manager.ts`** - Simplified for Quarry integration:
  - Removed unstake queue (Quarry allows instant unstake)
  - Added BetEscrow integration
  - Added `isQuarryEnabled()` check
  - Added `getLockedBetAmount()` from BetEscrow

### Staking Service Updates
- **`server/solana/staking.ts`** - Quarry SDK integration:
  - `buildStakeTransaction()` - Build stake tx for user signing
  - `buildUnstakeTransaction()` - Build unstake tx
  - `buildClaimRewardsTransaction()` - Claim IOU-COAL
  - `buildRedeemTransaction()` - Exchange IOU → real COAL
  - `getUserStakeInfo()` - Query on-chain stake

### Documentation Updates
- **`docs/GAME_MECHANICS.md`** - v2.8:
  - Updated Staking System section with Quarry architecture
  - Added Bet Escrow System documentation
  - Updated Attack Vectors & Mitigations

### Previous Changes (v2.8)
- WebSocket Mining Integration
- `useGameSocket` and `useMining` hooks integration
- Mining flow with work units and proof submission

### Previous Changes (v2.7)
- Devnet Testing Infrastructure: Alpha test token
- Holder Verification: Network-aware Helius API
- Documentation: GAME_MECHANICS.md and ECONOMICS.md

---

## ⚠️ TODO: Review Before Launch

> **These values need review - numbers may be too low for mainnet launch**

### 1. Reward Distribution Numbers
- [ ] **Base reward per discovery**: Currently 100 COAL - may need 500-1000+
- [ ] **Resource multipliers**: Coal 1.0x, Silver 1.2x, Oil 1.3x, Gold 1.5x
- [ ] **Finder/Vault split**: Currently 70/30 - consider 60/40 or 80/20?
- [ ] **File**: `server/game/reward-orchestrator.ts` lines 47-56

### 2. Holder Requirement Tiers
- [ ] **Dynamic scaling logic**: Currently % of supply based on market cap
- [ ] **Consider**: Fixed token amounts OR higher percentages at launch
- [ ] **Genesis tier**: 0.5% at <$10K MC - is this too low/high?
- [ ] **File**: `config/holder-tiers.ts`

### 3. Staking Tiers
- [ ] **Tier thresholds**: [0, 100, 500, 1000, 5000] COAL - too low?
- [ ] **Consider**: [0, 1000, 5000, 10000, 50000] for mainnet
- [ ] **Multipliers**: 1.0x to 3.0x hashrate boost - balanced?
- [ ] **File**: `server/game/types.ts` lines 23-29

### 4. Syndicate Creation Cost
- [ ] **Current cost**: 1,000 COAL (burned)
- [ ] **Consider**: 5,000-10,000 COAL for more exclusivity
- [ ] **File**: `server/game/types.ts` line 208

### 5. Mine Count & Distribution
- [ ] **Current**: 20 mines (5 per resource type)
- [ ] **Consider**: More/fewer mines for player distribution
- [ ] **File**: `config/mines.ts`

### 6. Discovery Times
- [ ] **Coal**: 5 min, **Silver**: 8 min, **Oil**: 10 min, **Gold**: 20 min
- [ ] **Consider**: Longer times for higher rewards, or shorter for engagement
- [ ] **File**: `config/mines.ts` lines 52-89

---

## Table of Contents

1. [Project Structure](#project-structure)
2. [Frontend (app/)](#frontend-app)
3. [Server (server/)](#server-server)
4. [Game System (server/game/)](#game-system-servergame)
5. [Configuration (config/)](#configuration-config)
6. [Scripts (scripts/)](#scripts-scripts)
7. [Mine Locations](#mine-locations)
8. [Game Mechanics](#game-mechanics)
9. [Data Flow Diagrams](#data-flow-diagrams)

---

## Project Structure

```
black-gold/
├── app/                          # Next.js 14 frontend
│   ├── api/                      # API routes
│   │   ├── auth/                 # Authentication routes
│   │   │   ├── nonce/            # Signature nonce generation
│   │   │   └── verify/           # Signature verification
│   │   └── verify-holder/        # Holder verification endpoint
│   ├── components/               # React UI components
│   │   ├── game/                 # Game-specific components
│   │   └── globe/                # 3D globe components
│   ├── hooks/                    # Custom React hooks
│   ├── lib/                      # Utility libraries
│   ├── providers/                # React context providers
│   │   └── PrivyProvider.tsx     # Wallet authentication
│   ├── workers/                  # Web Workers for mining
│   ├── layout.tsx                # Root layout (with PrivyProvider)
│   ├── page.tsx                  # Main game page
│   └── globals.css               # Global styles
├── server/                       # Node.js backend
│   ├── auth/                     # Wallet authentication (v2.3)
│   │   └── verify-wallet.ts      # Solana signature verification
│   ├── game/                     # Game system (v2)
│   ├── middleware/               # Security middleware (v2.2)
│   │   ├── validate.ts           # Zod message validation
│   │   └── rateLimit.ts          # Per-IP rate limiting
│   ├── pool/                     # Mining pool logic
│   ├── solana/                   # Blockchain integration
│   ├── storage/                  # Persistence layer (v2.9.7)
│   │   ├── redis-store.ts        # Redis persistence for activity/discoveries
│   │   └── index.ts              # Storage module exports
│   ├── verification/             # Security & proof validation
│   ├── index.ts                  # Server entry point
│   └── types.ts                  # Shared type definitions
├── config/                       # Configuration files
│   └── mines.ts                  # 20 mine definitions
├── scripts/                      # Standalone scripts
├── docs/                         # Documentation
└── public/                       # Static assets
    └── geo/                      # Geographic data
        ├── world-110m.json       # TopoJSON world borders
        └── continents.json       # Fallback continent outlines
```

---

## Frontend (app/)

### Core Files

| File | Lines | Purpose |
|------|-------|---------|
| `layout.tsx` | ~50 | Root layout with Google Fonts (Bebas Neue, Oswald, JetBrains Mono) |
| `page.tsx` | ~350 | Main game page with 3D globe, mine panels, and raid feed |
| `globals.css` | ~450 | Coal theme CSS, game-specific styles, animations |

### Globe Components (`app/components/globe/`)

| File | Lines | Exports | Purpose |
|------|-------|---------|---------|
| `Globe.tsx` | ~350 | `Globe` (default) | 3D interactive globe with TopoJSON continent outlines, ember glow effects, and mine pins |
| `index.ts` | ~5 | Re-export | Barrel export |

**Globe Features (v2.6):**
- Uses TopoJSON (`world-110m.json`) for accurate country borders
- Multi-layered ember-colored continent edges (outer glow → core → hot highlight)
- Falls back to `continents.json` if TopoJSON fails
- Dark ocean background with subtle grid lines
- **Resource-specific 3D mine pins**: Coal (cubes with ember glow), Gold (faceted icosahedron with shimmer), Oil (smooth spheres with blue sheen), Silver (polished metallic icosahedron)
- Resource legend with unique CSS styling per resource type

### Game Components (`app/components/game/`)

| File | Lines | Exports | Purpose |
|------|-------|---------|---------|
| `HomeBase.tsx` | ~200 | `HomeBase` (default) | Home mine dashboard with mining controls and stats |
| `MineDetails.tsx` | ~180 | `MineDetails` (default) | Selected mine info panel with actions |
| `StakingPanel.tsx` | ~220 | `StakingPanel` (default) | Stake/unstake modal with tier preview |
| `ExpeditionPanel.tsx` | ~200 | `ExpeditionPanel` (default) | Raid planning with power comparison and betting |
| `RaidFeed.tsx` | ~150 | `RaidFeed` (default) | Live activity feed for raids and discoveries |
| `SyndicatePanel.tsx` | ~300 | `SyndicatePanel` (default) | Syndicate management, creation, and member list |
| `SyndicateRaid.tsx` | ~250 | `SyndicateRaid` (default) | Coordinated syndicate raid planning and status |
| `index.ts` | ~15 | All components | Barrel export |

### Legacy Components (`app/components/`)

| File | Lines | Exports | Purpose |
|------|-------|---------|---------|
| `WalletEntry.tsx` | ~470 | `WalletEntry`, `WalletEntryState` | Dual-mode wallet entry with holder verification state (v2.7: added tokenBalance, isEligible, verificationLoading) |
| `MiningPanel.tsx` | ~180 | `MiningPanel` | Mining controls (v1 style) |
| `StatsCard.tsx` | ~110 | `StatsCard` | Network statistics display |
| `DiscoveryFeed.tsx` | ~120 | `DiscoveryFeed` | Live resource discovery feed (Coal Veins, Gold Nuggets, etc.) |
| `HolderGate.tsx` | ~140 | `HolderGate` | Holder verification status |
| `EmberParticles.tsx` | ~70 | `EmberParticles` | Animated ember particle background |
| `CoreSelector.tsx` | ~140 | `CoreSelector` | Mining core selection modal - lets users choose CPU cores |

### Providers (`app/providers/`)

| File | Lines | Exports | Purpose |
|------|-------|---------|---------|
| `WalletProvider.tsx` | ~250 | `WalletProvider`, `useWalletContext` | SSR-safe wallet context with Privy hooks bridge |
| `PrivyProvider.tsx` | ~82 | `PrivyProvider` | Privy wallet auth wrapper (dynamic import, client-only) |
| `index.ts` | ~8 | Re-exports | Barrel export |

**Provider Order (in layout.tsx):**
```
PrivyProvider        ← Outer: Provides Privy context
  └─ WalletProvider  ← Inner: Uses Privy hooks, exposes wallet state
       └─ App        ← Can use useWallet() anywhere
```

**SSR-Safe Wallet Architecture (v2.6):**
- `PrivyProvider` wraps `WalletProvider` (order matters!)
- `WalletProvider` uses a dynamic `PrivyHooksBridge` component to safely call Privy hooks
- Privy hooks are imported dynamically inside the bridge component after client mount
- `useWallet` hook consumes WalletContext, never calls Privy hooks directly
- Prevents "connectors is null" and SSR build errors
- Connect button triggers Privy login modal when clicked

### Hooks (`app/hooks/`)

| File | Lines | Exports | Purpose |
|------|-------|---------|---------|
| `useGameSocket.ts` | ~250 | `useGameSocket` | v2 WebSocket hook for multi-mine game server |
| `useWebSocket.ts` | ~150 | `useWebSocket` | v1 WebSocket connection |
| `useMining.ts` | ~130 | `useMining` | Mining state management, Web Workers |
| `useWallet.ts` | ~60 | `useWallet`, `usePrivyConfigured` | SSR-safe wallet state via WalletContext |
| `useStaking.ts` | ~140 | `useStaking` | On-chain staking hook with Quarry integration |
| `useHolderVerification.ts` | ~80 | `useHolderVerification` | Holder verification API hook |
| `index.ts` | ~12 | Re-exports | Barrel export for all hooks |

### Libraries (`app/lib/`)

| File | Lines | Exports | Purpose |
|------|-------|---------|---------|
| `mines.ts` | ~160 | `MINES`, `getMineById`, `RESOURCE_COLORS`, `STAKE_TIERS` | Client-side mine data and utilities |
| `mining.ts` | ~120 | `sha256`, `doubleSha256`, `mineRange` | SHA-256 hashing utilities |

### Workers (`app/workers/`)

| File | Lines | Purpose |
|------|-------|---------|
| `miner.worker.ts` | ~150 | Web Worker that performs CPU mining loop |

### API Routes (`app/api/`)

| File | Lines | Method | Purpose |
|------|-------|--------|---------|
| `verify-holder/route.ts` | ~185 | `GET` | Verifies wallet holds required token % (v2.7: network-aware Helius API) |
| `status/route.ts` | ~55 | `GET` | System status and service health check |
| `balance/route.ts` | ~140 | `GET` | **NEW v3.3.5** Fetch real on-chain SPL token balance |
| `staking/debug/route.ts` | ~200 | `GET` | **NEW v3.3.5** Staking diagnostics (config, accounts, balances) |
| `auth/nonce/route.ts` | ~45 | `POST` | Generate nonce for wallet signature |
| `auth/verify/route.ts` | ~75 | `POST` | Verify signed wallet actions |
| `admin/auth/route.ts` | ~40 | `POST` | Admin console authentication |

---

## Server (server/)

### Entry Point

| File | Lines | Exports | Purpose |
|------|-------|---------|---------|
| `index.ts` | ~650 | `startServer`, `stopServer` | v2 WebSocket server with multi-mine and game support |
| `types.ts` | ~220 | All interfaces | Shared TypeScript interfaces |

### Storage Module (`server/storage/`) - NEW v2.9.7

| File | Lines | Exports | Purpose |
|------|-------|---------|---------|
| `redis-store.ts` | ~320 | `RedisStore`, `getRedisStore`, `initRedisStore`, `StoredDiscovery`, `StoredActivity`, `StoredMineStats` | Redis persistence for activity feed and discoveries |
| `index.ts` | ~15 | Re-exports | Barrel exports |

**Redis Keys:**
- `blackgold:mine:{mineId}:discoveries` - List of recent discoveries (max 50)
- `blackgold:mine:{mineId}:stats` - Hash with totalDiscoveries, lastDiscoveryTime, peakHashrate
- `blackgold:mine:{mineId}:pending` - Pending discovery awaiting announcement
- `blackgold:activity:global` - Global activity feed (max 100)
- `blackgold:user:{walletAddress}:home_mine` - User's home mine preference (v2.9.9)

### Pool Module (`server/pool/`)

| File | Lines | Exports | Purpose |
|------|-------|---------|---------|
| `manager.ts` | ~600 | `PoolManager`, `PoolState`, `ConnectedMiner`, `PendingDiscovery` | Per-mine pool coordinator with 30s announcement delay |
| `work.ts` | ~180 | `WorkTracker`, `generateWork`, `validateWork` | Work unit generation |
| `difficulty.ts` | ~120 | `DifficultyState`, `adjustDifficulty` | Dynamic difficulty adjustment |
| `index.ts` | ~30 | Re-exports | Barrel exports |

**PoolManager v2.9.9 Updates:**
- `isMiningPaused()` - Check if mine is in countdown
- `getAnnouncementCountdown()` - Time remaining until winner reveal
- `forceAnnounce()` - Force-announce pending discovery on shutdown
- `PendingDiscovery` interface - Stores pending discovery with timer
- `MinerContribution` tracking - `hashSeconds` and `lastUpdate` per miner
- `calculateShares()` - Fair share distribution based on hash-seconds
- `handleHashrateUpdate()` - Updates `miner.contribution` accumulator
- Share calculation on discovery - 20% bonus for finder
- **v2.9.9**: `announceDiscovery()` recalculates mine difficulty before assigning new work

---

## Game System (server/game/)

### Core Game Files

| File | Lines | Exports | Purpose |
|------|-------|---------|---------|
| `types.ts` | ~350 | `StakeTier`, `Expedition`, `RaidResult`, `MineState`, `Syndicate`, etc. | All game type definitions |
| `mine-registry.ts` | ~350 | `MineRegistry`, `getMineRegistry` | 20 mine state management with resource-specific mechanics |
| `stake-manager.ts` | ~350 | `StakeManager`, `getStakeManager` | **v2.9** Quarry-integrated staking, BetEscrow coordination |
| `bet-escrow.ts` | ~320 | `BetEscrowManager`, `getBetEscrowManager` | **NEW v2.9** Raid bet locking separate from staking |
| `cooldowns.ts` | ~150 | `CooldownManager`, `getCooldownManager` | Cooldown enforcement |
| `expedition-tracker.ts` | ~350 | `ExpeditionTracker`, `getExpeditionTracker` | Raid expedition lifecycle |
| `raid-engine.ts` | ~350 | `RaidEngine`, `getRaidEngine` | Attack/defense calculations, bet burning, defender spoils |
| `vault-manager.ts` | ~200 | `VaultManager`, `getVaultManager` | Accumulates 30% of discovery rewards for hourly distribution |
| `distribution-service.ts` | ~280 | `DistributionService`, `getDistributionService` | Hourly pool distribution weighted by contribution score |
| `syndicate-manager.ts` | ~280 | `SyndicateManager`, `getSyndicateManager` | Alliance creation, join/leave, invitations |
| `syndicate-raids.ts` | ~250 | `SyndicateRaids`, `getSyndicateRaids` | Coordinated raids with pooled attack power |
| `reward-orchestrator.ts` | ~220 | `initRewardOrchestrator`, `handleNewDiscovery` | Connects buyback→distribution flow |
| `index.ts` | ~55 | Re-exports | Barrel exports |

### Solana Module (`server/solana/`)

| File | Lines | Exports | Purpose |
|------|-------|---------|---------|
| `holder.ts` | ~230 | `verifyHolder`, `createConnection`, `getHeliusApiBase` | Token holder verification via Helius (network-aware devnet/mainnet) |
| `rewards.ts` | ~280 | `sendReward`, `queueReward` | SPL token reward distribution (security-hardened v2.2) |
| `buyback.ts` | ~360 | `executeBuyback`, `shouldExecuteBuyback` | Automated SOL→COAL swap |
| `staking.ts` | ~330 | `buildStakeTransaction`, `buildClaimRewardsTransaction`, `buildRedeemTransaction`, `getUserStakeInfo` | **v2.9** Quarry SDK staking with IOU token support |
| `index.ts` | ~60 | Re-exports | Barrel exports |

**Security Hardening (rewards.ts - v2.2):**
- Private key handling documented with security warnings
- Error messages sanitized to prevent key exposure
- Regex filtering removes potential key data from logs

### Auth Module (`server/auth/`)

| File | Lines | Exports | Purpose |
|------|-------|---------|---------|
| `verify-wallet.ts` | ~160 | `verifySignature`, `verifySignedAction`, `generateNonce` | Solana wallet signature verification |
| `index.ts` | ~15 | Re-exports | Barrel exports |

### Verification Module (`server/verification/`)

| File | Lines | Exports | Purpose |
|------|-------|---------|---------|
| `proof.ts` | ~280 | `verifyProof`, `doubleSHA256` | Server-side proof verification |
| `anticheat.ts` | ~500 | `AntiCheatService` | Rate limiting, sybil detection |

---

## Configuration (config/)

| File | Lines | Exports | Purpose |
|------|-------|---------|---------|
| `constants.ts` | ~110 | `TOKEN_CONFIG`, `POOL_CONFIG`, `NETWORK`, `IS_DEVNET` | Environment-based configuration with devnet support |
| `holder-tiers.ts` | ~70 | `HOLDER_TIERS`, `getRequiredPercent` | Dynamic holder requirements |
| `mines.ts` | ~280 | `MINES`, `RESOURCE_MECHANICS`, `getMineById` | 20 mine definitions with coordinates |

---

## Scripts (scripts/)

| File | Lines | Purpose | Usage |
|------|-------|---------|-------|
| `buyback.ts` | ~215 | Standalone buyback service | `npm run buyback` |
| `create-test-token.ts` | ~127 | Create SPL test tokens on devnet | `npx tsx scripts/create-test-token.ts` |
| `deploy-quarry.ts` | ~290 | Deploy Quarry infrastructure (IOU + MintWrapper + Rewarder + Quarry) | `DEPLOYER_PRIVATE_KEY="..." npx tsx scripts/deploy-quarry.ts` |
| `test-staking.ts` | ~580 | **NEW v3.3.10** Comprehensive staking test suite (51 tests) | `npx tsx scripts/test-staking.ts` |
| `test-utils.ts` | ~280 | **NEW v3.3.10** Test utilities (logger, assertions, reporting) | Imported by test-staking.ts |

---

## Documentation (docs/)

### Core Documentation

| File | Purpose |
|------|---------|
| `INDEX.md` | Main project documentation |
| `GAME_MECHANICS.md` | **v2.8** Complete game rules, Quarry staking architecture, BetEscrow system |
| `ECONOMICS.md` | Tokenomics, sustainability analysis, earnings estimates |
| `DEPLOYMENT.md` | Step-by-step deployment guide for Vercel + Railway |

### Technical Guides

| File | Purpose |
|------|---------|
| `DEVNET_SETUP.md` | Devnet testing environment setup |
| `HELIUS_SETUP.md` | Helius API configuration guide |
| `SOLANA_INTEGRATION.md` | Solana blockchain integration details |
| `FRONTEND_INDEX.md` | Frontend component documentation |
| `PARALLEL_AGENTS.md` | Guide for multi-agent development |

### Security

| File | Purpose |
|------|---------|
| `SECURITY.md` | Security architecture overview |
| `SECURITY_CHECKLIST.md` | Security testing checklist and verification |
| `SECURITY_VERIFICATION.md` | Proof verification algorithm details |

---

## Mine Locations

### Coal Mines (5)

| Mine | Country | Coordinates |
|------|---------|-------------|
| Appalachian Basin | USA | 38.5°N, 82.5°W |
| Shanxi Province | China | 37.5°N, 112.5°E |
| Hunter Valley | Australia | 32.5°S, 151.0°E |
| Silesia | Poland | 50.3°N, 19.0°E |
| Kuzbass | Russia | 54.0°N, 87.0°E |

### Gold Mines (5)

| Mine | Country | Coordinates |
|------|---------|-------------|
| Witwatersrand | South Africa | 26.2°S, 28.0°E |
| Carlin Trend | USA (Nevada) | 40.7°N, 116.2°W |
| Super Pit | Australia | 30.8°S, 121.5°E |
| Grasberg | Indonesia | 4.1°S, 137.1°E |
| Muruntau | Uzbekistan | 41.5°N, 64.6°E |

### Oil Fields (5)

| Field | Country | Coordinates |
|-------|---------|-------------|
| Ghawar Field | Saudi Arabia | 25.4°N, 49.6°E |
| Permian Basin | USA (Texas) | 31.8°N, 102.4°W |
| **Orinoco Belt** | **Venezuela** | **8.5°N, 64.0°W** |
| Campos Basin | Brazil | 22.4°S, 40.0°W |
| Rumaila | Iraq | 30.5°N, 47.3°E |

### Silver Mines (5)

| Mine | Country | Coordinates |
|------|---------|-------------|
| Potosí | Bolivia | 19.6°S, 65.8°W |
| Guanajuato | Mexico | 21.0°N, 101.3°W |
| Coeur d'Alene | USA (Idaho) | 47.7°N, 116.8°W |
| Cannington | Australia | 21.9°S, 140.9°E |
| Dukat | Russia | 62.5°N, 155.0°E |

---

## Game Mechanics

> 📖 **For complete game rules and player guide, see [docs/GAME_MECHANICS.md](docs/GAME_MECHANICS.md)**  
> 💰 **For tokenomics and economics analysis, see [docs/ECONOMICS.md](docs/ECONOMICS.md)**

### Resource Types & Discovery Names

| Resource | Discovery Time | Discovery Name | Special Ability |
|----------|----------------|----------------|-----------------|
| **Coal** | 5 min | Coal Seam | Steady Burn: +10% loyalty bonus after 7 days |
| **Gold** | 20 min | Gold Nugget | Gold Rush: 5% chance of 5x jackpot |
| **Oil** | 10 min | Oil Gusher | Syndicate: Up to 3x multiplier at 50+ miners |
| **Silver** | 8 min | Silver Lode | Speculation: 0.5x - 2x random multiplier |

### Stake Tiers

| Tier | Min Stake | Hashrate Boost | Defense Boost |
|------|-----------|----------------|---------------|
| Base | 0 | 1.0x | 1.0x |
| Bronze | 100 | 1.5x | 1.2x |
| Silver | 500 | 2.0x | 1.5x |
| Gold | 1,000 | 2.5x | 1.8x |
| Diamond | 5,000 | 3.0x | 2.0x |

### Reward Distribution System

**Share-Based Pool Mining (v2.9.8):**

All active miners receive rewards proportional to their contribution, ensuring fairness regardless of CPU power.

**Per-Discovery Distribution:**
- **Base Share** = hashrate × time_mining (hash-seconds)
- **Finder Bonus** = +20% of their proportional share
- All miners at the mine during discovery receive rewards

**Example (100 COAL discovery):**
| Miner | Hashrate | Time Mining | Hash-Seconds | Share % | Reward |
|-------|----------|-------------|--------------|---------|--------|
| Alice (finder) | 50K H/s | 10 min | 30M | 60% + 20% bonus | 72 COAL |
| Bob | 25K H/s | 8 min | 12M | 24% | 24 COAL |
| Carol | 10K H/s | 4 min | 2.4M | 4.8% | 4 COAL |

**Vault Split (unchanged):**
- **70%** → Distributed to miners via share-based system
- **30%** → Accumulates in mine vault for hourly distribution

**Hourly Pool Distribution (weighted by):**
- Hashrate contribution at the mine
- Stake amount and tier
- Loyalty duration (time at home mine)

**Contribution Score Formula:**
```
score = (hashrate × 0.4) + (stakeAmount × 0.3) + (loyaltyBonus × 0.3)
```

### Raid Mechanics

- **Attack Power** = (Hashrate × 0.5) + (Stake × 0.1)
- **Defense Advantage** = 1.2x (attackers need 20% more power)
- **Steal Range** = 10-30% of discovery rewards
- **Immunity Duration** = 2 hours after successful defense
- **Bet Limit** = Up to 20% of stake
- **Failed Attack Penalty**: 
  - 10% of bet → Distributed to defenders
  - 90% of bet → Permanently burned

### Syndicate System (Alliances)

**Features:**
- Create syndicates with up to 20 members
- Invite players via wallet address
- Coordinate group raids with pooled attack power

**Syndicate Raid Mechanics:**
- All participating members' attack power is combined
- Rewards are split proportionally to contribution
- Shared cooldowns for coordinated attacks
- Bonus multiplier for full syndicate participation

### Cooldowns

| Action | Duration |
|--------|----------|
| Home Base Switch | 24 hours |
| Start Expedition | 1 hour |
| Post-Expedition Recovery | 30 minutes |
| Rally Defense | 1 hour |

---

## Data Flow Diagrams

### Multi-Mine Mining Flow

```
┌─────────────────┐
│    Browser      │
│   (3D Globe)    │
└────────┬────────┘
         │ Select Mine
         ▼
┌─────────────────┐      ┌─────────────────┐
│   join_mine     │ ───▶ │  Mine Registry  │
│   message       │      │  (Add Miner)    │
└────────┬────────┘      └─────────────────┘
         │
         ▼
┌─────────────────┐      ┌─────────────────┐
│   Pool Manager  │ ◀─── │  Stake Manager  │
│   (Per Mine)    │      │  (Multipliers)  │
└────────┬────────┘      └─────────────────┘
         │
         ▼ work unit
┌─────────────────┐
│   Web Worker    │
│   (Mining)      │
└────────┬────────┘
         │ submit proof
         ▼
┌─────────────────┐
│   Raid Engine   │ ──▶ Resolve active raids
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Broadcast     │ ──▶ barrel_found + raid_result
└─────────────────┘
```

### Raid Flow

```
┌──────────────┐    start_expedition    ┌──────────────┐
│   Attacker   │ ─────────────────────▶ │  Expedition  │
│  (Home Mine) │                        │   Tracker    │
└──────────────┘                        └──────┬───────┘
                                               │
                                               ▼
                                        ┌──────────────┐
                                        │ Target Mine  │
                                        │ (Registry)   │
                                        └──────┬───────┘
                                               │
                                               │ On discovery found
                                               ▼
┌──────────────┐    resolve_raid        ┌──────────────┐
│ Raid Engine  │ ◀───────────────────── │ Pool Manager │
└──────┬───────┘                        └──────────────┘
       │
       ▼ Calculate powers
┌──────────────────────────────────────────────────────┐
│  Attack Power vs Defense Power × 1.2                 │
│  If Attack > Defense: Steal 10-30%, apply debuff     │
│  If Defense wins: 2hr immunity                       │
│    - 10% of attacker bets → Defenders                │
│    - 90% of attacker bets → Burned                   │
└──────────────────────────────────────────────────────┘
```

### Reward Distribution Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    DISCOVERY FOUND                          │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
            ┌───────────────────────────────┐
            │      Split Rewards (100%)      │
            └───────────────┬───────────────┘
                            │
           ┌────────────────┴────────────────┐
           │                                 │
           ▼                                 ▼
    ┌─────────────┐                  ┌─────────────┐
    │  70% Instant │                  │  30% Pooled  │
    │  to Finder   │                  │  to Vault    │
    └──────┬──────┘                  └──────┬──────┘
           │                                 │
           ▼                                 ▼
    ┌─────────────┐                  ┌─────────────┐
    │ Immediate   │                  │ Accumulate  │
    │ Token Send  │                  │ in Mine     │
    └─────────────┘                  │ Vault       │
                                     └──────┬──────┘
                                            │
                                            │ Every hour
                                            ▼
                                     ┌─────────────┐
                                     │ Distribution │
                                     │ Service      │
                                     └──────┬──────┘
                                            │
                                            ▼ Calculate scores
                              ┌─────────────────────────────┐
                              │  For each active miner:     │
                              │  score = hashrate × 0.4     │
                              │        + stake × 0.3        │
                              │        + loyalty × 0.3      │
                              └─────────────────────────────┘
                                            │
                                            ▼
                              ┌─────────────────────────────┐
                              │  reward = (score/totalScore)│
                              │          × vaultBalance     │
                              └─────────────────────────────┘
```

### Syndicate Raid Flow

```
┌─────────────┐    create_syndicate    ┌─────────────────┐
│   Leader    │ ─────────────────────▶ │   Syndicate     │
│   (User)    │                        │   Manager       │
└─────────────┘                        └────────┬────────┘
                                                │
       ┌────────────────────────────────────────┤
       │ invite / accept                        │
       ▼                                        │
┌─────────────┐                                 │
│  Members    │ ◀───────────────────────────────┘
│  (1-20)     │
└──────┬──────┘
       │
       │ start_syndicate_raid
       ▼
┌─────────────────┐
│ Syndicate Raids │
│   Manager       │
└────────┬────────┘
         │
         ▼ Pool attack power
┌─────────────────────────────────────────┐
│  Combined Power = Σ(member attack power) │
│  Apply syndicate bonus (up to 1.25x)    │
└─────────────────────────────────────────┘
         │
         ▼ On resolution
┌─────────────────────────────────────────┐
│  Split rewards by contribution ratio    │
│  Apply shared cooldown to all members   │
└─────────────────────────────────────────┘
```

---

## Environment Variables

| Variable | Used In | Required |
|----------|---------|----------|
| `SOLANA_NETWORK` | constants.ts | No (default: mainnet) |
| `NEXT_PUBLIC_WS_URL` | Frontend | Yes |
| `NEXT_PUBLIC_PRIVY_APP_ID` | PrivyProvider.tsx | Yes (for wallet) |
| `NEXT_PUBLIC_SOLANA_NETWORK` | Frontend | No (for devnet indicator) |
| `HELIUS_API_KEY` | holder.ts, buyback.ts | Recommended |
| `SOLANA_RPC_URL` | holder.ts | No (has default) |
| `TOKEN_MINT_ADDRESS` | constants.ts | Yes (after launch) |
| `REWARD_WALLET_PRIVATE_KEY` | rewards.ts | Yes |
| `REWARD_WALLET_ADDRESS` | constants.ts | Yes |
| `CREATOR_WALLET_PRIVATE_KEY` | buyback.ts | Yes |
| `CREATOR_WALLET_ADDRESS` | constants.ts | Yes |
| `QUARRY_REWARDER_ADDRESS` | staking.ts | Yes (after setup) |
| `QUARRY_ADDRESS` | staking.ts | Yes (after setup) |
| `REDIS_URL` | redis-store.ts | No (degrades gracefully) |
| `ADMIN_SECRET` | admin/layout.tsx | Yes |
| `WEBSOCKET_PORT` | constants.ts | No (default 8080) |
| `NEXT_PUBLIC_USE_MOCKS` | Frontend | No (default: false) |

---

## NPM Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `dev` | `next dev` | Start frontend dev server |
| `build` | `next build` | Build frontend for production |
| `server` | `tsx watch server/index.ts` | Start game server (dev) |
| `server:prod` | `tsx server/index.ts` | Start game server (prod) |
| `buyback` | `tsx watch scripts/buyback.ts` | Start buyback service (dev) |
| `buyback:prod` | `tsx scripts/buyback.ts` | Start buyback service (prod) |

---

## File Line Counts Summary

| Category | Files | Total Lines |
|----------|-------|-------------|
| Frontend Globe/Game | 9 | ~1,880 |
| Frontend Legacy | 5 | ~620 |
| Frontend Hooks | 6 | ~735 |
| Frontend Providers | 2 | ~60 |
| Frontend Pages/Layout | 3 | ~850 |
| Frontend API Routes | 3 | ~260 |
| Server Game System | 11 | ~2,790 |
| Server Middleware | 2 | ~590 |
| Server Pool | 4 | ~780 |
| Server Solana | 4 | ~865 |
| Server Auth | 2 | ~175 |
| Server Verification | 2 | ~780 |
| Server Core | 2 | ~820 |
| Config | 3 | ~440 |
| Scripts | 2 | ~342 |
| **Total** | **60** | **~11,990** |
