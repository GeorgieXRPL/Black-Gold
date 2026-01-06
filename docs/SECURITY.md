# Black Gold Security Review

> Red team analysis of the mining platform

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
- ✅ Max 10 submissions per minute per wallet
- ✅ Exponential backoff after failed submissions
- ✅ Backoff multiplier: 2x per failure
- ✅ Max backoff: 60 seconds

**Code Location**: `checkSubmission()` in `server/verification/anticheat.ts`

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
- ⚠️ **Partial vulnerability**: Attacker with many IPs could still flood

**Improvement Opportunities**:
- 🔴 Add connection rate limiting per IP (e.g., max 10/minute)
- 🔴 Add global connection limit
- 🔴 Use Redis for distributed rate limiting

**Code Location**: `checkConnection()` in `server/verification/anticheat.ts`

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

**Security Notes**:
- 🔴 Never commit private keys to git
- 🔴 Use hardware wallet for production
- 🔴 Consider multi-sig for reward wallet

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
| Rate limit bypass | Medium | ✅ Mitigated |
| Sybil attack | Medium | ⚠️ Partial |
| Flash loan attack | Medium | ⚠️ Partial |
| WebSocket flooding | Medium | ⚠️ Partial |
| Hashrate manipulation | Low | ✅ Mitigated |
| Reward theft | Critical | ✅ Mitigated |
| MITM attack | High | ⚠️ Requires WSS |
| Client tampering | Low | ✅ Mitigated |

---

## Recommended Improvements

### Priority 1 (Before Launch)
1. Implement time-weighted balance check for flash loan prevention
2. Enable WSS with proper TLS
3. Add connection rate limiting

### Priority 2 (Post-Launch)
1. Add Redis for distributed state
2. Implement proof-of-humanity for flagged accounts
3. Add captcha for suspicious connections

### Priority 3 (Future)
1. Multi-sig reward wallet
2. External security audit
3. Bug bounty program
