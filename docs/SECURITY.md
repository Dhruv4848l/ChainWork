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

## Summary
One real finding fixed (login rate limiting); the standing access-control, session, injection, and
secret controls hold. Remaining items are production-infra (shared rate-limit store, HSM custody,
real KYC/AML providers) and the mandatory contract audit — all tracked in the pre-mainnet checklist.
