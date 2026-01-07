# Black Gold Security Review

> Red team analysis of the mining platform

**Last Updated**: January 2026  
**Version**: 2.3 (Wallet Signature Verification)

---

## v2.2 Security Enhancements

### New Middleware (`server/middleware/`)

1. **Zod Validation** (`validate.ts`)
   - All WebSocket message payloads validated with strict Zod schemas
   - Wallet addresses validated as base58, 32-44 characters
   - Numeric bounds enforced (cores 1-128, hashrate max 1GH/s, etc.)
   - `sanitizeForLog()` prevents log injection attacks
   - `redactSensitive()` removes keys/secrets from logged objects

2. **Rate Limiting** (`rateLimit.ts`)
   - In-memory sliding window algorithm (no Redis dependency)
   - Per-IP rate limits by action type
   - Exponential backoff for repeat violators
   - Auto-ban with configurable max duration
   - Automatic cleanup of inactive entries

### Private Key Security (`server/solana/rewards.ts`)
- Never log private key material
- Error messages sanitized with regex to redact potential key leaks
- Documentation warnings in code about key handling

---

## Attack Vectors Considered

### 1. Fake Proof Submissions

**Attack**: Submit fake hashes that don't actually solve the work.

**Mitigations**:
- ✅ Server-side proof verification (`server/verification/proof.ts`)
- ✅ Double SHA-256 hash computed independently on server
- ✅ Hash compared against submitted hash - must match exactly
- ✅ Hash must be below difficulty target
- ✅ Nonce must be within assigned range

**Code Location**: `verifyProofDetailed()` in `server/verification/proof.ts`

---

### 2. Nonce Range Gaming

**Attack**: Try to claim multiple nonce ranges or steal others' work.

**Mitigations**:
- ✅ Work units assigned with unique IDs
- ✅ Work units tracked per wallet address
- ✅ Nonce must be within assigned range for work unit
- ✅ Work units expire after 60 seconds
- ✅ Old barrel work rejected after new barrel starts

**Code Location**: `validateWork()` in `server/pool/work.ts`

---

### 3. Rate Limit Bypass

**Attack**: Submit many proofs rapidly to increase win chance.

**Mitigations**:
- ✅ Max 50 submissions per 10 seconds per IP (v2.2)
- ✅ Exponential backoff after failed submissions
- ✅ Backoff multiplier: 2x per failure
- ✅ Configurable max ban duration (10 minutes for submissions)
- ✅ Sliding window algorithm for accurate limiting

**Code Location**: 
- `server/middleware/rateLimit.ts` (v2.2 - primary)
- `server/verification/anticheat.ts` (additional checks)

---

### 4. Sybil Attack (Multiple Wallets)

**Attack**: Use many wallets to get more work units.

**Mitigations**:
- ✅ Max 3 connections per IP address
- ✅ Track wallets per IP (flag at 10+)
- ✅ Track IPs per wallet (flag at 3+)
- ✅ Flagged wallets get stricter rate limits (50% reduction)

**Improvement Opportunities**:
- ⚠️ Consider requiring minimum token hold time before mining
- ⚠️ Could add captcha for flagged connections
- ⚠️ Could add proof-of-humanity verification

**Code Location**: `AntiCheatService` in `server/verification/anticheat.ts`

---

### 5. Flash Loan Attack

**Attack**: Borrow tokens briefly to meet holder requirement, mine, then return.

**Mitigations**:
- ✅ Holder verification cached for 5 minutes
- ✅ Verification checked on every connection
- ⚠️ **Partial vulnerability**: Could mine for cache duration

**Improvement Opportunities**:
- 🔴 Add time-weighted balance check
- 🔴 Require tokens held for minimum duration (e.g., 1 hour)
- 🔴 Check balance again on proof submission

**Code Location**: `verifyHolder()` in `server/solana/holder.ts`

---

### 6. WebSocket Connection Flooding

**Attack**: Open many connections to DoS the server.

**Mitigations**:
- ✅ Max 3 connections per IP
- ✅ Connection tracked and counted
- ✅ **Connection rate limiting**: Max 5 connections per minute per IP (v2.2)
- ✅ Exponential backoff on repeat violations
- ⚠️ **Partial vulnerability**: Attacker with many IPs could still flood

**Improvement Opportunities**:
- 🔴 Add global connection limit
- 🔴 Use Redis for distributed rate limiting (multi-server)

**Code Location**: 
- `server/middleware/rateLimit.ts` (v2.2 - connection rate limiting)
- `server/verification/anticheat.ts` (connection count tracking)

---

### 7. Hashrate Manipulation

**Attack**: Report false hashrate to game the system.

**Mitigations**:
- ✅ Hashrate is informational only
- ✅ Rewards based on valid proof submission, not hashrate
- ✅ Difficulty adjusts based on actual barrel times, not reported rates

**Code Location**: Pool manager ignores hashrate for rewards

---

### 8. Reward Theft

**Attack**: Steal tokens from reward pool.

**Mitigations**:
- ✅ Private key stored securely in environment variables
- ✅ Only valid barrel winners receive rewards
- ✅ Transaction verification on-chain
- ✅ Error messages sanitized to prevent key exposure (v2.2)
- ✅ Private key handling documented with security warnings (v2.2)

**Security Notes**:
- 🔴 Never commit private keys to git
- 🔴 Use hardware wallet for production
- 🔴 Consider multi-sig for reward wallet

**Code Location**: `server/solana/rewards.ts` (security-hardened in v2.2)

---

### 9. Man-in-the-Middle

**Attack**: Intercept WebSocket traffic to steal solutions.

**Mitigations**:
- ⚠️ **Vulnerable if not using WSS**

**Required Actions**:
- 🔴 Always use WSS (WebSocket Secure) in production
- 🔴 Enforce HTTPS for all API endpoints
- 🔴 Add TLS certificate

---

### 10. Client-Side Tampering

**Attack**: Modify mining client to cheat.

**Mitigations**:
- ✅ All proofs verified server-side
- ✅ Client cannot bypass server validation
- ✅ Work units assigned by server

**Note**: Client modifications cannot gain advantage since all validation is server-side.

---

### 11. Unauthorized Actions (Staking, Raiding, etc.)

**Attack**: Perform actions (stake, unstake, raid) without wallet owner consent.

**Mitigations (v2.3)**:
- ✅ All state-changing actions require wallet signature
- ✅ Signatures verified using `nacl.sign.detached.verify`
- ✅ Nonce system prevents replay attacks
- ✅ Nonces expire after 5 minutes
- ✅ Each nonce can only be used once
- ✅ Wallet address verified against signature

**Code Location**: `verifySignedAction()` in `server/auth/verify-wallet.ts`

**Signed Actions:**
- `stake` - Stake tokens at a mine
- `unstake` - Unstake tokens from a mine
- `set_home` - Set home mine
- `start_expedition` - Launch raid
- `leave_expedition` - Cancel raid
- `syndicate_action` - Syndicate management
- `claim_rewards` - Claim accumulated rewards

---

### 12. Wallet Impersonation

**Attack**: Claim to be a wallet you don't own.

**Mitigations (v2.3)**:
- ✅ Privy handles secure wallet connection
- ✅ Wallet address comes from cryptographic verification
- ✅ All sensitive actions require valid signature from claimed wallet
- ✅ Signature verification uses on-chain public key

**Code Location**: `verifySignature()` in `server/auth/verify-wallet.ts`

---

## Security Checklist

### Before Launch

- [ ] Enable WSS for production WebSocket connections
- [ ] Set up Redis for distributed rate limiting
- [ ] Configure proper CORS headers
- [ ] Add request signing for API calls
- [ ] Implement balance time-weighting for holder verification
- [ ] Add connection rate limiting
- [ ] Set up monitoring and alerting
- [ ] Conduct external security audit

### Environment Security

- [ ] Store private keys in secure vault (not env files)
- [ ] Use hardware wallet for reward wallet
- [ ] Rotate API keys regularly
- [ ] Set up proper firewall rules
- [ ] Enable DDoS protection (Cloudflare, etc.)

### Monitoring

- [ ] Log all flagged wallet/IP activity
- [ ] Alert on unusual submission patterns
- [ ] Track reward distribution anomalies
- [ ] Monitor pool connection counts

---

## Severity Ratings

| Issue | Severity | Status |
|-------|----------|--------|
| Fake proof submission | High | ✅ Mitigated |
| Nonce range gaming | High | ✅ Mitigated |
| Rate limit bypass | Medium | ✅ Mitigated (v2.2) |
| Sybil attack | Medium | ⚠️ Partial |
| Flash loan attack | Medium | ⚠️ Partial |
| WebSocket flooding | Medium | ✅ Mitigated (v2.2) |
| Hashrate manipulation | Low | ✅ Mitigated |
| Reward theft | Critical | ✅ Mitigated (v2.2 hardened) |
| MITM attack | High | ⚠️ Requires WSS |
| Client tampering | Low | ✅ Mitigated |
| Log injection | Medium | ✅ Mitigated (v2.2) |
| Payload injection | Medium | ✅ Mitigated (v2.2 Zod) |
| Unauthorized actions | High | ✅ Mitigated (v2.3 signatures) |
| Wallet impersonation | High | ✅ Mitigated (v2.3 Privy) |

---

## Recommended Improvements

### Priority 1 (Before Launch)
1. Implement time-weighted balance check for flash loan prevention
2. Enable WSS with proper TLS
3. ~~Add connection rate limiting~~ ✅ **Done in v2.2**

### Priority 2 (Post-Launch)
1. Add Redis for distributed state (multi-server deployments)
2. Implement proof-of-humanity for flagged accounts
3. Add captcha for suspicious connections

### Priority 3 (Future)
1. Multi-sig reward wallet
2. External security audit
3. Bug bounty program

---

## v2.2 Changes Summary

| Component | Changes |
|-----------|---------|
| `server/middleware/validate.ts` | NEW - Zod validation schemas for all message types |
| `server/middleware/rateLimit.ts` | NEW - In-memory rate limiting with sliding window |
| `server/index.ts` | Added validation + rate limiting to all handlers |
| `server/solana/rewards.ts` | Security hardening for private key handling |
