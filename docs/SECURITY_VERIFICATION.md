# Black Gold Security Verification Layer

## Overview

The verification layer provides cryptographic proof validation and anti-gaming protections for the Black Gold mining pool. This document describes the security architecture, attack mitigations, and operational guidelines.

## Files

| File | Purpose |
|------|---------|
| `server/verification/proof.ts` | SHA-256 double-hash proof verification |
| `server/verification/anticheat.ts` | Rate limiting, sybil detection, connection management |

---

## 1. Proof Verification (`proof.ts`)

### Algorithm: Bitcoin-style Double SHA-256

```
hash = SHA256(SHA256(barrelHeader + ":" + nonce))
```

**Why double-hash?**
- Prevents length-extension attacks possible with single SHA-256
- Battle-tested pattern used by Bitcoin since 2009
- No known cryptographic weaknesses

### Verification Flow

```
┌─────────────────┐
│ Proof Received  │
└────────┬────────┘
         ▼
┌─────────────────┐
│ Work Unit Exists?│──No──→ REJECT (INVALID_WORK)
└────────┬────────┘
         │ Yes
         ▼
┌─────────────────┐
│ Nonce in Range? │──No──→ REJECT (INVALID_NONCE)
└────────┬────────┘
         │ Yes
         ▼
┌─────────────────┐
│ Nonce Used?     │──Yes─→ REJECT (DUPLICATE_NONCE)
└────────┬────────┘
         │ No
         ▼
┌─────────────────┐
│ Recompute Hash  │
└────────┬────────┘
         ▼
┌─────────────────┐
│ Hash Matches?   │──No──→ REJECT (INVALID_HASH)
└────────┬────────┘
         │ Yes
         ▼
┌─────────────────┐
│ Meets Target?   │──No──→ REJECT (TARGET_NOT_MET)
└────────┬────────┘
         │ Yes
         ▼
┌─────────────────┐
│ VALID PROOF ✓   │
└─────────────────┘
```

### Key Security Properties

| Property | Implementation | Attack Prevented |
|----------|----------------|------------------|
| Server-side verification | Always recompute hash | Fake hash submission |
| Nonce range binding | Check `nonceStart <= nonce < nonceEnd` | Nonce stealing |
| Duplicate prevention | Track used nonces per work unit | Double-claim attacks |
| Work unit binding | Validate against active work | Replay attacks |
| Timing-safe comparison | `crypto.timingSafeEqual` | Timing side-channels |

### API

```typescript
// Register work for a miner
registerWorkUnit(work: WorkUnit): void

// Verify a proof submission
verifyProof(submission: ProofSubmission): Promise<boolean>

// Clear all work (new barrel)
clearAllWorkUnits(): void

// Get verification statistics
getVerificationStats(): VerificationStats
```

---

## 2. Anti-Cheat Service (`anticheat.ts`)

### Rate Limiting

| Limit | Value | Rationale |
|-------|-------|-----------|
| Submissions per minute | 10 | Valid proofs are rare; 10/min is generous |
| Connections per IP | 3 | Allows multi-wallet setups, blocks abuse |
| IPs per wallet (sybil) | 3 | Legitimate miners use 1-2 IPs |

### Exponential Backoff

Failed submissions trigger increasing cooldown:

```
Failure 1: 1 second
Failure 2: 2 seconds
Failure 3: 4 seconds
Failure 4: 8 seconds
...
Maximum: 60 seconds
```

**Reset condition:** Successful valid submission resets backoff.

### Sybil Detection Flow

```
┌─────────────────────┐
│ Connection Request  │
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│ Track IP for Wallet │
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│ Count IPs in 1 Hour │
└──────────┬──────────┘
           ▼
    ┌──────┴──────┐
    │   >= 3 IPs? │
    └──────┬──────┘
       Yes │
           ▼
┌─────────────────────┐
│ FLAG WALLET 🚩      │
│ (Allow but monitor) │
└─────────────────────┘
```

### Connection Management

```
┌─────────────────────┐
│ Connection Request  │
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│ IP Connections < 3? │──No──→ REJECT
└──────────┬──────────┘
           │ Yes
           ▼
┌─────────────────────┐
│ ALLOW & TRACK       │
└─────────────────────┘
```

### API

```typescript
// Check if connection allowed
checkConnection(wallet: string, ip: string): boolean

// Check if submission allowed
checkSubmission(wallet: string, ip: string): SubmissionCheckResult

// Record outcomes
recordFailedSubmission(wallet: string): void
recordSuccessfulSubmission(wallet: string): void
recordDisconnect(wallet: string, ip: string): void

// Query status
isWalletFlagged(wallet: string): boolean
getWalletSybilStatus(wallet: string): SybilStatus
getStats(): AntiCheatStats
getRecentSuspiciousActivity(limit?: number): SuspiciousActivityLog[]

// Admin controls
unflagWallet(wallet: string): boolean
resetBackoff(wallet: string): boolean
```

---

## 3. Logging & Monitoring

### Suspicious Activity Severity Levels

| Level | Color | Examples |
|-------|-------|----------|
| LOW | ⚪ | Backoff active (normal for unlucky miners) |
| MEDIUM | 🟡 | Rate limit hit, connection limit hit |
| HIGH | 🟠 | Multiple failed submissions, flagged wallet submitting |
| CRITICAL | 🔴 | Sybil flag triggered (3+ IPs in 1 hour) |

### Log Format

```
[AntiCheat] 🔴 SYBIL_FLAG: 7xK3n2m5... from 192.168.1.1 - 4 unique IPs in 1 hour
[Proof] SUSPICIOUS: INVALID_NONCE from 9aB4c5d6... (work: a1b2c3d4..., nonce: 999999999)
```

### Monitoring Endpoints

The `getStats()` method returns:
- Active connections count
- Tracked wallets/IPs
- Flagged wallet count
- Today's suspicious events by type

---

## 4. Attack Scenarios & Mitigations

### Scenario 1: Fake Proof Submission

**Attack:** Submit fabricated hash without computing it.

**Mitigation:** Server always recomputes `SHA256(SHA256(header:nonce))` and compares. Fake hashes are immediately detected.

### Scenario 2: Nonce Range Hijacking

**Attack:** Submit proofs using another miner's nonce range.

**Mitigation:** Each work unit has assigned `nonceStart` and `nonceEnd`. Submissions outside range are rejected with `INVALID_NONCE`.

### Scenario 3: Double-Spending Nonces

**Attack:** Submit the same valid nonce multiple times.

**Mitigation:** Used nonces are tracked per work unit. Duplicates rejected with `DUPLICATE_NONCE`.

### Scenario 4: Submission Spam

**Attack:** Flood server with submission attempts.

**Mitigation:** 
- 10 submissions/minute per wallet
- Exponential backoff on failures (1s → 60s)
- Makes brute-force exponentially expensive

### Scenario 5: Sybil Attack (Multiple Wallets)

**Attack:** Use many wallets from same IP to increase share.

**Mitigation:**
- 3 connections max per IP
- IP correlation tracking
- Wallets flagged when using 3+ IPs (VPN rotation indicator)

### Scenario 6: Botnet Attack

**Attack:** Coordinate many IPs to control pool.

**Mitigation:**
- Combined IP + wallet limits
- Rate limiting per wallet (not per connection)
- Flagging for suspicious IP patterns

### Scenario 7: Replay Attack

**Attack:** Resubmit old valid proof for new barrel.

**Mitigation:**
- Work units are barrel-specific
- Work units expire after 60 seconds
- New barrel clears all work units

---

## 5. Configuration

All limits are configurable in `config/constants.ts`:

```typescript
export const RATE_LIMIT_CONFIG = {
  MAX_SUBMISSIONS_PER_MINUTE: 10,
  MAX_CONNECTIONS_PER_IP: 3,
  MAX_IPS_PER_WALLET: 3,
  WINDOW_MS: 60_000,
  INITIAL_BACKOFF_MS: 1_000,
  MAX_BACKOFF_MS: 60_000,
  BACKOFF_MULTIPLIER: 2,
};
```

---

## 6. Integration Points

### Server Index (`server/index.ts`)

```typescript
import { verifyProof } from './verification/proof';
import { AntiCheatService } from './verification/anticheat';

const antiCheat = new AntiCheatService();

// On connection
const allowed = antiCheat.checkConnection(wallet, ip);

// On submission
const check = antiCheat.checkSubmission(wallet, ip);
if (!check.allowed) return;

const valid = await verifyProof(submission);
if (!valid) {
  antiCheat.recordFailedSubmission(wallet);
}
```

### Pool Manager (`server/pool/manager.ts`)

The pool manager handles work unit lifecycle:
- Generates work units with nonce ranges
- Should call `registerWorkUnit()` when assigning work
- Should call `clearAllWorkUnits()` on new barrel

---

## 7. Future Enhancements

- [ ] Redis-backed state for horizontal scaling
- [ ] IP reputation scoring (historic behavior)
- [ ] Wallet reputation scoring
- [ ] Automatic ban escalation for repeat offenders
- [ ] Geographic anomaly detection
- [ ] Machine learning pattern detection

---

## 8. Audit Checklist

When reviewing the security layer:

- [ ] All proofs are recomputed server-side
- [ ] Nonce ranges are strictly enforced
- [ ] Used nonces are tracked and rejected
- [ ] Rate limits cannot be bypassed by reconnecting
- [ ] Exponential backoff increases with failures
- [ ] Sybil detection flags but doesn't block (manual review)
- [ ] All suspicious activity is logged
- [ ] Timing-safe comparisons for hash verification
- [ ] Memory cleanup prevents exhaustion attacks
