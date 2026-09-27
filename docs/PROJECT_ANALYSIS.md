# ChainWork — Project Analysis Report

_Analysis date: 2026-09-27 · HEAD `349ab55` (branch `main`) · analysed by Claude Code_

Status of this document: **findings are open — none of the fixes below have been applied yet.**
Use it as the worklist for the upcoming fix pass.

## 1. What the project is

ChainWork is a three-sided marketplace (Worker / Client / Admin-Jury) for short-term, local,
physical work, with a trust layer:

- **Phase escrow on a blockchain** — the client locks money per phase of a job; it is released on
  approval, or automatically once the verification window lapses.
- **Peer-jury disputes** — a random, staked panel votes commit-then-reveal; median split for SPLIT
  verdicts; appeals go to a 7-juror panel.
- **Two separate databases** — the admin/jury DB (`chainwork_admin`) only reaches the platform DB
  (`chainwork_platform`) through `src/lib/admin/bridge.ts`.

**Stack:** Next.js 16 (App Router) + React 19 + Tailwind v4, Prisma ×2 on PostgreSQL, custom
JWT-cookie auth (`jose` + `bcryptjs`), Solidity/Hardhat contracts in `contracts/`, viem for chain
calls. ~20k lines across 271 tracked files, 31 commits.

**Layout:**
- `src/app/` — marketing site, auth flows, 17 worker screens (WK), 13 client screens (CL), admin console at `/admin` (ADM).
- `src/features/` — per-role actions + components (worker, client, admin, contracts, wallet, media, shared, public, auth).
- `src/lib/` — chain service, escrow timer (`escrow/tick.ts`), jury engine (`admin/jury.ts`, `admin/voting.ts`), notify, sms/email, rate limit, business-day calendar, cloudinary.
- `prisma/platform`, `prisma/admin` — the two schemas; `prisma/seed.ts` + `scripts/seed-*.mjs` for demo data.
- `contracts/` — `PhaseEscrow.sol`, `MockStablecoin.sol`, 31 Hardhat tests.

All 13 build phases are complete, plus: real SMS/email providers, milestone contracts with
two-sided signatures, demo seeders and a Playwright demo-capture script.

## 2. Work not yet recorded in CLAUDE.md

These commits postdate the last CLAUDE.md update:

| Commit | Change |
|---|---|
| `2ee8e09` | Cloudinary image uploads (`src/lib/cloudinary.ts`, `src/features/media/`) |
| `85b3834` | 500-account demo seeders (`scripts/seed-500*.mjs`, avatar/work-proof backfills) |
| `faec6e5` | Find Jobs filters (`src/features/worker/FindJobsBrowser.tsx`) |
| `195c227` | `MOCK_BLOCKCHAIN=true` mode — fakes chain calls in `src/lib/chain/escrow.ts` |
| `349ab55` | Admin 2FA accepts `000000` (in every environment) |

## 3. Findings (most serious first)

### F1 — Admin 2FA bypass works in production (security, critical if deployed)
- `src/features/admin/actions.ts:53` — `if (!code || (!verifyTotp(secret, code) && code !== "000000"))`.
- Any environment accepts `000000`, so admin login is password-only. Seeded admins use `admin123`.
- The login rate limiter (`src/lib/rateLimit.ts`) is in-memory, so on Vercel serverless it gives little protection.
- **Fix direction:** gate the bypass behind an explicit env flag that is refused when `NODE_ENV=production` (or remove it); move rate limiting to a shared store before a public deploy.

### F2 — One jury admin can cast every juror's vote (integrity)
- `commitVoteAction` / `revealVoteAction` take `jurorId` from the browser; `assertJurorOnCase` (`src/features/admin/actions.ts:130`) only checks the juror is on the panel, not that the logged-in admin **is** that juror.
- There is no link in the admin DB between `AdminUser` and `JurorProfile`.
- `src/app/admin/(console)/disputes/page.tsx:23` matches jurors with `platformUserId: admin.id` — compares IDs from different databases.
- `src/app/admin/(console)/disputes/[id]/page.tsx` has no assignment check; `JuryVoteControls` receives the whole panel.
- **Fix direction:** add an explicit admin↔juror link (e.g. `JurorProfile.adminUserId`), derive `jurorId` server-side from the session, scope the case detail page to assigned jurors.

### F3 — Jury engine never checks case status (correctness / money)
In `src/lib/admin/jury.ts` and `settleDisputeAction`:
- `tallyAndFinalize` can run twice → juror stakes paid/slashed twice.
- An `APPEALED` original case can still be settled on-chain.
- `revealVote` works before everyone has committed (status not checked).
- `commitDeadline` / `revealDeadline` are never enforced.
- `stakeBalance` can go negative (no floor on the slash).
- If fewer eligible jurors exist than `panelSize`, quorum (computed on `panelSize`) can never be reached.
- `appealCase` works before a verdict and on appeals of appeals.
- Dead code: the `fee` placeholder in `tallyAndFinalize`.
- **Fix direction:** status guards (`COMMIT` → commit; `REVEAL` → reveal; `REVEAL` → finalize; `VERDICT` → settle/appeal), deadline checks, clamp stakes, size the panel from the jurors actually assigned.

### F4 — "Request changes" works on any phase (correctness / DB-chain drift)
- `requestChangesAction` (`src/features/client/actions.ts:223`) has no status check.
- A client can push a `RELEASED`, `DISPUTED` or `PENDING_FUNDING` phase back to `IN_PROGRESS`. The DB then disagrees with the chain, and the tick's `autoRelease` reverts on it every run.
- **Fix direction:** allow only `DELIVERED` / `VERIFICATION_WINDOW_OPEN`.
- Related: `approvePhaseAction` also accepts `FUNDED` (not yet delivered); double-check this matches the contract and the intended UX.

### F5 — Delivery stake exists only in the database
- `chain.lockStake` / `chain.forfeitStake` / `refundStake` are never called from the app.
- `src/lib/escrow/tick.ts` marks stakes `FORFEITED` in the DB without an on-chain call.

### F6 — `MOCK_BLOCKCHAIN` only covers part of the chain code
- Wallet top-up / withdraw (`src/lib/chain/wallet.ts`) still hit the real chain.
- `balanceOfInr` always returns 40,000 → overwrites the worker's `balanceCache` on every release.
- `readEscrow` always reports `FUNDED`.

### F7 — DB and chain can drift apart
- Every money action writes chain first, DB second. If the DB write fails after the chain tx succeeds, nothing reconciles; the next tick retries an operation the contract now rejects (stuck phase + recurring errors).
- **Fix direction:** idempotent recovery — read on-chain status before acting and sync the DB to it.

### F8 — Leftover stubs and repo clutter
- Stub buttons still log TODOs: client "Propose settlement" (contract already supports `proposeSettlement`/`acceptSettlement`), "Check-in", client `addFundsAction`, worker `withdrawAction` (real versions exist in `src/features/wallet/actions.ts`).
- `docs/~$ainWork_ProjectII_PPT_Fill_Guide.docx` — a Word lock file is committed.
- `docs/images/demo/` is empty → the walkthrough has no screenshots.
- `Math.random()` panel shuffle — fine for a demo, not verifiable randomness.

## 4. What looks solid
- Two-DB boundary enforced by a test (`src/lib/admin/boundary.test.ts`).
- Contract role design + 31 Hardhat tests; no function drains escrow.
- Cron endpoint fails closed in production; timing-safe secret compare.
- Open-redirect fix (`safeReturnTo`) and security headers (CSP, XFO, HSTS…).
- SMS/email providers fall back to a console log on failure.
- Contract document hash recomputed server-side and checked against both signatures; funding gated on both signatures.

## 5. Verification status
At analysis time the checkout had no `node_modules` and no generated Prisma clients, so typecheck,
lint and `npm test` could not run (all 4 test files failed only because `tsx` was missing). None
of the findings above were confirmed by a test run — they come from reading the code.

## 6. Local run notes (2026-09-27)

- `.env` points both databases at **Neon** (hosted Postgres), not the local PG service:
  platform → `ep-autumn-math-…neon.tech`, admin → `ep-bold-violet-…neon.tech`. Both report
  "schema is up to date" (6 platform + 1 admin migration). No migrations or seeds were run against them.
- Chain → **Polygon Amoy** (`CHAIN_ID=80002`); SMS → **Twilio**, email → **Resend** (real sends —
  signups/OTP will send real texts/emails). `MOCK_BLOCKCHAIN` is not set.
- Port 3000 is taken by an unrelated Docker container (`dori-frontend`), so `.claude/launch.json`
  now has `"autoPort": true` for the `web` config; the dev server picks a free port.
  `APP_BASE_URL` still says `localhost:3000`, so emailed links will point at the wrong port locally.
- **Data actually present in the Neon DBs** — only the base `prisma/seed.ts` data:
  - Platform: 5 workers + 3 clients (`ravi@`, `suresh@`, `meena@`, `arjun@`, `lakshmi@`, `imran@`, `events@`, `quickfix@` — all `@chainwork.dev`), password `password123`. All have `onboarded:false`, so a normal login routes to onboarding.
  - Admin: `root@`, `verify@`, `finance@`, `support@`, `analyst@` (all `@chainwork.local`), password `admin123`; 2FA code is logged to the dev server console (and `000000` works — see F1).
  - 5 jurors, 1 dispute case in `REVEAL`.
  - The demo roster (`scripts/seed-demo-accounts.mjs` — 27 workers, 4 clients, 14 jurors, `moderation@`/`jury.lead@` admins) and the 500-account dataset are **not** seeded here.
- The credential sheet `docs/ChainWork_Demo_Accounts.docx` is gitignored and not in this checkout;
  the other four `.docx` files in `docs/` contain no login credentials. Credentials above come
  from the seed scripts + CLAUDE.md.

> **Follow-up (same day):** wallet and browser-extension problems (W1–W10, E1–E8) were found
> afterwards. The most serious is W1: on Amoy the configured mnemonic is the public Hardhat
> phrase, and the relayer has no `ATTESTOR_ROLE` and almost no gas, so money flows can't work
> there. All fixes are planned in [ROADMAP.md](ROADMAP.md).

## 7. Planned next steps
1. Install deps, bring up both databases, run typecheck / lint / `npm test` / `npm run test:contracts` for a baseline.
2. Fix F1–F4 (small, contained changes), then F5–F7.
3. Update CLAUDE.md for the five undocumented commits.
