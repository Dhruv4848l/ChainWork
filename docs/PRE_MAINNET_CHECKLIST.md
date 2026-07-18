# Pre-Mainnet Checklist — DO NOT SKIP

> **Golden rule: ChainWork stays on a testnet until every item in "Blockers" below is done.**
> The platform holds other people's money. Shipping any of this to mainnet early is not a bug —
> it is a way to lose users' funds. There is no deadline worth crossing this line for.

Status today: **feature-complete on a testnet.** Everything below is what stands between here and
real money.

## 🔴 Blockers — real funds are forbidden until ALL of these are done

1. **Professional third-party smart-contract audit.** The single most important item. Engage a
   reputable firm to audit `contracts/PhaseEscrow.sol` and the deployment/upgrade path. Budget real
   time and money. Do not self-audit. Fix every finding and re-audit changes. *Nothing else on this
   list matters if this isn't done.*
2. **Wallet custody hardening.** Replace the dev keystore (HD keys from a mnemonic in
   `src/lib/chain/keystore.ts`) with an **HSM or a managed custody provider**, and add a **gasless
   meta-transaction relayer** so users never touch gas. No production key may live in an env var or a
   file on disk.
3. **Real KYC / identity provider.** The current KYC auto-approves (mock). Integrate a real
   KYC/liveness vendor and wire the rejection → manual-review path for real. Enforce the tier gate on
   every money movement (already gated in code via `assertKycVerified`).
4. **Real fiat on/off-ramp.** `topUpCustodial` / `withdrawCustodial` mint/move test tokens. Integrate
   a licensed payment processor for the fiat↔stablecoin conversion, with idempotent retries and a
   held-pending state on partial failure.
5. **Real SMS + email delivery.** OTP and notifications are console-mocked. Plug providers into the
   commented adapters (`src/lib/notify/channels.ts`, `src/lib/auth/verification.ts`) — incl. OTP
   voice fallback.
6. **Legal + AML review, per jurisdiction.** Money-movement licensing, the enforceability of on-chain
   agreements, data-protection (KYC PII), and an AML/sanctions-screening flow feeding the compliance
   hold queue. This gates *where* you can launch.

## 🟠 Hardening — required for a safe launch, not strictly fund-blocking

7. **Distributed rate limiting.** `src/lib/rateLimit.ts` is per-process (in-memory). Move to a shared
   store (Redis/Upstash) before running multiple instances, or the auth brute-force cap is bypassable
   by hitting different instances.
8. **Multi-provider resilience.** Add RPC failover + async retry queues for chain writes (reads
   already degrade to a cached balance). Same for the payment processor.
9. **Contract pause runbook + multi-sig.** Put the PAUSER role behind a multi-sig and write the
   incident runbook for pausing/among funds-at-risk events.
10. **Load, accessibility, and mobile QA at scale.** Full a11y audit (started in Phase 13), real
    load testing, and cross-device QA.
11. **Monitoring & alerting.** On-chain tx failure rates, escrow balances vs. expected, jury health
    metrics (watch closely while the juror pool is small), auth anomalies, audit-log review.
12. **Backups & disaster recovery** for both databases, and a tested restore.

## 🟢 Launch sequence (after the blockers clear)

1. Audit passes → deploy audited contracts to mainnet (behind the multi-sig pause).
2. Swap all mock adapters for real providers (KYC, SMS, email, on/off-ramp).
3. **Soft launch:** one city, one or two categories, **capped job values**, watching jury health
   metrics and escrow invariants closely while the juror pool is still small.
4. Expand only as the metrics and the juror pool support it.

---

### Where the mocks live (so nothing is forgotten)
| Area | Mock location | Replace with |
|---|---|---|
| Custody / keys | `src/lib/chain/keystore.ts` | HSM / managed custody + gasless relayer |
| KYC | `submitKycAction` (auto-approve) | real KYC/liveness vendor |
| Fiat on/off-ramp | `topUpCustodial` / `withdrawCustodial` | licensed payment processor |
| Email / SMS | `src/lib/notify/channels.ts`, `verification.ts` | Resend/SES + Twilio/MSG91 |
| Rate limiting | `src/lib/rateLimit.ts` (in-memory) | Redis/Upstash shared store |
| Chain network | `CHAIN_*` env (local/testnet) | audited mainnet deploy |
