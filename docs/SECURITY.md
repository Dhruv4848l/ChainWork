# Security Pass — Findings & Fixes (Phase 13)

A review of the OWASP basics plus ChainWork's specific trust boundaries. Findings fixed in
this phase are marked **[FIXED]**; standing controls already in place are **[OK]**; items that
require production infrastructure are **[PRE-MAINNET]** (see `PRE_MAINNET_CHECKLIST.md`).

## Access control (the highest-risk area for a funds-holding platform)

- **[OK] A worker can't act on another worker's hire.** Every worker mutation loads the row and
  checks ownership before acting — e.g. `markPhaseDeliveredAction` rejects unless
  `phase.hire.workerId === user.id`; `sendMessageAction`/`submitComplaintAction` scope by
  `workerId`. Same pattern client-side via `loadOwnedPhase` (scoped by `clientId`).
- **[OK] A client can only approve a phase they own.** `approvePhaseAction` → `loadOwnedPhase`
  scopes by `clientId`, and the escrow contract independently restricts approval to the recorded
  party — the backend can't release someone else's escrow.
- **[OK] An Analyst (read-only) can't mutate.** Admin sections are gated by `requireAdminAccess(navKey)`
  at the route AND filtered from the sidebar; the Analyst role has no write sections.
- **[OK] A juror can't see or vote on a case they aren't assigned to.** `assertJurorOnCase` requires a
  JURY/ROOT role AND an actual `JuryAssignment`; the dispute queue shows a juror only their cases.
- **[OK][TEST] The two-DB boundary holds.** Admin-surface code reaches Platform data only via the
  bridge. Now enforced by `src/lib/admin/boundary.test.ts`, which fails if any admin file imports
  the Platform DB directly.
- **[OK] Notification actions are user-scoped.** Mark-read writes use `where: { id, userId }`, never
  `id` alone, so one user can't touch another's notifications.

## Authentication & sessions

- **[FIXED] No brute-force protection on login.** Added an in-memory sliding-window rate limiter
  (`src/lib/rateLimit.ts`): consumer login and admin login are capped at **5 attempts / 15 min** per
  identifier, reset on success. (`[PRE-MAINNET]` swap the in-memory store for a shared one — Redis —
  when running multiple instances.)
- **[OK] No account enumeration.** Login returns the same generic error whether or not the account
  exists; the same applies to password reset.
- **[OK] OTP abuse controls.** 20s resend throttle + a 5-attempt cap per code (`verification.ts`).
- **[OK] Session hardening.** httpOnly, SameSite cookies; separate namespaced cookies for consumer
  (`cw_session`) vs admin (`cw_admin`) so one never grants the other; admin sessions are short (8h) +
  TOTP 2FA. Edge-safe JWT verify in `src/lib/*/jwt.ts`.

## Injection & input validation

- **[OK] SQL/NoSQL injection.** All data access is through Prisma's parameterized query builder — no
  raw string-concatenated SQL anywhere.
- **[OK] XSS.** React escapes by default; there is no `dangerouslySetInnerHTML` on user-supplied
  content. The one `dangerouslySetInnerHTML` in the app is the static theme-init script in the root
  layout (a fixed literal, no user input).
- **[OK] Server-side validation.** Server actions validate/normalize their inputs (trim, required
  checks, rating clamps in `submitReview`, revision/amount bounds) rather than trusting the client —
  the client form is a convenience, not the gate.

## Secrets & configuration

- **[OK] No secrets in the repo.** `.env` and `.chain-keystore.json` are gitignored; `git ls-files`
  shows no tracked env/key/pem files. The chain mnemonic and `AUTH_SECRET` are read from
  `process.env` (`src/lib/chain/config.ts`) — never hardcoded.
- **[PRE-MAINNET] Custodial key management.** Dev custody derives keys from a mnemonic — a local-dev
  stand-in only; production must use an HSM / managed custody + a gasless relayer.

## Smart-contract safety

- **[OK] Reentrancy, drain, and pause.** `ReentrancyGuard` on state-changing calls; a **no-drain**
  invariant (funds only ever reach the recorded worker/client); `Pausable` circuit-breaker. Covered
  by 31 tests including a live reentrancy attack and a no-drain assertion.
- **[PRE-MAINNET] Professional audit.** Non-negotiable before mainnet — top of the checklist.

## Admin console takeover (found + fixed 2026-10-03) — CRITICAL

- **[FIXED] Live admin console open to anyone.** Production accepted `000000` as a 2FA code
  (commit 349ab55) and fell back to a shared dev TOTP secret that is published in this
  (public) repo; all 5 production admins still had the seeded password `admin123`, also in the
  repo. Fix: every production admin rotated to a random password + their own TOTP secret
  (`scripts/rotate-admin-credentials.mts`, audit-logged); the bypass and the production
  fallback removed (`src/lib/admin/totpPolicy.ts`, `totpPolicy.test.ts` incl. a source scan for
  hard-coded codes). The production audit log showed **no admin logins ever**, so no evidence
  the hole was used.

## Payment-plan findings (P6–P7, 2026-10)

- **[FIXED] Reconciler adopted short / wrong-currency fundings.** Drift repair recorded any
  on-chain funding of a phase to the right worker as FUNDED — including one the server had
  just refused as underpaid or in the wrong asset. It now adopts only a full cwINR funding or
  one matching a quote for that phase (asset, worker, amount within 1 %) and flags anything
  else for an admin. Regression tests: `tests/integration/payments.int.test.mts`.
- **[FIXED] Wallet payments trusted only after on-chain verification.** A payer-sent funding
  is checked against our contract's `PhaseFunded` event (phase, worker, asset, amount) before
  anything moves; replayed, forged, unrelated, wrong-phase and wrong-worker transactions are
  refused with a failed receipt. Same test file.
- **[FIXED] WalletConnect initialised on every server render** (relay client + listeners
  leaked per request). Its setup now runs only in the browser.
- **[OK] Receipts** return 404 (not 403) to anyone but the payer, payee or a payments admin —
  E2E-tested.
- **[PARTLY FIXED 2026-10-06] Flagged escrows.** Every refused funding is now recorded
  (`FlaggedEscrow`, one row per phase, re-seen each tick) and listed on ADM-10 "Flagged wallet
  payments" with what's in escrow, who paid and why it was refused; an admin closes it with a
  note (audit-logged). A new flag emails `OPS_ALERT_EMAIL` and badges the console sidebar.
  **Refund to payer (2026-10-06):** PhaseEscrow v3 lets a refunded slot be funded again, so an
  admin can return a refused funding to whoever sent it and the phase stays payable; the refund
  posts no ledger lines (it was never credited) and is integration-tested end to end. Live once
  v3 is deployed to Amoy — until then the console offers only the review note.

## Summary
One real finding fixed (login rate limiting); the standing access-control, session, injection, and
secret controls hold. Remaining items are production-infra (shared rate-limit store, HSM custody,
real KYC/AML providers) and the mandatory contract audit — all tracked in the pre-mainnet checklist.
