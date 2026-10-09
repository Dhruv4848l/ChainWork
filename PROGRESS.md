# ChainWork — Build Progress Tracker

> A shareable, at-a-glance map of how much of ChainWork is built. Updated after every
> verified phase. Each phase is one step of the build manual; a phase is only marked done
> once its ✅ verification checklist passes and it's committed to git.

**Overall: the build (Phases 0–13) and the payment rework (P0–P7) are both complete.**
ChainWork is live at **https://chain-work-afdm.vercel.app** with dummy money (`PAYMENT_MODE=demo`).
PhaseEscrow v2 is deployed on Polygon Amoy, and one item (relayer gas) is left before it can
switch to real test transactions.

> **What's next:** [docs/ROADMAP.md → Future path](docs/ROADMAP.md#future-path). In order:
> 1. Finish the switch to testnet.
> 2. The rest of Stage 2 (shared rate limits, demo-login check, chain-health card).
> 3. Finish the half-built buttons.
> 4. Build the features the pitch promises.
>
> Real money stays off until the [pre-mainnet checklist](docs/PRE_MAINNET_CHECKLIST.md) is
> done, starting with a professional smart-contract audit.

_Last updated: 2026-10-09 (jury integrity fixes F2/F3, Gmail email provider)._

**Test suite today:** 102 unit · 45 contract · 26 integration · 11 browser E2E locally, plus 9 E2E
against the live site. Production build passes.

| # | Phase | Status | % |
|---|---|---|---|
| 0 | Setup + design system + theming + UI primitives | ✅ Done | 100% |
| 1 | Two databases + data model + seed data | ✅ Done | 100% |
| 2 | Consumer auth (Worker/Client toggle, KYC gate) | ✅ Done | 100% |
| 3 | Public marketing site + cinematic 3D hero | ✅ Done | 100% |
| 4 | Worker dashboard (all WK screens, mock money) | ✅ Done | 100% |
| 5 | Client dashboard + Post-a-Job (mock money) ◀ **first demoable** | ✅ Done | 100% |
| 6 | Escrow smart contracts (Solidity, testnet) ◀ **the heart** | ✅ Done | 100% |
| 7 | Wire escrow into the app (live on-chain) | ✅ Done | 100% |
| 8 | Auto-release timer + reminder-cap worker | ✅ Done | 100% |
| 9 | Wallet layer (custodial + external) | ✅ Done | 100% |
| 10 | Admin/Jury console (separate app + DB + bridge) | ✅ Done | 100% |
| 11 | Complaint → commit-reveal jury → verdict | ✅ Done | 100% |
| 12 | Notifications, messaging, reviews | ✅ Done | 100% |
| 13 | Hardening (edge cases, tests, security, a11y) | ✅ Done | 100% |

**Legend:** ✅ done · 🟡 in progress · ⬜ not started

## Milestones

- **After Phase 5** — a working marketplace on mock payments: a real, walkable demo.
- **After Phase 9** — payments are real (testnet only).
- **After Phase 13** ✅ — feature-complete on testnet. Then: professional smart-contract audit
  before anything touches real money (see [pre-mainnet checklist](docs/PRE_MAINNET_CHECKLIST.md)).
- **After P7** ✅ (2026-10-03) — the payment system rebuilt and tested in four layers.
  Receipts, a real ledger, wallet extensions, a multi-currency payment window and a
  demo/testnet switch.
- **Live in production** ✅ (2026-10-03) — deployed in demo-money mode; two critical security
  holes found and closed the same day.
- **Escrow v2 on Amoy** ✅ (2026-10-06) — the real contract is live on Polygon's test network.
- **Next:** switch production to `PAYMENT_MODE=testnet`
  ([runbook](docs/RUNBOOK_DEMO_TO_TESTNET.md)).

## Phase 0 — what got built (done 2026-07-17)

- Next.js 16 + React 19 + TypeScript + Tailwind v4 project scaffolded (`/src`, alias `@/*`).
- Design system in `src/app/globals.css`: full dark + light token palettes from the design
  pack, exposed to Tailwind via `@theme inline` so utilities re-color on theme switch.
- Theming: `data-cw-theme` on `<html>`, no-flash init script in `layout.tsx`, `ThemeToggle`
  persists to localStorage (survives refresh). Default dark.
- Fonts: Italiana (display) + Outfit (body) via `next/font`.
- UI kit in `src/components/ui/`: Button, StatusBadge, Card, Input, Modal, ThemeToggle
  (barrel export `@/components/ui`).
- `/components-preview` page renders every primitive in both themes.
- `CLAUDE.md` written (shared cross-phase memory). This tracker created.

## Phase 1 — what got built (done 2026-07-17)

- **Two physically separate PostgreSQL databases** via two Prisma schemas: `chainwork_platform`
  (Workers/Clients) and `chainwork_admin` (Admin/Jury). Both migrated cleanly.
- **Full data model** — Platform: User, Worker/ClientProfile, Category/Skill, Job +
  JobRoleLineItem (multi-role), JobApplication, Hire, Contract, Phase (the escrow spine),
  EscrowTransaction, DeliveryStake, Wallet, Review, Complaint, Message, Notification. Admin:
  AdminUser, JurorProfile, DisputeCase, JuryAssignment, JuryVote, Evidence, ModerationAction,
  AuditLog, PlatformConfig. All status enums per the spec's Appendix A.
- **Two-DB boundary enforced & verified**: the Admin DB holds only scalar ID references to the
  Platform DB (no cross-datasource foreign keys). Confirmed the bridge pattern resolves
  (admin dispute → platform phase/juror by ID).
- **Seed data mirroring the design pack**: 8 users, 5 jobs (incl. a multi-role wedding job), the
  3-phase "Shop interior rewiring" hire at mixed states, the ADM-12 dispute case with a 5-juror
  panel + commit/reveal votes + evidence, and all 19 ADM-17 PlatformConfig values.
- Client singletons (`src/lib/platformDb.ts`, `src/lib/adminDb.ts`); db npm scripts; generated
  clients gitignored + auto-regenerated on install. TypeScript compiles clean.

**Demo logins:** Workers/Clients — password `password123` (`ravi@chainwork.dev` worker,
`imran@chainwork.dev` client). Admins — password `admin123` (`root@chainwork.local`).

## Phase 2 — what got built (done 2026-07-18)

- **Custom credentials + JWT-cookie auth** (`jose` + `bcrypt`) — chosen over NextAuth for Next 16
  compatibility; real httpOnly server sessions with role claims. Full detail in `CLAUDE.md`.
- **Signup/login** with the Find Work | Post a Job toggle (both roles → one User table), phone
  OTP (mandatory, first — mock code to server console), email verification (optional to proceed,
  required before posting/applying), password reset flow.
- **Onboarding wizards** — worker (AUTH-07: headline, location, experience, skills from the
  taxonomy, languages, availability) and client (AUTH-08).
- **KYC** (AUTH-09) — upload UI + Unverified→Basic→Verified→Trusted tier bar; mock auto-approve
  to VERIFIED. **The KYC gate** (`assertKycVerified`) blocks money movement until VERIFIED and
  soft-blocks with intent preserved — reused by Phases 5/7/9.
- **Route protection** via `src/proxy.ts` (login required + role scoping); **dev quick-login**
  panel for instant seeded-user login.
- **Verified end-to-end in the browser:** signup → OTP → email → onboarding → KYC → dashboard;
  logged-out protected route redirects to login; KYC gate blocks unverified then passes after
  verifying; logout + dev-login + role routing all work.

## Phase 3 — what got built (done 2026-07-18)

- **Cinematic home** (PUB-01): a lazy-loaded Three.js hero — bronze interlocking chain-links
  with forge lighting + rising sparks — over all the marketing sections (How It Works,
  Categories, Verified Workers, Featured Jobs, Testimonials, Blog, Trust band, CTA, Footer).
  Degrades to a static bronze gradient without WebGL / with reduced motion.
- **All PUB pages:** About, How It Works (worker/client toggle), Pricing (escrow explainer),
  Blog index + post, Categories showcase, Jobs teaser, Contact (mock form + FAQs), Legal, 404.
- **Real data:** featured jobs, verified workers, category counts, and blog posts all pull from
  the seed DB. Added a `BlogPost` model + 4 seeded posts.
- **Shared chrome:** responsive nav (mobile drawer) + footer with the "Platform admin" link.
- Verified in browser: 3D hero in both themes, all sections with live data, theme toggle across
  pages, mobile layout. Fast first paint (3D bundle lazy-loaded).

## Phase 4 — what got built (done 2026-07-18)

- **All 17 Worker screens** (WK-01…17) on a responsive sidebar + top-bar shell (mobile drawer):
  dashboard, profile + edit, find jobs, job detail, applications, rates, my posts + editor,
  active hires, hire detail, earnings & wallet, messages, reviews, notifications, settings
  (incl. the Jury Duty opt-in), complaint.
- **All live reads** scoped to the logged-in worker — real seed data throughout.
- **Reusable Phase Tracker + Contract renderer** (used again by the Client dashboard in Phase 5),
  shown against the real 3-phase "Shop interior rewiring" hire (Prep released, Wiring & panel
  disputed, Finish pending).
- **Real actions:** profile edit (saves every field incl. skills + proficiency) and job application
  (powers the post→apply→hire loop). **Money/on-chain actions are honest stubs** — they log a
  `TODO Phase 7/8/9` and never fake success.
- Verified: 17/17 screens render with a worker session, profile edit persists, withdraw logs its
  stub. (Screenshots were flaky in the tooling; verified via server-side fetches + DOM reads.)

## Phase 5 — what got built (done 2026-07-18) · 🎉 first demoable milestone

- **All 13 Client screens** (CL-01…13) on a client shell (sidebar + top bar with Post-a-Job CTA +
  escrow chip, mobile drawer): dashboard, profile, **Post-a-Job builder** (5-step, multi-role,
  auto-summed budget), my jobs, applicants (+ per-job review with Fit Score), active hires,
  **hire management** (client phase controls), payments, messages, reviews, notifications,
  settings, complaint.
- **Reuses the Phase Tracker + Contract renderer** with client-side controls (Fund / Approve-&-
  Release / Request Changes / Mark No-Show / Mutual Settlement).
- **Real writes:** posting a job (Job + role line items) and accepting an applicant (Hire +
  Contract + Phase, hired-count increment, worker notification, partial hiring). **Escrow funding
  and every on-chain action stay honest stubs** (log a `TODO Phase 7/8/9`, never fake success).
- **Walked the whole loop live:** posted a multi-role job → it appeared in the Worker's Find Jobs;
  accepted an applicant → a real hire showed the Phase Tracker + Contract on the client's CL-07 and
  the same hire on the worker's WK-11; a slot count decremented; Fund Phase logged its Phase-7 stub.
- **This is a real, walkable demo: a working marketplace on mock payments.**

## Phase 6 — what got built (done 2026-07-18) · the heart

- **`PhaseEscrow` smart contract** (Solidity, Hardhat, in a separate `/contracts` project):
  per-phase escrow that funds → locks → releases only by the rules — client approval, timeout
  auto-release, jury verdict split, mutual settlement, or ghosting refund — plus the worker's
  refundable delivery stake and a pause circuit-breaker. Built on OpenZeppelin (AccessControl,
  ReentrancyGuard, Pausable, SafeERC20).
- **The auto-release timing is enforced on-chain:** the contract reverts an auto-release before
  the stored eligibility timestamp, so the backend (which relays off-chain facts) can't pay early.
  And **no function can drain escrow** — funds only ever reach the recorded worker or client.
- **31 tests, all passing**, covering every rule + the manual's edge cases: double-funding,
  releasing an unfunded phase, non-party approve, auto-release before/after timing, dispute-freeze
  blocking release, verdict split math (0/100/60-40), mutual settlement, stake forfeit, refund,
  pause, no-drain, and a real reentrancy attack (blocked by the guard).
- Deploy script writes addresses to `deployments/<network>.json` for Phase 7; testnet deploy
  instructions in `contracts/README.md`. **Everything runs locally; Amoy deploy is a user step**
  (needs a throwaway testnet wallet + free faucet MATIC).
- **Golden rule honored:** testnet only, never mainnet, until a professional audit.

## Phase 7 — what got built (done 2026-07-18) · the payments move for real

- **The dashboard money buttons now make real on-chain transactions.** A viem-based chain service
  (`src/lib/chain/`) connects the app to the deployed `PhaseEscrow` contract, with dev custodial
  wallets and a platform relayer/attestor.
- **Fund → Deliver → Approve → Release runs live:** the client funds a phase (KYC-gated, sequential
  funding enforced, test stablecoin minted as a mock fiat on-ramp), the worker marks it delivered
  (on-chain, with the verification deadline the contract enforces), and the client approves to
  release — the escrow pays out to the worker's wallet.
- **The Forge Complete animation** fires on release; every action records the real on-chain tx hash
  in the transaction history.
- **Verified end to end on a local chain:** funded ₹2,500, delivered, approved — the worker's actual
  on-chain balance went **0 → 2,500**, the phase escrow emptied to **0**, and the FUND + RELEASE tx
  hashes were captured. Runs the same against Polygon Amoy by swapping the env vars.
- Still testnet only until an audit. Running it needs the Hardhat node + a deploy + Postgres (see
  CLAUDE.md "Running the app with the chain").

## Phase 8 — what got built (done 2026-07-18) · the timing engine

- **A working-days calendar** (skips weekends + configurable holidays) now drives every verification
  deadline — 6 unit tests pass (incl. "Friday delivery → Tuesday deadline").
- **A background tick worker** (hit via a `CRON_SECRET`-protected cron route; a local runner fires it
  each minute) enforces the timing rules:
  - **Reminder cap** — at most 2 reminders to the client during the verification window.
  - **Auto-release on ghosting** — once the window lapses and the reminders are spent, it calls the
    contract's `autoRelease` (which, as Phase 6 proved, can't fire early) and pays the worker.
  - **Symmetric worker rule** — a funded phase past its due date gets reminders, then auto-cancels:
    escrow rolled back to the client, delivery stake forfeited, a strike applied, suspension past a
    threshold.
- **Idempotent** — every transition is status-guarded, so running it repeatedly never double-releases
  or double-reminds.
- **Verified end to end on-chain:** a phase auto-released after exactly 2 reminders → the worker's
  on-chain balance went 0 → ₹3,000 → a repeat tick did nothing. Feeds the ADM-09 "pending
  confirmations" data for Phase 10.

## Phase 9 — what got built (done 2026-07-18) · the wallet layer

- **Custodial wallets (the default, invisible experience):** auto-provisioned, balance shown in
  rupees, no keys or gas for the user. A mocked fiat **on-ramp** (Add Funds) and **off-ramp**
  (Withdraw to Bank/UPI) — both real on-chain moves under the hood.
- **External self-custody wallets:** a Connect-your-own-wallet flow (MetaMask / Coinbase via the
  injected provider) with a **sign-to-verify-ownership** step — the signature proves control of the
  address but moves no funds. Once linked, payouts route to the external address.
- **Earnings (WK-12) + Payments (CL-08)** now show the **live on-chain balance** and transaction
  history with block-explorer links.
- **Verified:** the ownership signature is accepted for the real signer and rejected for an
  impostor; Add Funds took a wallet ₹0 → ₹10,000 live in the UI; the off-ramp moves funds out.
- **⚠ Honestly flagged:** custodial keys use a dev keystore — before mainnet this must move to an
  HSM / managed custody + a gasless relayer, and the on/off-ramp mocks need a real payment
  processor (tracked for Phase 13's pre-mainnet checklist).

## Phase 10 — what got built (done 2026-07-18) · the admin & jury console

- **A genuinely separate `/admin` console** on the separate Admin DB — its own login, its own chrome,
  its own session (a consumer login never grants admin access, and vice-versa).
- **Real admin auth (AUTH-11):** email + password + **mandatory TOTP 2FA** (a real check), no signup.
- **The bridge service** — the single, only path from admin code to platform data (by ID, sanitized).
  Verified by search that no admin screen bypasses it. This is the two-DB boundary made concrete.
- **Role-scoped console** — 7 internal roles; each sees only its sections (the Analyst is read-only
  and gets bounced from restricted pages; a Juror sees only their cases).
- **All 18 ADM screens:** dashboard, KYC queue + user detail, job & blog moderation, the 4-lane
  complaint triage, ongoing work, pending settlements (executes a verdict on-chain), pending
  confirmations (the Phase 8 countdown), pending payments, dispute queue + case detail, jury roster
  + member, reports, platform settings (edits config), roles, and the immutable audit log.
- **Every privileged action writes to the immutable audit log.**
- **Verified live:** logged in with real 2FA; confirmed session separation, role scoping (nav +
  route), the audited login, and the bridge-only data boundary.

## Phase 11 — what got built (done 2026-07-19) · the peer-jury dispute engine

- **Filing a complaint is now real** on both sides (WK-17, CL-13): the worker/client picks the hire,
  category, and description; it writes a real `Complaint` tied to the phase — no more stub.
- **4-lane triage (ADM-05):** an admin routes each complaint — dismiss, warn/moderate, mutual
  settlement, or **escalate to the jury (the financial lane)**. Escalation freezes the phase's escrow
  **on-chain** (best-effort `raiseDispute`), then opens an **anonymized** case (parties shown only as
  "Client #1234 / Worker #5678") with a value-tiered staked panel: **SMALL <₹5k → 3 jurors,
  STANDARD <₹20k → 5, LARGE → 7**, drawn at random and **excluding either party** (conflict guard).
- **Commit-reveal voting (ADM-12):** each juror first commits a **hash** of their vote
  (`keccak256(choice|split%|salt)`) — hidden from everyone — then reveals it later. A reveal that
  **doesn't match the commitment is rejected**, so votes can't be changed after seeing others'. Once
  all commit, the case auto-opens the reveal window.
- **Verdict + settlement:** on quorum (a strict majority revealed) the tally picks the majority
  choice; **tied split proposals resolve to the median %** (not the mean). The verdict then directs
  the frozen escrow on-chain via the existing ADM-08 settlement. **Juror stakes settle** — majority
  refunded **+fee**, minority **slashed** — and each juror's agreement-rate reputation updates.
- **Appeals:** a case can be appealed **once**, to a larger (7) panel; a second appeal is refused.
- **Verified end to end** by driving the real engine: escalate → 5-juror panel; all commit → status
  flips to REVEAL; a **wrong-salt reveal was rejected**; 3 SPLIT (60/40/50) + 1 minority reveal →
  verdict **SPLIT @ median 50%**; majority stakes **1000 → 1100 (+fee, rep 84%)**, minority
  **1000 → 800 (slashed, rep 64%)**; first appeal opened, second **rejected**. Every privileged
  action (escalate, commit, reveal, finalize, appeal) writes to the immutable audit log.

## Phase 12 — what got built (done 2026-07-19) · the communication & reputation layer

- **A real notification layer.** One `notify()` service writes the in-app record (drives the bell
  badge + notification center) **and** fans out to email/SMS channel adapters — mocked, but shaped
  so a real provider (Resend/Twilio) drops straight in. High-signal events (money, disputes) also
  "email"; messages stay in-app. The **notification center** (WK-15/CL-11) now supports click-to-open
  (marks read + follows the deep link), **Mark all read**, and a live **unread badge** on the bell.
- **In-app toasts** (4s auto-dismiss) fire on successful actions — a lightweight `ToastProvider`
  mounted in both dashboard shells, used by the message composer and review form.
- **Hire-scoped messaging** (WK-13/CL-09): threads exist only within a hire, correctly scoped to the
  two parties (no open DMs, no cross-hire leakage). Sending persists, notifies the other side, and
  the thread refreshes; a 5s **poller** brings in the other party's replies (a deliberate v1 — simple
  and stateless). The "may be used as evidence if disputed" notice sits by the composer, and all
  messages are retained (they feed Phase 11 dispute evidence).
- **Reviews** (WK-14/CL-10): a hire now **completes** when its last phase releases (on approval or
  auto-release), which bumps the worker's completed-jobs count and opens reviews. Post-completion
  rating with sub-dimensions (punctuality, quality, communication); a review can only be left on a
  **completed** hire, **once per side**. A client→worker review recomputes the worker's aggregate
  rating (which feeds juror eligibility + ranking). Each page shows a **nudge queue** of completed
  hires still awaiting a review.
- **Shared polish:** shimmer **skeleton loaders** (via `loading.tsx`) while data is in flight — never
  a spinner — plus consistent empty states across the new screens.
- **Verified:** sent a real hire-scoped message in the browser (persisted, correct thread); the bell
  showed **4 unread** and "Mark all read" cleared it; and a scripted end-to-end drive of the real code
  confirmed hire completion (→ COMPLETED, completed-jobs +1, idempotent), a review recomputing the
  worker's aggregate to **5★**, duplicate-review and incomplete-hire both rejected, and the reviewee
  getting a REVIEW notification.

## Phase 13 — what got built (done 2026-07-19) · hardening → feature-complete

- **Edge-case registry, worked through row by row** → [docs/EDGE_CASES.md](docs/EDGE_CASES.md): every
  Section-19 failure mode mapped to how it's handled (or honestly marked mocked/ops), with file
  references. The phase-escrow rows (auto-release, reminder cap, revision cap, ghosting + stake
  forfeit, dispute freeze) and the platform rows (RPC outage → cached-balance degradation) are all
  genuinely handled.
- **Critical-path tests, runnable with `npm test`** (18 pass) **+ `npm run test:contracts`** (31 pass):
  commit-reveal integrity + median + quorum (`voting.test.ts` — the pure jury logic was extracted to
  `src/lib/admin/voting.ts` to be testable), the **two-DB boundary as a test** (`boundary.test.ts`
  fails if any admin file imports the Platform DB directly), the business-day calendar, and the new
  auth rate-limiter. The 31 escrow-contract tests were re-run green.
- **Security pass** → [docs/SECURITY.md](docs/SECURITY.md): audited access control (worker/client
  ownership scoping, Analyst read-only, juror-only case access, the bridge boundary), sessions,
  injection, and secrets (none in the repo). **One real finding fixed:** login had no brute-force
  protection — added an in-memory rate limiter (5 tries / 15 min, reset on success) on both consumer
  and admin login.
- **Responsive + a11y:** verified the dashboards on a 375px mobile viewport (sidebar → hamburger
  drawer, cards stack); confirmed labeled icon buttons, `lang` set, no unlabeled images; added
  `aria-label`s + visible focus rings to the top-bar search inputs.
- **The pre-mainnet checklist** → [docs/PRE_MAINNET_CHECKLIST.md](docs/PRE_MAINNET_CHECKLIST.md): the
  blockers before real money — **professional contract audit first**, then HSM custody + gasless
  relayer, real KYC/SMS/email/on-off-ramp providers, and per-jurisdiction legal/AML review. **The
  golden rule holds: testnet only until these are done.**

## Milestone contracts, digital signatures & the demo walkthrough (2026-08-12)

Closing the last three gaps between what the platform *does* and the story we actually
demo — plus a repeatable, screenshotted end-to-end run to show a mentor or a panel.

- **The worker now publishes what they charge.** `WorkerProfile.rateHourly` +
  `rateWeekly` (migration `milestones_and_signatures`), captured at onboarding next to
  a real experience/bio field, editable in WK-03, and surfaced on WK-02, the rebuilt
  WK-07 Rates screen, and the CL-05 applicant card beside the rate quoted for that job.
- **Hiring produces a real payment schedule.** Accepting an applicant used to create a
  single `Full job` phase behind the client's back. It now opens
  `/dashboard/client/offer/[applicationId]`, where the client splits the agreed total
  into 2–8 named, dated phases. The server re-checks that the phases sum exactly to the
  agreed value before anything is created — an unbalanced plan cannot become a hire.
- **Both parties digitally sign before any money moves.** One canonical contract
  document is generated from the hire (`src/features/contracts/contractText.ts`) and
  SHA-256'd; both sides render it through the *same* component, so they provably cannot
  be shown different terms. Signing means typing your full legal name, which is checked
  against the KYC-verified account and recorded with a timestamp, IP and the document
  hash. **`fundPhaseAction` now refuses to fund escrow until both signatures exist** —
  and if the terms change afterwards, the recomputed hash stops matching and the app
  marks the contract void rather than accepting it silently.
- **`npm run demo:capture`** (`scripts/demo-capture.mjs`) drives the whole story in a
  real browser and saves 62 numbered screenshots plus `docs/demo-run.json` of the real
  tx hashes, addresses and balances: signup with OTP + email link on both sides → a
  ₹1,20,000 Android job → apply → 5-phase plan → mutual signing → fund/deliver/approve
  per phase → **one phase auto-releasing when the client goes quiet** (local chain
  fast-forwarded so a two-working-day window plays out in seconds) → reviews →
  withdrawal. Fresh unique accounts each run, so it's safe to repeat.
  Made possible by `src/lib/devOutbox.ts`: the mock SMS/email providers mirror messages
  to a gitignored `.dev-outbox.json`, because OTP codes are bcrypt-hashed in the DB and
  can't be read back.
- **[docs/DEMO_WALKTHROUGH.md](docs/DEMO_WALKTHROUGH.md)** narrates that run with an
  explicit *"in this demo / with real money"* pair at every money step, plus an appendix
  mapping each simulated piece to its production counterpart and the one env var or
  function body that swaps it. `python scripts/build-demo-docx.py` re-renders it as a
  branded `.docx` with the screenshots embedded.

## Payment system rework (docs/PAYMENT_SYSTEM_PLAN.md)

| # | Phase | Status |
|---|---|---|
| P0 | Foundations & safety — payment mode, chain adapters, key/role/gas guards, health check, mode banner | ✅ Done (2026-09-28) |
| P1 | Payment ledger, transaction outbox, state machines, reconciler | ✅ Done (2026-10-02 — UI path verified) |
| P2 | PDF receipts (success + failed) and statements | ✅ Done (2026-10-02) |
| P3 | Wallet model rework (real balances, SIWE linking, move-to-wallet, stake on-chain) | ✅ Done (2026-10-02) |
| P4 | Universal wallet connection (wagmi + EIP-6963 + WalletConnect) | ✅ Done (2026-10-02) — WalletConnect needs a project id |
| P5 | Live wallet tracker + rolling ticker | ✅ Done (2026-10-02) |
| P6 | Multi-crypto payment window (PhaseEscrow v2) | ✅ Done (2026-10-02) — Polygon set (6a); v2 live on Amoy 2026-10-06 |
| P7 | Hardening, E2E tests, "turn off demo money" runbook | ✅ Done (2026-10-03) — payment plan complete |
| — | Production deploy + security fixes + flagged-payments desk + PhaseEscrow v3 | ✅ Done (2026-10-03 → 10-06) — see "Production" below; v3 not yet on Amoy |

**P0 — what changed**
- **`PAYMENT_MODE`** (`src/lib/payments/mode.ts`) = `demo` | `testnet` | `mainnet`. Legacy
  `MOCK_BLOCKCHAIN=true` still means demo, so the deployed site behaves as before. Unset →
  testnet, never mainnet. Mainnet refuses to start without `MAINNET_AUDIT_APPROVED`; a
  real-value `CHAIN_ID` outside mainnet mode refuses to start (`src/instrumentation.ts`).
- **Chain adapters.** `src/lib/chain/escrow.ts` is now a facade over `viemAdapter` (the real
  contract) and `demoAdapter` (dummy money: DB tables `DemoAccount`/`DemoEscrow`, migration
  `demo_chain`). Both enforce the same rules (`src/lib/chain/escrowRules.ts`). The old
  mock returned fake hashes and recorded nothing; demo money now really moves between
  client, escrow and worker, and demo credit stays non-withdrawable (`lockedCredit`).
  Legacy phases funded under the old mock are adopted automatically.
- **Key/role/gas safety (W1).** Escrow writes are refused when the public Hardhat phrase is
  used on a shared network. `contracts/scripts/deploy.js` grants the relayer
  ATTESTOR+DISPUTE; `contracts/scripts/grant-roles.js` fixes an existing deployment.
  `GET /api/health/chain` reports mode, keys, RPC, contracts, relayer roles and gas.
- **Mode banner** on Payments, Earnings and both hire pages.
- **Verified:** 32 unit tests (+14), 33 contract tests (+2); the same escrow lifecycle
  (fund → deliver → auto-release, dispute → 60/40 verdict, early auto-release refused,
  refund, withdraw) passes identically on the demo adapter and on the local chain;
  health is green locally and flags all four Amoy problems (public keys, 2× missing role,
  no gas).

**P1 — what changed (done 2026-10-02)**
- **`PaymentTransaction` + `LedgerEntry`** (migrations `payment_ledger`, `phase_reconcile_cursor`).
  `src/lib/payments/service.ts` `runPayment()` records every attempt BEFORE the chain call
  (INITIATED → SUBMITTED → CONFIRMED | FAILED | CANCELLED), then applies phase status +
  ledger rows + the legacy `EscrowTransaction` row in one DB transaction.
- **All money actions use it:** client fund / approve / no-show refund, cron auto-release +
  ghosting refund, admin verdict split (via `bridge.bridgeExecuteVerdictSplit`), wallet
  withdraw / top-up.
- **State machines:** `src/lib/escrow/phaseMachine.ts` (F4 fixed — request-changes only
  from DELIVERED / VERIFICATION_WINDOW_OPEN; guarded writes everywhere; new `RESOLVED` phase
  status), `src/lib/payments/states.ts`, `src/lib/payments/errors.ts` (plain-language reasons).
- **W6:** per-signer Postgres advisory lock on every send (`src/lib/chain/signerLock.ts`);
  mined-but-reverted receipts now throw. **F7/W7:** `src/lib/payments/reconcile.ts` runs in
  every cron tick — finishes stale payments, repairs chain-ahead drift.
- `GET /api/payments/[id]` (payer/payee only). Backfill:
  `npm run script -- scripts/backfill-payments.mts` (idempotent). `npm run script` =
  `node --conditions react-server --import tsx` (added `server-only` dev dep).
- **Verified:** 42 unit tests; a scripted integration run passed on BOTH adapters (confirm,
  recorded double-fund failure, crash finished by reconciler, drift repaired, dropped tx
  failed, concurrent double-fund → exactly one wins, ledger once); cron tick clean.

- **UI path verified (2026-10-02)** on local PG17 + Hardhat, test hire
  `cmuqhebhy0001fm2scqjow7dx` (Imran K. ↔ Ravi Kumar, ₹1,500 + ₹2,500): offer → milestone
  plan → both signed → fund → deliver → approve, all through the real UI. Result: FUND and
  RELEASE PaymentTransactions CONFIRMED (tx hash, block, gas fee), balanced ledger rows
  (client WALLET→ESCROW, then ESCROW→worker WALLET), legacy EscrowTransactions, DB phase =
  chain phase (RELEASED), phase 2 unlocked, worker's live on-chain balance 0 → ₹1,500.
- **Dev-server fix:** on this machine Turbopack dev panics on every HMR version check
  ("Next.js package not found"), which makes every open tab full-reload in a loop. Use
  `npm run dev:webpack` (launch config `web-webpack`; `scripts/start-local.cmd` uses it).
  Production builds are unaffected.

**P2 — what changed (done 2026-10-02)**
- **Receipts for every final payment, success AND failure** (`src/lib/receipts/`, migration
  `receipts`). Issued inside the same DB transaction that finalises the payment
  (`service.confirmPayment` / `failPayment`), numbered from gap-free yearly counters —
  `CW-RCPT-2026-000123` (paid) and `CW-FAIL-2026-000045` (failed / cancelled) — with a
  frozen content snapshot + its SHA-256. `backfill-payments` also issues receipts for older
  payments.
- **UPI-style receipt PDF** (pdf-lib + fontkit; Outfit + Noto Sans Devanagari for ₹ and
  Hindi names): status, ₹ amount, From/To with wallet addresses, purpose, tx hash, block,
  network fee and who paid it, failure reason + "No money was moved.", DEMO / TESTNET
  watermark, verify QR + hash. Download: `GET /api/receipts/[no]/pdf` — payer, payee, or an
  admin with payments access via `bridge.bridgeReceipt` (two-DB rule); everyone else 404.
- **Public verify page** `/receipts/verify/[no]?h=` (Authentic / Does not match / Not found,
  names + addresses masked).
- **Where receipts show up:** a Transactions card on Payments + Earnings (viewer-relative
  Paid / Received, failed attempts included), per-phase receipt links on both hire pages,
  receipt numbers in the money notifications, and a "Download receipt" link on a failed
  fund / approve.
- **Account statement PDF** `GET /api/statements/pdf?from&to` (own account only, IST days,
  ≤ 1 year, multi-page): escrow as a running-balance ledger; wallet as in / out / net (a
  ledger-derived wallet *balance* needs P3.1 — see below). Form under the Transactions card.
- **Verified:** 57 unit tests; live — fund, release, failed release, withdrawal and demo
  receipts render correctly; party download 200, non-party / anonymous 404; verify page
  verdicts; statement 200 / 400 / 401; prod build traces the fonts for both PDF routes.

**P3 — what changed (done 2026-10-02)**
- **3.1 Real balance only (W2).** Funding a phase / locking a stake no longer mints a
  shortfall: a short balance is refused *before* any transaction (CW-FAIL receipt, no gas),
  and the UI offers **Add funds** prefilled with the exact gap. The amount-based on-ramp is
  the only way money enters a wallet. Both adapters behave identically.
- **3.2 Every balance separately (W3).** Spendable, withdrawable, demo credit (demo mode
  only — the ₹40,000 no longer shows on testnet), linked-wallet balance, escrow as client,
  held for you as worker. Top-bar chip fixed. "Next phase funding due" lists only fundable
  phases.
- **3.3 Move to my wallet** (custodial → verified external), receipted, withdrawable
  balance only, after the link's safety hold.
- **3.4 Per-phase payout target** on both hire pages (address recorded at funding).
- **3.5 Secure linking (W5).** Server-built SIWE message (domain, chain, account,
  single-use nonce, 10 min) + a one-time code to the phone/email on file + a 24 h hold before
  new payouts use the address + SMS/email notice on link/unlink. Replaces the old flow,
  which accepted any client-made message and linked instantly.
- **3.6 Delivery stake on-chain (F5).** Contracts ≥ ₹10,000 need the worker's 10% stake
  locked before funding; refunded on completion, forfeited to the client on ghosting — all
  receipted payments.
- **3.7 Gas.** Leftover sponsored gas is swept back to the relayer after a withdrawal
  (skipped on the local chain).
- **Verified:** 67 unit tests; browser runs for shortfall → add funds → fund, move to
  wallet, stake lock with shortfall; DB/chain integration runs for wallet linking (13/13)
  and the stake lifecycle (10/10).

**P4 — what changed (done 2026-10-02)**
- **wagmi 3** (+ React Query) replaces the raw `window.ethereum` code; the provider wraps only
  the worker / client dashboards. Cookie storage keeps the connection across the server render.
- **Wallet picker:** every installed extension found via EIP-6963, with its own name and icon;
  WalletConnect (QR / mobile / Safari) appears once `NEXT_PUBLIC_WC_PROJECT_ID` is set.
- **Network:** connecting requests the escrow chain; a blocking "Wrong network" banner with a
  Switch button (adds the network if the wallet doesn't know it); never signs off-chain.
- **Live state:** account / network changes in the wallet update the page instantly, no
  reload; a "this isn't your linked wallet — switch or re-link" warning.
- **Plain-language wallet errors**, **CSP** updated for the public RPC + WalletConnect hosts,
  **Add cwINR to wallet**, explorer links.
- **Verified** with an injected EIP-6963 test wallet signing through the local Hardhat node:
  discovery, network switch, live account switch (74 ms, no reload), watchAsset, a full
  re-link (SIWE + code), no CSP errors. 69 unit tests; production build passes.
- **Not yet exercised:** a real MetaMask / Coinbase extension and WalletConnect (needs the
  project id). Worth one manual pass.

**P5 — what changed (done 2026-10-02)**
- **Portfolio endpoint** `GET /api/wallet/portfolio?address=` — non-zero holdings across
  Ethereum, Polygon, BNB Chain (+ Sepolia, Amoy, and cwINR on the escrow chain), one batched
  read per network, live INR prices (CoinGecko) with a fallback table. Optional
  `ALCHEMY_API_KEY` / `COINGECKO_API_KEY`.
- **Live polling** every 12 s, paused while the tab is hidden.
- **Pending-transaction tracker**: "Confirming… n/12 blocks", then a toast with the receipt
  link; an "In progress" card on Payments / Earnings.
- **WalletTicker**: spinning symbol letters, odometer digits, icon crossfade, network tag +
  ≈ ₹; pauses on hover; click → holdings panel; reduced-motion crossfade; static list for
  screen readers. Large card on Payments / Earnings, compact one in the top bar.
- **Verified** in headless Chromium (see the P5 commit) + a real mainnet portfolio read.
  74 unit tests; production build passes.
- **Testing note:** the in-app browser pane doesn't run animation frames while it's hidden,
  so pages don't hydrate there; P5 was verified with Playwright on the cached Chromium.

**P6 — what changed (done 2026-10-02)**
- **PhaseEscrow v2** (`contracts/contracts/PhaseEscrow.sol`): allowlisted assets (ERC-20 +
  the native coin as `address(0)`), `fundPhaseWith` / `fundPhaseNative`, every exit pays out
  in the asset the phase was funded in, fee-on-transfer tokens refused. 41 contract tests.
  Local deploy adds test USDT / USDC (6 dp) and allowlists them + native.
- **Quotes** (`src/lib/payments/quotes.ts`, `quoteMath.ts`, `escrowAssets.ts`, model
  `PaymentQuote`): ₹ → asset at a CoinGecko rate (fixed table in demo), held 5 minutes,
  rounded up, 1 % tolerance. Crypto other than cwINR only when the worker is paid to their
  own linked wallet (a ChainWork wallet holds rupees).
- **Shared funding gates** `src/lib/escrow/fundGates.ts` (owner, status, signatures, stake,
  sequential) — used by `fundPhaseAction` and the payment window alike.
- **Verified wallet payments** — `recordVerifiedPayment` (service.ts) + `verifyPhaseFunding`
  (`src/lib/chain/verifyFunding.ts`): the payer's own transaction is recorded, then checked
  (our contract's `PhaseFunded`, phase, worker, asset, amount) before the phase, ledger and
  receipt move. Replays, wrong worker / phase / asset, underpayment and unrelated txs are
  refused with a failed receipt. The reconciler re-verifies stale wallet payments and won't
  adopt an escrow that names someone else's address.
- **Demo mode**: an EIP-712 `PaymentAuthorization` (`src/lib/payments/demoAuth.ts`) signed in
  the wallet, verified server-side, then demo credit moves into escrow.
- **Payment window** `src/features/client/checkout/CheckoutModal.tsx` (+ `AddressCard`),
  opened from Fund Phase on CL-07: amount due, currency cards with ChainWork + wallet
  balances, pay-from choice for cwINR, recipient card (worker payout address, copy, QR,
  escrow contract), quote with countdown and refresh, approve-if-needed + fund in the
  wallet, result with receipt or the live tracker. Server actions in
  `src/features/client/checkoutActions.ts`.
- **Verified:** scripted against the local chain — 13 testnet cases + 6 demo-mode cases (see
  the stage-3 commit). In headless Chromium with an injected EIP-6963 test wallet (Hardhat
  #18): USDT payment end to end (allowance reset → approve → `fundPhaseWith` → server
  verification → receipt), ChainWork-wallet payment after an in-window top-up, 375 px
  layout with no horizontal scroll. 79 unit tests; production build passes.
- **Not yet exercised in a browser:** the demo-mode signature path (server side is
  verified) and native-coin payment through the UI (server side is verified).

**P7 — what changed (done 2026-10-03)**
- **Four test layers**, all green on the local stack:
  `npm test` (79 unit) · `npm run test:contracts` (42) · **`npm run test:integration`**
  (15 — payments + security regressions against Postgres + Hardhat, fresh fixture accounts
  from `tests/fixtures.ts`; refuses to run off chain 31337) · **`npm run test:e2e`** (11
  Playwright tests, two production servers from one build — testnet :3100 / demo :3101 —
  with an injected EIP-6963 test wallet in `e2e/support/wallet.ts`).
- **Security fixes found by the new tests:** the reconciler adopted ANY on-chain funding of a
  phase to the right worker, so a refused underpayment / wrong-currency payment became
  FUNDED on the next tick — it now adopts only a full cwINR funding or one matching a quote,
  and flags the rest. wagmi ran WalletConnect's setup on every server render (a relay client
  leaked per request) — now browser-only.
- **UX fix:** the OTP boxes lost digits on fast input and cut a pasted / SMS-autofilled
  code to one digit (functional state updates, paste spreads, `autocomplete=one-time-code`).
- **Demo capture works again** (`npm run demo:capture` against `npm run demo:serve`): pays
  through the payment window, locks the worker's delivery stake, signs with the account
  name. 62 fresh screenshots committed under `docs/images/demo/`.
- **Go-live:** [docs/RUNBOOK_DEMO_TO_TESTNET.md](docs/RUNBOOK_DEMO_TO_TESTNET.md);
  `/api/health/chain` now also proves the escrow is v2 and each asset is allowlisted;
  `scripts/open-demo-escrows.mts` lists demo-money escrows to close before switching.

## Production — deploy, security fixes, escrow on Amoy (2026-10-03 → 2026-10-07)

**Deployed (2026-10-03).** P0–P7 went live on https://chain-work-afdm.vercel.app in **demo
mode**:
- `PAYMENT_MODE=demo` set on Vercel for Production and Preview. Preview previously had no mode
  and would have run testnet against the production DB.
- The platform migrations applied to Neon; `backfill-payments` run (3 payments, 3 receipts).
- `main` fast-forwarded to `payment-system`.
- `npm run test:e2e:remote` against the live site: **9/9 pass**. The fixture accounts
  (`e2e-*@example.com`, "50…" phones) remain in the production DB, clearly labelled.

**Admin console takeover closed (2026-10-03, `db22435`) — critical.** Anyone could log into the
live admin console. Production accepted `000000` as a 2FA code, fell back to a dev TOTP secret
published in this public repo, and all 5 admins still had the seeded `admin123` password.
- Every production admin was rotated to a random password plus their own TOTP secret
  (`scripts/rotate-admin-credentials.mts`, audit-logged).
- The logins and QR codes are kept outside git in `.admin-credentials/`.
- The bypass and the production fallback are gone (`src/lib/admin/totpPolicy.ts`, tested).
- The audit log showed no admin login had ever happened, so there's no sign the hole was used.

**Public wallet phrase replaced (2026-10-03, `29b7fc7`).** Production's `CHAIN_MNEMONIC` was the
public Hardhat test phrase, so every custodial wallet's key was public.
- New private phrase, and every stored address was re-keyed: `Wallet.custodialAddress`,
  `DemoAccount`, `DemoEscrow` (`scripts/rotate-chain-mnemonic.mts`).
- New relayer: `0x4170d656a439E1682004f9Fb1d3302442a076258`.
- The phrase backup is kept outside git in `.secrets/`.

**PhaseEscrow v2 live on Polygon Amoy (2026-10-06, `51de868`).**
- New deployer `0x6a04…4cF8` (the key lives only in the git-ignored `contracts/.env`).
- `deploy.js` reuses the existing cwINR (`EXISTING_TOKEN_ADDRESS`, `ca7d49c`).
- `AMOY_GAS_PRICE_GWEI=35` caps the fee: the Amoy RPC suggests 150–270 gwei tips.
- Cost: 0.125 test POL.

| Contract | Amoy address |
|---|---|
| PhaseEscrow v2 | `0xe10140d24b60C07F645BC3385ddcBF7E0d0879c1` |
| cwINR (reused) | `0x1be17798611E2e4aC0C6d1E018ed8e5c23B77eDC` |
| test USDT | `0x7600924f974aB25FDbd18272CEf134cdA58145e2` |
| test USDC | `0xDc1F13B70339aF15C7BcA4F55Be16716A466c82d` |

The relayer holds the ATTESTOR and DISPUTE roles, and all four assets (cwINR, USDT, USDC,
native POL) are allowlisted. The addresses are set on Vercel for Production and Preview.

**Flagged-payments desk (2026-10-06, `d4e5b7b`, `e8e5dd0`, `9bc4531`).** A payment a client
sends from their own wallet that doesn't match the deal (wrong worker, short of the price, wrong
currency) is never credited. Now it is also never lost.
- **Recorded.** It becomes a `FlaggedEscrow` row (migration `flagged_escrow`, applied to Neon).
- **Listed for an admin** on ADM-10 "Flagged wallet payments", with a plain reason (e.g. "paid
  15.27 USDT, short of the 15.58 USDT quoted"). The admin closes it with a note
  (audit-logged).
- **Alerted.** A new flag emails `OPS_ALERT_EMAIL` once (`src/lib/ops/alerts.ts`), and the
  console sidebar shows the open count on "Pending Payments".
- **Refundable — PhaseEscrow v3** (`version()` = 3). A refunded escrow slot can be funded
  again, so "Refund to payer" sends the money back in the same currency to whoever sent it,
  and the phase stays payable.
  - The refund issues a receipt and adds no ledger lines (the money was never credited).
  - The reconciler leaves a "refunded, still awaiting funding" phase alone.
  - The button shows only when the live contract reports v3 (`chain.contractVersion()`).
- **Also in this batch:**
  - CL-08's "Fund ₹X" now opens the payment window (`FundDueList`) instead of paying from the
    ChainWork wallet directly.
  - `/api/health/chain` adds `testnetReady` / `testnetTodo`. In demo mode it marks chain
    checks `required: false`, so the page reads ok instead of a false alarm.

**Live health (2026-10-07):** `ok: true` · mode demo · chain 80002 · private keys · escrow v2 ·
all assets allowlisted · relayer roles granted. The only `testnetTodo` item is **relayer gas: 0
native (minimum 0.5)**.

**Resume here (2026-10-07).** The next three steps are wallet top-ups only you can do (test POL
from a faucet). The full ordered plan is in [ROADMAP.md → Future path](docs/ROADMAP.md#future-path).
1. **Deploy PhaseEscrow v3 to Amoy.**
   - Funds: the escrow-only deploy measured 2.45 M gas, about 0.074–0.086 POL at 30–35 gwei.
     The deployer `0x6a04Fa4D1CB867106b3A362066a96E2921834cF8` has 0.075, so send ~0.05 more.
   - Code: give `deploy.js` an option to reuse the live USDT / USDC too (today it always
     deploys new mocks).
   - After the deploy: allowlist the assets, grant the relayer roles, then set
     `CHAIN_ESCROW_ADDRESS` on Vercel and redeploy. Nothing is funded on v2 yet (demo mode), so
     nothing needs moving.
2. **Fund the relayer:** ≥ 0.5 test POL to `0x4170d656a439E1682004f9Fb1d3302442a076258`, or lower
   `CHAIN_RELAYER_MIN_GAS` for a short smoke test.
3. **Optional:** set `OPS_ALERT_EMAIL` on Vercel so flagged payments email someone.
4. **Switch to testnet.** Follow [RUNBOOK_DEMO_TO_TESTNET.md](docs/RUNBOOK_DEMO_TO_TESTNET.md):
   close the demo-money escrows, set `PAYMENT_MODE=testnet`, smoke-test one payment and its
   receipt, then re-run `npm run test:e2e:remote`.
5. ~~Jury integrity fixes (F2/F3)~~ — done 2026-10-09, see the last section. **Before deploying
   them:** apply the admin migration `juror_admin_link` to Neon (`npm run db:deploy`) and give each
   production juror a login (re-running `seed-demo-accounts.mjs` links them; then
   `rotate-admin-credentials.mts` gives them real passwords + TOTP). Until then no production
   juror can be drawn. The new jury timer will also process the stale demo cases whose deadlines
   passed long ago.

## Jury integrity — F2 / F3 (2026-10-09)

The jury decides where frozen escrow goes, so these were correctness bugs in a money path.
- **One juror, one vote.** Each juror has their own console login (`JurorProfile.adminUserId`,
  admin migration `juror_admin_link`). Commit and reveal work out the juror from the session;
  the browser can't name one. Root watches but has no ballot. A juror sees only their own cases
  and sees fellow jurors as "Juror 2, 3…". The seeds create a login per juror
  (`juror.<name>@chainwork.local` / `admin123`).
- **The case can only move forward, once.** A transition table (`voting.ts`) plus guarded status
  claims: double finalize, double settle and settling an appealed case are refused, even when
  two requests race. Finalize waits for every reveal or the reveal deadline, so an early
  majority can't shut out later votes. An appeal draws a real fresh 7-juror panel (it used to
  open with nobody on it), and an appeal can't be appealed.
- **Deadlines are enforced** by a jury timer in the cron tick: non-committers are replaced,
  non-revealers slashed, and a round without quorum is redrawn. Stakes never go below 0.
- **Checkable draws.** The panel is drawn from a random seed that's written to the audit log
  with the eligible list, so anyone can recompute the draw.
- **Verified:** 18 new unit tests (every allowed + forbidden transition, the static "no juror id
  from the browser" check) and 10 integration tests on local Postgres (impersonation, concurrent
  finalize / settle, appeal rules, stake floor, all three timer paths). In the browser: escalated
  a complaint → 5-juror panel without the party who is also a juror; the draw recomputed from
  the audited seed; root sees no ballot; juror Kavita Reddy sees only her case, commits a vote,
  gets her receipt, and gets a 404 on a case she isn't on.
