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
- [ ] Phase 7 — Wire escrow into the app (live testnet)
- [ ] Phase 8 — Auto-release timer + reminder-cap worker
- [ ] Phase 9 — Wallet layer (custodial + external)
- [ ] Phase 10 — Admin/Jury console (separate app + DB + bridge service)
- [ ] Phase 11 — Complaint → triage → commit-reveal jury → verdict
- [ ] Phase 12 — Notifications, messaging, reviews
- [ ] Phase 13 — Hardening (edge cases, tests, security, mobile/a11y, pre-mainnet checklist)

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

## Reference files (not in this repo — on the developer's machine)

- Spec v2: `C:\Users\ASUS\Downloads\ChainWork_Complete_Specification_v2.docx` (23 sections;
  §13 phase escrow, §15 data model, §19 edge-case registry).
- Build manual: `C:\Users\ASUS\Downloads\ChainWork_ClaudeCode_Build_Manual.md`.
- Design pack (6 `.dc.html`): `C:\Users\ASUS\Downloads\Updated ChainWork\`.
