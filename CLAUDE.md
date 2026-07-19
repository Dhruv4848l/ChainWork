@AGENTS.md

# ChainWork — Project Memory (CLAUDE.md)

> This file is the shared memory across all build phases. Read it at the start of every
> phase, and update it at the end of every phase. It is the single source of truth for
> conventions and cross-phase decisions. (`AGENTS.md` above holds Next.js framework notes
> from the scaffold.)

## What ChainWork is

ChainWork is a role-based, three-sided marketplace for **physical, time-boxed, local labor**
(electricians, cooks, decorators, drivers, cleaners, waiters, helpers) — hired for hours,
days, or weeks, not months. It differs from LinkedIn (permanent hiring) and Fiverr (digital
services) by centering on daily-wage/gig work plus a **trust layer**: verified identities,
mutual reviews, **phase-based blockchain escrow** (funds locked per phase of work, released
automatically on confirmation or when a verification window lapses), and a **peer-jury**
dispute system (a randomly selected, staked panel decides disputes via commit-reveal voting —
no single admin judge).

## Tech stack

- **Frontend + app**: Next.js 16 (App Router) + React 19 + TypeScript, `/src` dir, import alias `@/*`.
- **Styling**: Tailwind CSS v4 (CSS-first `@theme inline`) + CSS variables. Theme switches via
  `data-cw-theme` on `<html>`.
- **Platform DB**: PostgreSQL + Prisma (everything Workers/Clients touch).
- **Admin/Jury DB**: a **physically separate** PostgreSQL database + separate Prisma schema.
- **Auth**: Auth.js (NextAuth) for consumers; a **separate** credential system for `/admin`.
- **Blockchain**: Solidity + Hardhat, deployed to **Polygon Amoy testnet** (never mainnet
  until a professional audit). Test ERC-20 stablecoin represents rupee-pegged value.
- **Wallets**: custodial (platform-managed, default) + optional external via wagmi/viem.
- **Background jobs**: a scheduled worker (node-cron or Next cron route) for escrow
  auto-release timers and the reminder cap.

## The three roles + the hard two-database rule

- **Worker** (job seeker) and **Client** (job poster) — both live in ONE `User` table in the
  Platform DB, distinguished by a role enum. The signup UI is a toggle over that shared table.
- **Admin/Jury** — a genuinely **separate application surface** with its **own auth** and its
  **own database**.

> **CRITICAL, HONOR FOREVER:** The Admin/Jury DB never holds a real foreign key into the
> Platform DB — only plain ID references (userId, hireId, phaseId…). Any admin screen needing
> real platform data goes through a **bridge service** (a server module) that queries the
> Platform DB by ID and returns a sanitized result. Built in Phase 10; respected from Phase 1's
> schema onward.

## Design tokens (from the `.dc.html` design pack — the source of truth)

Defined in `src/app/globals.css`, exposed to Tailwind via `@theme inline`.

**Neutrals — swap by theme (`data-cw-theme`):**
| token | dark | light | Tailwind |
|---|---|---|---|
| bg | `#0A0A0A` | `#FAF7F2` | `bg-bg` |
| card | `#151312` | `#FFFFFF` | `bg-card` |
| card2 | `#1D1A18` | `#F2ECE2` | `bg-card2` |
| card3 | `#100E0D` | `#F4EEE5` | `bg-card3` |
| ink (text) | `#F5EFE6` | `#1A1512` | `text-ink` |
| ink2 | `#B8B2A8` | `#575047` | `text-ink2` |
| ink3 | `#756F68` | `#8E867C` | `text-ink3` |

Border hairlines come from a white/ink alpha scale (`--w03`…`--w25`), exposed as
`border-hair` (w06), `border-line` (w08), `border-line-strong` (w16).

**Accents — constant across themes:**
| token | hex | Tailwind | meaning |
|---|---|---|---|
| bronze | `#D9A066` (hover `#E8B583`, strong `#A85F2E`) | `bg-bronze` / `text-bronze` | brand / primary CTA |
| emerald | `#34E89A` | `text-emerald` | success / released / paid |
| amber | `#FFC46B` | `text-amber` | warning / verified tier / pending |
| ember | `#E0563A` | `text-ember` | danger / disputed / rejected |

**Fonts:** Italiana (display/headings → `font-display`), Outfit (body/UI → `font-sans`).
Loaded via `next/font` in `src/app/layout.tsx`.

**StatusBadge tone legend:** draft→neutral, info→bronze, warning→amber, success→emerald,
danger→ember. Keep status colors consistent everywhere.

## Conventions

- **Components**: shared primitives in `src/components/ui/` (barrel export `@/components/ui`).
  Feature components live under their feature folder. Screens map to design-pack codes
  (PUB-xx, AUTH-xx, WK-xx, CL-xx, ADM-xx) — every new screen must match its counterpart in the
  design pack.
- **Files**: PascalCase for component files, camelCase for utilities/helpers.
- **Money rule**: all money-handling code stays on **testnet** until a professional
  smart-contract audit. Never wire real funds.
- **Theming**: never hardcode hex in components — use the token utilities so both themes work.
- **Verify + commit** at the end of every phase (the build manual's checklist), then update
  this file and `PROGRESS.md`.

## Build phases

- [x] **Phase 0** — Setup, design system, theming, UI primitives, this file — *done*
- [x] **Phase 1** — Two databases (Prisma ×2), full data model, seed data — *done*
- [x] **Phase 2** — Consumer auth (Worker/Client toggle, sessions, KYC-tier gating) — *done*
- [x] **Phase 3** — Public marketing site (Home hero + all PUB pages) — *done*
- [x] **Phase 4** — Worker dashboard (all WK screens, mock money) — *done*
- [x] **Phase 5** — Client dashboard (all CL screens + Post-a-Job, mock money) — *done · first demoable milestone*
- [x] **Phase 6** — Escrow smart contracts (Solidity/Hardhat, testnet) — *done (local tests; Amoy deploy pending user)*
- [x] **Phase 7** — Wire escrow into the app (live on local chain; Amoy = swap env) — *done*
- [x] **Phase 8** — Auto-release timer + reminder-cap worker — *done*
- [x] **Phase 9** — Wallet layer (custodial + external) — *done*
- [x] **Phase 10** — Admin/Jury console (separate app + DB + bridge service) — *done*
- [x] **Phase 11** — Complaint → triage → commit-reveal jury → verdict — *done*
- [x] **Phase 12** — Notifications, messaging, reviews — *done*
- [x] **Phase 13** — Hardening (edge cases, tests, security, mobile/a11y, pre-mainnet checklist) — *done · feature-complete on testnet*

## Data layer (Phase 1)

- **Two Prisma schemas / two Postgres DBs** (native PG17 on `localhost:5432`):
  - `prisma/platform/schema.prisma` → `chainwork_platform` (`DATABASE_URL`) → client generated to `src/generated/platform`, singleton at `src/lib/platformDb.ts` (`platformDb`).
  - `prisma/admin/schema.prisma` → `chainwork_admin` (`ADMIN_DATABASE_URL`) → client generated to `src/generated/admin`, singleton at `src/lib/adminDb.ts` (`adminDb`).
- **Boundary enforced in schema**: the Admin DB's cross-references (`platformUserId`, `subjectHireId`, `subjectPhaseId`, `complaintId`) are plain scalar columns — NO Prisma relations/FKs cross the two datasources. Verified: every FK in the admin migration references only admin tables.
- **Generated clients are gitignored** (`/src/generated`); regenerated by `postinstall` / `npm run db:generate`.
- **Scripts**: `db:migrate:platform`, `db:migrate:admin`, `db:generate`, `db:seed`, `db:reset`, `db:studio:platform`, `db:studio:admin`.
- **Seed** (`prisma/seed.ts`, idempotent): mirrors the design pack — the 3-phase "Shop interior rewiring" hire (Ravi Kumar / Imran K.; Phase 1 RELEASED, Phase 2 "Wiring & panel" ₹8,000 DISPUTED, Phase 3 PENDING_FUNDING), the ADM-12 dispute "Client #4521 vs Worker #1187" (STANDARD/5 jurors) in the admin DB, and all 19 ADM-17 PlatformConfig rows. Demo logins: workers/clients password `password123` (e.g. `ravi@chainwork.dev`, `imran@chainwork.dev`); admins password `admin123` (e.g. `root@chainwork.local`).
- **PhaseStatus** enum is the escrow spine: PENDING_FUNDING → FUNDED → IN_PROGRESS → DELIVERED → VERIFICATION_WINDOW_OPEN → RELEASED, plus DISPUTED / AUTO_CANCELLED.

## Auth layer (Phase 2)

- **Stack swap (deliberate):** the manual specifies Auth.js/NextAuth, but on Next.js 16
  (ahead of NextAuth's stable window) we use a **custom credentials + JWT-cookie session**:
  `jose` (edge-safe) + `bcryptjs`. Same guarantees (real server sessions, role claims, route
  protection), lower risk. If we ever adopt NextAuth, this is the layer to replace.
- **Files:** `src/lib/auth/jwt.ts` (edge-safe sign/verify — shared with proxy), `session.ts`
  (httpOnly cookie `cw_session`, 7-day), `currentUser.ts` (`getCurrentUser`, React-cached),
  `guards.ts` (`requireUser` / `requireRole` / **`assertKycVerified`** — THE KYC gate),
  `verification.ts` (OTP / email / reset tokens, mocked sends → server console `[MOCK ...]`),
  `password.ts`. Server actions in `src/features/auth/actions.ts`. Secret: `AUTH_SECRET` in `.env`.
- **THE KYC GATE lives in `guards.ts` → `assertKycVerified(user, returnTo)`.** Every money
  action (Phases 5/7/9) must call it first; it redirects unverified users to
  `/kyc?reason=money&returnTo=…` (soft-block, preserves intent) and returns them after. Tier
  order UNVERIFIED<BASIC<VERIFIED<TRUSTED; gate requires ≥ VERIFIED.
- **Route protection:** `src/proxy.ts` (Next 16 renamed `middleware`→`proxy`). Protects
  `/dashboard`, `/onboarding`, `/kyc`, `/verify/*`; role-scopes `/dashboard/worker|client`.
- **Flow:** signup (Worker/Client toggle → one User table) → phone OTP (mandatory, first) →
  email verify (optional to proceed; required before posting/applying) → onboarding (AUTH-07/08)
  → KYC (AUTH-09, mock auto-approve to VERIFIED) → dashboard. Mocks logged to server console;
  TODOs mark where real SMS/email/KYC providers plug in.
- **Dev quick-login** (`DevLoginPanel`, dev-only via NODE_ENV) logs in as a seeded user instantly.
- Schema added: `User.dateOfBirth`, `User.onboarded`, `VerificationToken` model,
  `VerificationPurpose` enum (migration `auth_support`).
- Placeholder dashboards at `/dashboard/worker|client` (replaced by the real WK/CL dashboards
  in Phases 4/5).

## Public marketing site (Phase 3)

- **Home** (`src/app/page.tsx`) — cinematic hero + all sections, server-fetched data.
- **Inner pages** in the `(marketing)` route group with a shared layout (solid nav + slim
  footer): `/about`, `/how-it-works`, `/pricing`, `/blog`, `/blog/[slug]`, `/categories`,
  `/jobs`, `/contact`, `/legal`. 404 at `src/app/not-found.tsx`.
- **Shared** in `src/features/public/`: `PublicNav` (hero/solid variants + mobile drawer),
  `PublicFooter` (full/slim + the de-emphasized "Platform admin" → `/admin/login` link),
  `Logo`, `queries.ts` (featured jobs / verified workers / categories / blog — all from seed).
- **3D hero:** `HeroScene.tsx` (three + @react-three/fiber, bronze interlocking chain-links +
  forge sparks, lights only — no external HDR so it works offline/CSP), wrapped by `Hero.tsx`
  which lazy-loads it (`next/dynamic`, ssr:false) and falls back to a static bronze gradient if
  WebGL is unavailable or reduced-motion is set. Reveal keyframes (`cw-title-up`, `cw-fade-*`)
  in globals.css.
- **BlogPost** model added to the platform schema (migration `blog`) + 4 seeded posts; feeds
  PUB-05/06 and Phase 10's ADM-15 blog moderation.
- Verified in browser: 3D hero (dark + light), all sections with real data, theme toggle across
  pages, mobile (hamburger + stacked). Marketing pages prerender at build.

## Worker dashboard (Phase 4)

- **Shell:** `src/app/dashboard/worker/layout.tsx` → `WorkerChrome` (client) — sidebar + top bar
  (wallet chip w/ token toggle, notifications, theme, logout), responsive with a mobile drawer.
  Enforces WORKER role.
- **All 17 WK screens** under `src/app/dashboard/worker/`: `/` (WK-01), `/profile` (+`/edit`),
  `/find-jobs`, `/jobs/[id]`, `/applications`, `/rates`, `/posts` (+`/new`), `/hires` (+`/[id]`),
  `/earnings`, `/messages`, `/reviews`, `/notifications`, `/settings`, `/complaint`.
- **Reusable components** (used again by Client in Phase 5): `src/features/shared/PhaseTracker.tsx`
  (fund→delivered→released timeline, `actionsByPhase` slot) and `ContractRenderer.tsx`. Status→badge
  mapping in `src/features/shared/status.ts`; small primitives in `dashboard-ui.tsx`; INR/date
  helpers in `src/lib/format.ts`.
- **Data:** `src/features/worker/queries.ts` (all live reads, scoped to the logged-in worker).
- **Actions** (`src/features/worker/actions.ts`): REAL — `saveWorkerProfileAction` (edits every
  WK-02 field incl. skills+proficiency), `applyToJobAction` (creates JobApplication, powers the
  post→apply→hire loop). STUBS — `markPhaseDeliveredAction`/`withdrawAction`/`checkInAction`/
  `sendMessageAction`/`submitComplaintAction` log a `TODO Phase 7/8/9/11/12` and never fake success
  (surfaced via `StubButton`).
- Blog "My Posts" filters BlogPost by `authorName`; post editor + complaint filing are stubbed to
  their owning phases (10 / 11).
- Verified: 17/17 screens render server-side with a worker session; profile edit persists;
  PhaseTracker+Contract show the real 3-phase shop-rewiring hire; withdraw logs its stub.

## Client dashboard (Phase 5)

- **Shell:** `src/app/dashboard/client/layout.tsx` → `ClientChrome` (sidebar + top bar with a
  "Post a Job" CTA and escrow-total chip, mobile drawer). Enforces CLIENT role.
- **All 13 CL screens** under `src/app/dashboard/client/`: `/` (CL-01), `/profile`, `/post-job`
  (the multi-step builder), `/jobs` (My Jobs), `/applicants` + `/jobs/[id]/applicants` (CL-05),
  `/hires` (+`/[id]` = CL-07 hire management), `/payments`, `/messages`, `/reviews`,
  `/notifications`, `/settings`, `/complaint`.
- **Reuses** `PhaseTracker` + `ContractRenderer` (client-side phase controls passed via
  `actionsByPhase`: Fund / Approve-&-Release / Request Changes). Shared `StubButton` now lives in
  `src/features/shared/`.
- **Data:** `src/features/client/queries.ts`. **Actions** (`src/features/client/actions.ts`):
  REAL — `postJobAction` (creates Job + JobRoleLineItems; a published job appears immediately in
  the worker's Find Jobs), `acceptApplicantAction` (creates Hire + Contract + Phase, increments
  hiredCount, notifies the worker; partial hiring supported), `rejectApplicantAction`. STUBS —
  fund/approve/requestChanges/markNoShow/proposeSettlement/addFunds/message/complaint log a
  `TODO Phase 7/8/9/11/12` and never fake success.
- **Post-a-Job builder** (`PostJobBuilder.tsx`): 5 steps (basics → roles → logistics → funding →
  review), dynamic multi-role line items with auto-summed budget, publish vs save-draft.
- **Verified end to end (first demoable milestone):** posted a multi-role job → it appeared in the
  worker's Find Jobs; accepted an applicant → real Hire+Contract+Phase on CL-07 (Phase Tracker +
  Contract, on-chain escrow "—" since unfunded) and the same hire renders on WK-11; partial-hire
  slot count decremented; Fund Phase logged its Phase-7 stub. 14/14 CL routes render server-side.

## Escrow smart contracts (Phase 6)

- **Location:** self-contained Hardhat project in **`/contracts`** (separate from the Next app;
  its own package.json/node_modules). Solidity 0.8.24, OpenZeppelin 5.
- **`contracts/contracts/PhaseEscrow.sol`** — the money layer. Per-phase escrow keyed by a
  `bytes32 phaseId`. Functions: `fundPhase`, `markDelivered`, `approveRelease`, `autoRelease`,
  `raiseDispute`, `resolveDispute(workerBps)`, `proposeSettlement`/`acceptSettlement`,
  `refundToClient`, `lockStake`/`refundStake`/`forfeitStake`, `pause`/`unpause`. Uses
  AccessControl + ReentrancyGuard + Pausable + SafeERC20. `MockStablecoin.sol` = test ERC-20 `cwINR`.
- **Roles:** `DEFAULT_ADMIN_ROLE` (multisig in prod), **`ATTESTOR_ROLE`** (backend oracle/relayer —
  markDelivered/autoRelease/refund/approve-relay/stake ops), **`DISPUTE_ROLE`** (raise/resolve —
  jury verdict executor), `PAUSER_ROLE`.
- **TRUST BOUNDARY (Phase 7 must respect):** the backend is the attestor. `markDelivered(phaseId,
  releaseEligibleAfter)` takes the off-chain business-day deadline; `autoRelease` reverts before it
  (timing enforced on-chain). No function drains escrow — funds only reach the recorded worker/client.
- **Tests:** `contracts/test/PhaseEscrow.test.js` — **31 passing**, every rule + edge case
  (double-fund, unfunded release, non-party approve, auto-release before/after, dispute-freeze,
  verdict split math, settlement, stake forfeit, pause, no-drain, reentrancy via a malicious token).
- **Addresses for Phase 7:** `scripts/deploy.js` writes `contracts/deployments/<network>.json`
  (gitignored — regenerated per deploy). ABI at `contracts/artifacts/contracts/PhaseEscrow.sol/PhaseEscrow.json`.
  Deploy: `npm test` (local), `npm run deploy:amoy` (needs `contracts/.env` — throwaway key + Amoy
  faucet MATIC; see `contracts/README.md`). **Amoy deploy is a user step (needs a testnet wallet).**

## Escrow wired into the app (Phase 7)

- **Chain service** in `src/lib/chain/`: `config.ts` (env + viem chain + ABIs; `phaseEscrow.abi.json`
  is committed so the app doesn't depend on the contracts build), `keystore.ts` (dev custodial
  wallets — userId→HD-account-index from the dev mnemonic, index 0 = platform relayer/attestor;
  persisted to gitignored `.chain-keystore.json`; writes the real address to `Wallet.custodialAddress`),
  `escrow.ts` (viem ops: `fundPhase`/`markDelivered`/`approveRelease`/`autoRelease`/`raiseDispute`/
  `resolveDispute`/`refundToClient`/`lockStake`/`forfeitStake` + reads). Uses viem. Everything server-only.
- **Real money actions replace the stubs:** client `fundPhaseAction` (KYC-gated + **sequential
  funding** enforced; mints test stablecoin as a mock on-ramp, approves, funds — signed by the
  client's custodial wallet), worker `markPhaseDeliveredAction` (relayer relays delivery + a
  2-working-day deadline; on-chain timing gate), client `approvePhaseAction` (releases to the worker,
  fires the **Forge Complete** animation), `requestChangesAction` (revision reset), `markNoShowAction`
  (refund-to-client rollback + strike). Each records an `EscrowTransaction` with the real tx hash and
  handles pending/success/error states.
- **Forge Complete** celebration: `src/features/shared/ForgeComplete.tsx` (spark burst, keyframes in
  globals.css), triggered by the `released` flag from the approve action.
- **Env (`.env`, gitignored):** `CHAIN_RPC_URL`, `CHAIN_ID`, `CHAIN_MNEMONIC`, `CHAIN_RELAYER_INDEX`,
  `CHAIN_ESCROW_ADDRESS`, `CHAIN_TOKEN_ADDRESS`. Local addresses are Hardhat-deterministic
  (`PhaseEscrow 0xe7f1…0512`, `MockStablecoin 0x5FbD…0aa3`) so they stay valid across node restarts.
- **VERIFIED end to end on the local chain:** funded a phase (mint→approve→fundPhase txs), worker
  marked delivered (markDelivered tx), client approved (approveRelease tx) → the worker's **real
  on-chain balance went 0 → 2,500 cwINR**, the phase escrow emptied to 0, and FUND/RELEASE tx hashes
  were recorded. TS + prod build pass.

## Running the app with the chain (Phase 7+)

The escrow flows need the chain running. Local dev, three terminals:
1. `cd contracts && npx hardhat node` (JSON-RPC on :8545)
2. `cd contracts && npx hardhat run scripts/deploy.js --network localhost` (writes deployments +
   the addresses that are already in `.env`)
3. `npm run dev` (the app). Postgres (PG17 service) must be running too.
For the public testnet instead: deploy to Amoy (`contracts/README.md`) and point the `CHAIN_*` env
vars at Amoy + a real relayer key.

## Escrow timing engine (Phase 8)

- **Working-days calendar** `src/lib/calendar/businessDays.ts` (skips weekends + configurable
  holidays; `addBusinessDays` / `businessDaysBetween`). Unit tests `businessDays.test.ts`
  (node:test, run `npx tsx --test src/lib/calendar/businessDays.test.ts` — 6 pass). Phase 7's crude
  deadline was refactored to use this (worker `markDelivered` now uses the config window + holidays
  and resets `reminderCount`).
- **PlatformConfig reader** `src/lib/config/platformConfig.ts` reads the ADM-17 knobs from the Admin
  DB (global settings, not user data — no cross-DB relation): verification window, reminder cap,
  delivery-stake threshold, worker grace days, strike-suspend threshold, holidays.
- **The tick worker** `src/lib/escrow/tick.ts` → `runEscrowTick()`: (1) sends ≤ reminderCap reminders
  during a verification window then calls the contract's `autoRelease` once the window lapses +
  reminders spent (the contract enforces it can't fire early); (2) symmetric worker ghosting — a
  funded phase past its due date gets reminders then auto-cancels (`refundToClient` rollback + stake
  forfeit + strike + suspend past threshold). Every transition is status-guarded → idempotent.
- **Trigger:** `src/app/api/cron/escrow/route.ts` (Node runtime, `CRON_SECRET`-protected). Local
  runner `worker/escrow-cron.mjs` (`node worker/escrow-cron.mjs`) hits it each minute; in prod a host
  cron calls the same URL. `CRON_SECRET` in `.env`.
- **ADM-09 data:** `src/lib/escrow/pendingConfirmations.ts` → `getPendingConfirmations()` (Phase 10
  admin console reads via the bridge — phases mid-window, reminders sent, auto-release countdown).
- **Verified:** calendar math (6 tests); a phase auto-released on-chain after exactly 2 reminders,
  paying the worker (0 → ₹3,000), with the repeat tick a no-op (idempotent).

## Wallet layer (Phase 9)

- **`src/lib/chain/wallet.ts`** — custodial + external wallets. `payoutAddressFor(userId)`
  (external if linked, else custodial), `getWalletSummary` (provisions custodial + reads the LIVE
  on-chain balance in ₹), `topUpCustodial` (mock fiat ON-ramp = relayer mints), `withdrawCustodial`
  (mock OFF-ramp = real on-chain transfer custodial→relayer sink), `linkExternalAddress` /
  `unlinkExternalAddress`. `fundPhase` now pays the worker's payout address.
- **Actions** `src/features/wallet/actions.ts`: `withdrawAction`, `addFundsAction`,
  `verifyAndLinkWalletAction` (viem `verifyMessage` on the signed ownership proof → link),
  `unlinkWalletAction`. External connect UI `ExternalWalletConnect.tsx` (injected wallet via
  `window.ethereum` + `personal_sign`; MetaMask/Coinbase wired, WalletConnect flagged as needing a
  projectId + wagmi). WK-12 Earnings + CL-08 Payments show the live balance, the wallet address,
  the connect UI, and explorer links (`explorerTxBase()` — Amoy link on testnet, none locally).
- **KEY MANAGEMENT (⚠ pre-mainnet):** custodial keys are HD accounts from a DEV mnemonic
  (`src/lib/chain/keystore.ts`), gas pre-funded on the local chain. This is a LOCAL-DEV stand-in
  ONLY. Before mainnet, custody MUST move to an HSM or a managed custody provider, with a gasless
  meta-tx relayer sponsoring gas, and the on/off-ramp `TODO`s replaced by a real payment processor.
  (Tracked in the Phase 13 pre-mainnet checklist.)
- **Verified:** signature ownership proof (accepts real signer, rejects impostor); on-ramp
  ₹0→₹10,000 through the UI; off-ramp moves funds out to ₹0; wallet UI renders the real address +
  connect options.

## Admin & Jury console (Phase 10)

- **Separate surface under `/admin`.** Own auth, own chrome, its own DB (`chainwork_admin`). Consumer
  sessions never reach it and vice-versa.
- **Auth:** `src/lib/admin/session.ts` + edge-safe `src/lib/admin/jwt.ts` (cookie `cw_admin`,
  namespaced key, 8h). AUTH-11 login = email + password + **mandatory TOTP 2FA** (`src/lib/admin/totp.ts`,
  otplib v13 `generateSync`/`verifySync`; dev secret `JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP` shared by all
  seeded admins since their seeded secrets are too short — the check itself is real; the current code
  is logged to the server console in dev). **No signup.** Proxy guards `/admin/*` except `/admin/login`.
- **THE BRIDGE SERVICE `src/lib/admin/bridge.ts` — the ONLY module under the admin surface that
  imports `platformDb`.** Every platform read/sanctioned-write for admin code goes through it, by
  primary-key id, sanitized (emails/phones masked). Verified by grep: no admin page/feature imports
  platformDb. (Admin-DB reads use `adminDb` directly — that's the admin's own DB, no boundary.)
- **Role scoping:** `src/lib/admin/roles.ts` (7 roles → visible nav + read-only Analyst). Enforced at
  the route level via `requireAdminAccess(navKey)` (redirects) AND in the sidebar (`visibleNav`).
  JURY sees only its assigned cases (ADM-11).
- **Immutable audit log:** `src/lib/admin/audit.ts` `writeAudit(...)` — every privileged action
  (login, KYC approve, moderation, triage, settle, config change) appends a who/what/when/before/
  after row. ADM-19 reads it.
- **Screens** (`src/app/admin/(console)/*`, ADM-02..19): dashboard, users (KYC queue)+[id], jobs,
  blog-moderation, complaints (4-lane triage), ongoing, settlements (executes verdict on-chain via
  the contract), confirmations (Phase 8 data via bridge), payments, disputes+[id] (full commit-reveal
  voting console, Phase 11), jury+[id], reports, settings (edits PlatformConfig → audit), roles, audit.
- **Verified live:** separate login + real 2FA; consumer cookie doesn't grant admin; Analyst nav
  restricted to 3 sections + bounced from /admin/settings; login written to the audit log; bridge is
  the sole platform-DB importer. Admin login: `root@chainwork.local` / `admin123` + the console-logged
  2FA code.

## Peer-jury dispute engine (Phase 11)

- **Engine: `src/lib/admin/jury.ts`** (admin-DB only; parties passed in via the bridge, never a direct
  platform read). Commit hash is canonical: `voteCommitHash(choice, splitPct, salt) =
  keccak256(toHex(`choice|splitPct|salt`))` — the client (`JuryVoteControls.tsx`) computes the SAME
  hash with viem, so it must match server-side on reveal.
- **Filing is real** both sides: WK-17 `ComplaintForm` / CL-13 `ClientComplaintForm` →
  `submitComplaintAction(hireId, category, description)` writes a real `Complaint` (client side also
  records the subject `phaseId`).
- **Triage (ADM-05, `triageComplaintAction`)** has 4 lanes; the **FINANCIAL** lane:
  `bridge.bridgeComplaintForEscalation(id)` → `jury.escalateToJury(...)` → `bridge.bridgeMarkPhaseDisputed`.
  `escalateToJury` freezes escrow on-chain best-effort (`chain.raiseDispute`, try/catch — a seed phase
  may be unfunded), opens an **anonymized** `DisputeCase` (`anonLabel` → "Client #1234"), sets the
  value tier + panel (**SMALL <₹5000→3, STANDARD <₹20000→5, LARGE→7**), and assigns a random panel of
  ACTIVE jurors **excluding both parties** (conflict guard), creating a `JuryAssignment` + empty
  `JuryVote` per juror.
- **Commit-reveal:** `commitVote` stores the hash only, refuses a second commit, and flips the case
  `COMMIT→REVEAL` once every panellist has committed. `revealVote` recomputes the hash and **rejects a
  mismatch** (can't change a vote after seeing others); stores `revealedSplitPct` only for SPLIT.
- **Tally: `tallyAndFinalize`** — quorum = `revealed*2 > panelSize`; the majority choice wins; a SPLIT
  verdict's % is the **median** of proposed %s (`median()`), not the mean. Settles stakes (majority
  `+FEE(100)`, minority `-SLASH(200)`), updates each juror's `agreementRate`, sets `verdictChoice`/
  `verdictSplitPct` and status `VERDICT`. The frozen escrow is then directed on-chain by the existing
  ADM-08 `settleDisputeAction` (maps the verdict to worker basis-points).
- **Appeals: `appealCase`** — once per case only; opens a fresh 7-juror `DisputeCase`
  (`appealOfCaseId`) and marks the original `APPEALED`.
- **Actions** (`src/features/admin/actions.ts`): `commitVoteAction`/`revealVoteAction`/
  `finalizeVerdictAction`/`appealCaseAction`, all audit-logged; `assertJurorOnCase` gates commit/reveal
  to a JURY/ROOT admin actually on the panel.
- **Verified** by driving the real engine through a throwaway `api/verify11` route (since deleted;
  it parked seeded jurors as ON_LEAVE so the random panel drew only test jurors, then restored them):
  escalate → 5-panel; all commit → REVEAL; **wrong-salt reveal rejected**; 3 SPLIT(60/40/50) + 1
  minority reveal → verdict **SPLIT @ median 50**; majority stakes 1000→1100 (rep 84%), minority
  1000→800 (rep 64%); first appeal opened, second rejected. To re-verify later, recreate that route
  or add a `node:test`. NOTE: the on-chain freeze/settle paths themselves were proven in Phases 7/10;
  the verify route used a synthetic phase id so its `frozen` was false by design.

## Communication & reputation layer (Phase 12)

- **Notifications — `src/lib/notify/`.** `notify({userId,type,title,body?,linkUrl?,channels?})` is the
  single entry point: it writes the in-app `Notification` row (drives the bell + center) then fans out
  to the additional channels for that event type (`DEFAULT_CHANNELS` — money/dispute events also email,
  disputes also SMS, MESSAGE/REVIEW are in-app only). `notifyMany` for panels. Channel adapters live in
  `channels.ts` — **mocked** (console.log), with the real Resend/Twilio call sketched in a comment;
  swapping in a provider is a drop-in. `notify()` fan-out is best-effort (`Promise.allSettled`) so a
  channel failure never breaks the triggering action. Existing inline `notification.create` sites in
  escrow/jury flows still work; new events (message received, review received, hire completed) use `notify()`.
- **Notification center** — shared client `src/features/shared/NotificationCenter.tsx` (used by both
  WK-15/CL-11 pages): click marks-read (`markNotificationReadAction`, user-scoped) + follows `linkUrl`;
  **Mark all read** (`markAllNotificationsReadAction`). Actions in `src/features/shared/notificationActions.ts`.
  The bell badge = `getUnreadNotificationCount` passed from each dashboard layout to the chrome.
- **Toasts** — `src/features/shared/Toast.tsx`: `ToastProvider` + `useToast()`, 4s auto-dismiss, mounted
  around `{children}` in Worker/Client chrome. Keyframe `cwToastIn` in globals.css.
- **Messaging (WK-13/CL-09)** — `sendMessageAction(hireId, body)` on both `features/*/actions.ts`:
  verifies the sender is a party to the hire, creates a `Message`, `notify()`s the other side (in-app),
  revalidates. Composers are controlled + Enter-to-send + toast on error. Thread queries now surface
  **every** hire (so a chat can be started), newest-activity first. Near-real-time = `ThreadPoller`
  (`router.refresh()` every 5s, pauses when tab hidden) — deliberate v1 over websockets.
- **Reviews (WK-14/CL-10)** — engine `src/lib/reviews.ts` `submitReview()`: a review is allowed only on
  a **COMPLETED** hire, by the correct party, **once per direction** (`@@unique([hireId,direction])`).
  A `CLIENT_TO_WORKER` review calls `recomputeWorkerRating()` → updates `WorkerProfile.ratingAvg` +
  sub-dimensions (feeds juror eligibility min-rating + ranking). Client subjects have no star field
  (only `escrowReliabilityScore`, which is funding-based) — their worker reviews just display. UI =
  shared `ReviewForm.tsx` (star pickers; the concrete server action is passed in as a prop, so one
  component serves both directions). `submitReviewAction` wrappers in each `actions.ts` bind direction+author.
- **Hire completion — `src/lib/hires.ts` `maybeCompleteHire(hireId)`.** A hire → COMPLETED once **all**
  phases are RELEASED (idempotent: only acts on ACTIVE→COMPLETED); bumps worker `completedJobsCount`,
  notifies both parties to review. Called from `approvePhaseAction` (last approval) and the tick.ts
  auto-release path. **This is what makes reviews reachable** — nothing set COMPLETED before Phase 12.
- **Polish** — `Skeleton`/`SkeletonList` in `dashboard-ui.tsx` + `cw-skeleton` shimmer in globals.css;
  `loading.tsx` at `dashboard/worker` and `dashboard/client` roots covers all child routes.
- **Verified:** browser — sent a real hire-scoped message (persisted, correct thread), bell showed
  4 unread → Mark-all-read cleared it. Scripted (temp `api/verify12`, since deleted, snapshotting +
  restoring the worker profile & notifications): completion → COMPLETED + jobs+1 + idempotent; review
  recomputed aggregate to 5★; duplicate + incomplete-hire reviews rejected; REVIEW notification sent.

## Hardening (Phase 13) — feature-complete on testnet

- **Docs in `docs/`:** [EDGE_CASES.md](docs/EDGE_CASES.md) (Section-19 registry → how each is handled),
  [SECURITY.md](docs/SECURITY.md) (findings + fixes), [PRE_MAINNET_CHECKLIST.md](docs/PRE_MAINNET_CHECKLIST.md)
  (blockers before real money — audit first; **testnet only until done**).
- **Tests — `npm test`** (`node --import tsx --test "src/**/*.test.ts"`, 18 pass) **+ `npm run test:contracts`**
  (31 pass). Suites: `src/lib/admin/voting.test.ts` (commit-reveal integrity + median + tally + quorum),
  `src/lib/admin/boundary.test.ts` (**two-DB boundary as a test** — scans admin trees, fails if any file
  but `bridge.ts` imports platformDb), `src/lib/calendar/businessDays.test.ts`, `src/lib/rateLimit.test.ts`.
  Pure jury logic was extracted from `jury.ts` into **`src/lib/admin/voting.ts`** (no server-only) so it's
  unit-testable; `jury.ts` re-exports `voteCommitHash` for existing importers.
- **Security fix — login brute-force.** `src/lib/rateLimit.ts` = in-memory sliding-window limiter;
  applied to `loginAction` and `adminLoginAction` (5 tries / 15 min per identifier, `rateLimitReset` on
  success). In-memory = single-instance only; a shared store (Redis) is a pre-mainnet item. Other auth
  surfaces already had controls (OTP throttle/attempt cap, generic no-enumeration errors, 2FA).
- **Chain resilience (also committed just before Phase 13):** `getWalletSummary` degrades to the cached
  balance + `live:false` when the RPC is down (earnings/payments show "cached · chain offline") instead of
  500-ing. Money movements still require the chain and fail loudly.
- **a11y:** search inputs got `aria-label` + focus rings; icon buttons already labeled, `lang` set, no
  unlabeled imgs. Mobile verified at 375px (sidebar → drawer).

## Real SMS delivery (post-Phase-13 integration)

- **`src/lib/sms.ts`** — pluggable SMS service, selected by `SMS_PROVIDER` in `.env`:
  `"twilio"` (worldwide; needs `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`/`TWILIO_FROM`; a trial account
  only texts console-verified numbers), `"fast2sms"` (India, OTP route only; needs `FAST2SMS_API_KEY`),
  or `"mock"`/unset (console log — the dev default). Plain REST calls, no SDK dependency.
  `toE164()` normalizes stored 10-digit numbers using `SMS_DEFAULT_COUNTRY_CODE` (default `+91`).
- **Fail-safe by design:** missing credentials or a provider error **falls back to the mock console
  log** (with a `[SMS] … falling back` warning) so signup never blocks on a misconfigured box; the
  result reports `delivered: false` + the error.
- **Wired into:** `sendPhoneOtp` (`src/lib/auth/verification.ts`) for signup/login OTP texts, and the
  notification SMS channel (`src/lib/notify/channels.ts`). Verified E2E in mock mode (signup →
  `[SMS mock] → …` line → OTP verify). Restart the dev server after changing SMS env vars.
- **Email is real too — `src/lib/email.ts`** (same pattern): `EMAIL_PROVIDER` = `"resend"`
  (needs `RESEND_API_KEY`; without a verified domain, from `onboarding@resend.dev` TO the Resend
  account's own email only), `"brevo"` (needs `BREVO_API_KEY`), or `"mock"`/unset. `EMAIL_FROM`
  sets the sender; `absoluteUrl()` builds emailed links from `APP_BASE_URL` (localhost:3000 dev).
  `emailShell()`/`emailButton()` give a minimal branded dark template. Same fail-safe fallback to
  a console log (`[EMAIL mock] … | link: …`). Wired into: `sendEmailVerification` (verify link),
  `sendPasswordReset` (**routed to the account's email on file, or via SMS if the account has no
  email** — fixed the old bug of "emailing" whatever identifier the user typed), and the notify
  email channel. Verified in mock mode: forgot-password → absolute link logged → link opens the
  reset form.

## Reference files (not in this repo — on the developer's machine)

- Spec v2: `C:\Users\ASUS\Downloads\ChainWork_Complete_Specification_v2.docx` (23 sections;
  §13 phase escrow, §15 data model, §19 edge-case registry).
- Build manual: `C:\Users\ASUS\Downloads\ChainWork_ClaudeCode_Build_Manual.md`.
- Design pack (6 `.dc.html`): `C:\Users\ASUS\Downloads\Updated ChainWork\`.
