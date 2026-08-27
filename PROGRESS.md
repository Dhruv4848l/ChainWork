# ChainWork — Build Progress Tracker

> A shareable, at-a-glance map of how much of ChainWork is built. Updated after every
> verified phase. Each phase is one step of the build manual; a phase is only marked done
> once its ✅ verification checklist passes and it's committed to git.

**Overall: 100% — all 14 phases (0–13) complete. ChainWork is feature-complete on testnet.** 🎉

> Next step is NOT more features — it's the [pre-mainnet checklist](docs/PRE_MAINNET_CHECKLIST.md),
> topped by a professional smart-contract audit. The platform stays on testnet until that's done.

_Last updated: 2026-07-19 (Phase 13)._

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
