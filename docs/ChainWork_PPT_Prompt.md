# ChainWork — Presentation Generation Prompt

> Copy everything inside the fenced block below into your AI tool of choice (Claude with the
> `pptx` skill, ChatGPT, Gamma, Beautiful.ai…). It is self-contained: the FACT PACK at the end
> means the generator never has to guess a number, a colour, or a feature.
>
> **Before you paste:** edit the four lines in `SET THESE FIRST`. Everything else works as-is.
> Variants for other audiences (investor, demo-day, viva) are listed after the prompt.

---

```
You are a senior product-and-engineering storyteller building a presentation deck about a real,
shipped software platform called ChainWork. I am giving you a complete fact pack below. Build the
deck ONLY from these facts — do not invent features, metrics, users, revenue, partnerships, or
funding. If a slide would need a number I have not given you, either leave it out or mark it
clearly as "illustrative".

=====================================================================
SET THESE FIRST
=====================================================================
AUDIENCE:       Final-year project review panel + technical evaluators (adjust tone if changed)
DURATION:       15–18 minutes of speaking time
SLIDE COUNT:    24 content slides + 4 optional appendix slides
OUTPUT FORMAT:  A .pptx file, 16:9 (13.333in × 7.5in), editable text boxes, no images that
                require external downloads. Include speaker notes on EVERY slide.

=====================================================================
1. WHAT CHAINWORK IS (one paragraph you must internalise)
=====================================================================
ChainWork is a role-based, three-sided marketplace for physical, time-boxed, local labour —
electricians, cooks, decorators, drivers, cleaners, waiters, helpers — hired for hours, days or
weeks, not months. It is not LinkedIn (permanent hiring) and not Fiverr (digital services). Its
differentiator is a trust layer: verified identities, mutual reviews, PHASE-BASED BLOCKCHAIN
ESCROW (funds locked per phase of work, released automatically on confirmation or when a
verification window lapses), and a PEER-JURY dispute system (a randomly selected, staked panel
decides disputes by commit–reveal voting — no single admin judge). It is fully built and
feature-complete on a blockchain TESTNET. It has never touched real money, deliberately.

The deck's spine — the through-line every slide should serve:
"Informal labour markets fail on trust. ChainWork replaces trust-in-a-person with
trust-in-a-process: money is locked by code, released by a clock, and disputed by peers."

=====================================================================
2. NON-NEGOTIABLE HONESTY RULES
=====================================================================
- Never imply real money, real users, live traffic, or revenue. This is testnet-only software.
- Never claim a security audit has happened. It has NOT. The pre-mainnet checklist slide exists
  specifically to say so out loud — that slide is a credibility asset, not a weakness. Keep it.
- Mock/stubbed integrations must be labelled as such where mentioned (KYC auto-approval, fiat
  on/off-ramp, the dev-mnemonic custodial keystore).
- Every metric on the "by the numbers" slide must come from the FACT PACK verbatim.

=====================================================================
3. VISUAL DESIGN SYSTEM — USE THESE EXACT VALUES
=====================================================================
The product has a real design language ("forge / molten bronze on near-black"). The deck must
look like the product, not like a generic template.

Palette (dark theme — use this as the deck's base):
  Background        #0A0A0A
  Card surface      #151312
  Card surface alt  #1D1A18
  Primary text      #F5EFE6
  Secondary text    #B8B2A8
  Tertiary text     #756F68
  BRAND BRONZE      #D9A066   (accent, headings underline, primary shapes, CTA)
  Bronze hover/hi   #E8B583
  Bronze deep       #A85F2E
  Success emerald   #34E89A   (released / paid / verified-good)
  Warning amber     #FFC46B   (pending / verification window / caution)
  Danger ember      #E0563A   (disputed / rejected / failed)
  Hairline borders  white at 6–16% opacity — thin 1px rules, never heavy boxes

Typography:
  Display / slide titles : "Italiana" (serif, elegant, wide letter-spacing). If unavailable,
                           fall back to Cormorant Garamond, then Georgia.
  Body / UI / labels     : "Outfit" (geometric sans). Fallback: Poppins, then Calibri.
  Title size 40–48pt, section headers 28–32pt, body 16–18pt, captions 12–13pt.
  Never put more than ~40 words of body text on a slide.

Layout rules:
  - Generous negative space. Dark canvas, content floating in bronze-hairlined cards.
  - One idea per slide. Use a short declarative slide title that states the takeaway
    ("Money moves on a clock, not on goodwill"), not a topic label ("Escrow").
  - Status colour discipline: anything "released/paid" is emerald, anything "waiting" is amber,
    anything "disputed/failed" is ember, anything brand/structural is bronze. Be consistent
    across every diagram in the deck.
  - Diagrams over paragraphs. Build them with native PowerPoint shapes/arrows (editable), not
    as pasted images. Numbered step-flows, swimlanes, and layered stacks are all fine.
  - No stock photos. No clip art. No emoji in slide bodies. Thin line-art icons only, drawn
    from shapes if needed.
  - Subtle bronze gradient or a thin bronze rule on section-divider slides only.

=====================================================================
4. SLIDE-BY-SLIDE OUTLINE — BUILD EXACTLY THIS
=====================================================================

SLIDE 1 — Title
  "ChainWork" in Italiana, very large, bronze. Subtitle: "A trust layer for daily-wage work —
  phase-based blockchain escrow and a peer jury, with no judge." Footer line: presenter name,
  date, and the honest status tag "Feature-complete on testnet".

SLIDE 2 — The problem (make this hurt)
  Three chronic failures of informal daily-wage labour markets, one line each:
  1. No trust layer — clients can't tell who is reliable; workers can't tell who will pay.
  2. No price transparency — wages negotiated ad hoc, workers underpaid and paid late.
  3. No recourse — a no-show or non-payment becomes he-said-she-said, and the party with less
     power (usually the worker) loses.
  Supporting line (attribute as independent gig-economy research, not as our own data):
  surveys of freelancers repeatedly find over half report some form of wage theft at least once,
  and fast, predictable access to earnings ranks as important to workers as the rate itself.

SLIDE 3 — Where ChainWork sits
  A simple 3-way positioning diagram: LinkedIn = permanent hiring; Fiverr = digital freelance
  services; ChainWork = physical, time-boxed, LOCAL labour (hours/days/weeks). Call out the
  category list: electricians, cooks, decorators, drivers, cleaners, waiters, helpers.

SLIDE 4 — The four structural pillars
  Four cards: Verified Identity (KYC tiers + persistent trust score) · Structured Job Contracts
  (scope, duration, budget, location, headcount — a record, not a text message) · Phase-Based
  Blockchain Escrow · Peer Jury Dispute Resolution. One sentence under each, from the fact pack.

SLIDE 5 — Four actors, not three
  Worker · Client · Super Admin · Juror. For each: primary goal, own dashboard?, handles money?
  Key design point to state out loud: a juror is not a separate signup — an existing Worker or
  Client opts in to jury duty, exactly like real-world jury service, with automatic
  conflict-of-interest exclusion preventing anyone judging their own case.

SLIDE 6 — The end-to-end journey (one wide flow diagram)
  Landing → Role select → Register (phone OTP → email → KYC tiers) → Dashboard → Post/Apply →
  Hire → Phase escrow funded → Work → Deliver → Verify → Released → Review → Archived.
  Show the two branch-outs beneath the happy path: auto-release (client silent) and
  complaint → triage → jury verdict.

SLIDE 7 — SECTION DIVIDER: "The money layer"

SLIDE 8 — Phase-based escrow: the core idea
  The five-step phase lifecycle as a numbered horizontal flow:
  1. AGREE scope, amount, delivery date  →  2. FUND (client locks this phase's advance
  on-chain; work is blocked until funded)  →  3. DELIVER (worker marks delivered)  →
  4. VERIFY (2-working-day window)  →  5. NEXT PHASE (repeat; final phase closes the hire).
  State the unlock plainly: a single-day gig is simply "Phase 1 of 1", so the contract logic is
  identical at every size, and the UI only shows multi-phase complexity when it genuinely exists.
  Real example to show: a 3-phase shop-interior rewiring hire — Phase 1 released, Phase 2
  (₹8,000 wiring & panel) disputed, Phase 3 pending funding.

SLIDE 9 — The verification window (the clock that replaces goodwill)
  Timeline graphic: delivery marked → business-day countdown starts (weekends + configurable
  regional holidays excluded) → up to TWO reminders to the client (one near midpoint, one near
  deadline) → at window close with no action, AUTO-RELEASE to the worker.
  Within the window the client can: APPROVE (instant release), REQUEST CHANGES (clock pauses and
  restarts on redelivery; capped revision rounds, after which a further request must become a
  formal complaint), or REJECT/COMPLAIN (funds freeze exactly where they are).
  Say why 2 working days and not Upwork's two weeks: daily-wage cash-flow cycles are short, and
  once fiat has converted to stablecoin there is no card-chargeback window to wait out.

SLIDE 10 — Symmetric protection (this is the fairness slide)
  Two mirrored columns:
  CLIENT GOES SILENT → reminders → window lapses → auto-release to worker. The platform does not
  hold a worker's pay hostage to an unresponsive client.
  WORKER GOES SILENT → escalating reminders → short grace period → phase AUTO-CANCELLED, escrow
  rolls back to the client, strike on the worker's record, and the refundable DELIVERY STAKE is
  forfeited on hires above a configurable value threshold (below it, the penalty is
  reputation-only — a stake on a two-hour gig would be worse than the problem it solves).

SLIDE 11 — The smart contract (PhaseEscrow.sol)
  Solidity 0.8.24, OpenZeppelin 5, Hardhat, targeting Polygon Amoy testnet; a mock ERC-20
  stablecoin ("cwINR") represents rupee-pegged value.
  Show the function surface grouped by purpose:
    Fund/release : fundPhase, markDelivered, approveRelease, autoRelease
    Dispute      : raiseDispute, resolveDispute(workerBps), proposeSettlement, acceptSettlement
    Rollback     : refundToClient
    Stakes       : lockStake, refundStake, forfeitStake
    Safety       : pause / unpause, ReentrancyGuard, SafeERC20, checks-effects-interactions
  Roles: DEFAULT_ADMIN (multi-sig in production) · ATTESTOR (backend relayer) · DISPUTE (jury
  verdict executor) · PAUSER.
  End with the hard guarantee: no function lets the platform drain escrow. Funds can only ever
  reach the recorded worker or the recorded client.

SLIDE 12 — The oracle problem, stated honestly
  A blockchain cannot see a client click "Approve" or know that two working days have passed —
  something must tell it. ChainWork's backend is that attestor. The trust boundary is drawn in
  the contract itself: markDelivered records a releaseEligibleAfter timestamp, and autoRelease
  REVERTS before that timestamp. So the backend can relay a fact, but it cannot cheat the clock.
  Frame it as: the backend exercises no judgment; it relays an observed fact into a contract that
  was told in advance, in code, exactly what to do with it.

SLIDE 13 — SECTION DIVIDER: "The justice layer"

SLIDE 14 — Peer jury: why there is no judge
  Design goals: no single point of bias (not even the platform decides who gets paid); cheap
  enough for small daily-wage disputes (days, not months); hard to game; transparent; and every
  numeric parameter is configuration, not code.
  Note the precedent honestly: staked, randomly-selected, commit–reveal peer arbitration is an
  established pattern in blockchain systems (Kleros is the best-known); ChainWork implements the
  same shape tuned to its own dispute categories and value tiers.

SLIDE 15 — Commit–reveal, end to end
  Pipeline diagram: Complaint filed → 4-lane triage (trivial → support agent · policy violation →
  super admin · FINANCIAL dispute over active escrow → JURY · fraud/identity → compliance) →
  escrow frozen on-chain → anonymised case opened ("Client #4521 vs Worker #1187") → panel sized
  by claim value (3 / 5 / 7 jurors, always odd, ties impossible by construction) → random panel
  drawn excluding both parties → COMMIT (hashed vote only) → REVEAL (verified against the hash;
  a mismatch is rejected) → tally → verdict executes on-chain.
  Two details worth stating: the commit hash is keccak256 over choice + split% + secret salt, and
  a split verdict resolves to the MEDIAN proposed percentage, not the mean.

SLIDE 16 — Juror incentives + appeals
  Quorum = revealed votes must exceed half the panel. Majority-side jurors get their stake back
  plus a fee, paid from the platform's dispute fee and never from the disputed parties' funds;
  minority-side jurors are slashed. Every juror carries an agreement-with-majority reputation
  distinct from their normal user rating. Either party may appeal ONCE, to a larger (7-juror)
  panel, at a higher fee. An emergency override exists for Root Super Admin only — double-logged
  with a reason code, deliberately exceptional, never routine.

SLIDE 17 — SECTION DIVIDER: "The build"

SLIDE 18 — Architecture at a glance (the money diagram of the deck)
  A layered diagram:
    Client tier   : Next.js 16 App Router · React 19 · TypeScript · Tailwind v4 · dual theme
    Server tier   : React Server Components + server actions · JWT cookie sessions (jose +
                    bcrypt) · KYC gate guard · rate limiter · cron-driven escrow tick worker
    Data tier     : TWO physically separate PostgreSQL databases via two Prisma schemas
    Chain tier    : viem → PhaseEscrow.sol + MockStablecoin on an EVM L2 testnet, platform
                    relayer pays gas so users never see it
    Delivery      : pluggable SMS (Twilio / Fast2SMS) and email (Resend / Brevo) adapters, each
                    falling back safely to a console mock
  Emphasise: gas is invisible to users, and the wallet balance is always shown in rupees.

SLIDE 19 — The hard architectural rule: two databases, one bridge
  Diagram: Platform DB (users, jobs, hires, phases, escrow) and Admin/Jury DB (admin users,
  jurors, dispute cases, votes, audit log, platform config) as two separate cylinders. NO foreign
  key ever crosses between them — the admin side stores plain scalar ID references only. Every
  admin screen that needs real platform data goes through ONE bridge service module that queries
  by primary key and returns a sanitised result (emails and phones masked).
  Say the enforcement out loud: this is not a convention, it is a passing automated test that
  scans the admin tree and fails the build if any file other than the bridge imports the platform
  database client.

SLIDE 20 — What the product actually looks like (screen inventory)
  ~72 routes across five surfaces, each mapped to a design-pack code:
    PUB-01…11  Public marketing site (cinematic Three.js hero, about, how it works, pricing,
               blog, categories, jobs teaser, contact, legal, 404)
    AUTH-01…11 Signup with the Find Work | Post a Job toggle, phone OTP, email verify, forgot/
               reset by OTP, worker + client onboarding, KYC tiers, wallet setup, admin login
    WK-01…17   Worker dashboard: find jobs, applications, hires, phase tracker, earnings &
               wallet, messages, reviews, notifications, settings incl. jury-duty opt-in
    CL-01…13   Client dashboard: multi-step multi-role Post-a-Job builder, applicants with fit
               score, hire management with fund / approve-and-release / request-changes /
               mark-no-show / settle, payments
    ADM-02…19  Admin & jury console: KYC queue, job + blog moderation, 4-lane complaint triage,
               ongoing work, pending settlements/confirmations/payments, dispute queue, the
               commit–reveal case console, jury roster, reports, platform settings, roles,
               immutable audit log
  If the layout allows, add one thin strip of 3–4 wireframe-style mock cards in the palette.

SLIDE 21 — Wallets, and the UX of hiding a blockchain
  Custodial by default: a wallet is auto-provisioned at signup; the user sees a rupee balance and
  never touches a seed phrase or a gas fee. Optional external self-custody: connect MetaMask /
  Coinbase, prove ownership by signing a message that moves no funds and grants no spending
  permission; once linked, payouts route there instead. Transaction history links to a block
  explorer by tx hash. Balance reads degrade gracefully to a cached value labelled "chain
  offline" when the RPC is down, while money MOVEMENTS still fail loudly rather than pretending.
  Flag honestly: fiat on/off-ramp and the dev-mnemonic keystore are stand-ins pending real
  providers and HSM/managed custody.

SLIDE 22 — Built in 14 sequenced phases (delivery method slide)
  A compact 0→13 timeline: foundation & design system · dual database & data model · consumer
  auth & KYC gate · public site · worker dashboard · client dashboard (first demoable
  milestone) · escrow contracts · escrow wired live · auto-release timer · wallet layer ·
  admin & jury console · commit–reveal jury · notifications/messaging/reviews · hardening.
  The method itself is a finding worth stating: each phase was verified and committed before the
  next began, with a persistent project-memory file carrying conventions and decisions forward —
  which is why the money layer was never built on an unverified foundation.

SLIDE 23 — By the numbers + what is verified end to end
  Left column, build metrics (use the FACT PACK numbers verbatim).
  Right column, the flows actually proven running, stated as evidence not as claims:
    · Funded a phase, worker marked delivered, client approved → the worker's real on-chain
      balance moved 0 → 2,500 cwINR and the phase escrow emptied to zero.
    · Left a phase unattended → exactly 2 reminders fired, then auto-release paid the worker
      ₹3,000 on-chain; re-running the worker changed nothing (idempotent).
    · Drove a full dispute: escalate → 5-juror panel → all commit → reveal → a wrong-salt reveal
      was REJECTED → verdict SPLIT at the median 50% → majority stakes up, minority slashed,
      reputations updated → a second appeal correctly refused.
    · Two-DB boundary and commit–reveal integrity are enforced by passing automated tests.

SLIDE 24 — Not done: the pre-mainnet checklist (close with this, not with a victory lap)
  Blockers before this may ever touch real money, in order:
  1. Professional third-party smart-contract audit — nothing else on the list matters first.
  2. Wallet custody hardening — HSM or managed custody, plus a gasless meta-tx relayer.
  3. Real KYC / identity provider (today's flow auto-approves).
  4. Real fiat on/off-ramp via a licensed processor, idempotent and with a held-pending state.
  5. Production SMS + email credentials and a verified sending domain.
  6. Legal + AML review per jurisdiction — this gates WHERE it can launch.
  Then the launch shape: one city, one or two categories, capped job values, jury health metrics
  watched closely while the juror pool is small.
  Closing line: "The platform stays on testnet until every blocker clears. That is the design,
  not a delay."

APPENDIX (optional, only if asked for in Q&A)
  A1 — Phase status machine: PENDING_FUNDING → FUNDED → IN_PROGRESS → DELIVERED →
       VERIFICATION_WINDOW_OPEN → RELEASED, plus DISPUTED and AUTO_CANCELLED.
  A2 — Data model: 21 platform entities + 9 admin entities, key relations.
  A3 — Edge-case registry highlights: chain congestion shows "Confirming" and never a false
       "Funded"; fiat succeeds but on-chain deposit fails → idempotent retry, no double charge;
       not enough eligible jurors → panel auto-reduces or the case queues with escrow safely
       locked; repeated request-changes → revision cap forces a formal complaint.
  A4 — Future scope, explicitly out of the current build: instant "minutes not hours" dispatch
       hiring, cross-border payouts for migrant labour, reputation-weighted juror selection, a
       public anonymised dispute-transparency dashboard, native mobile apps, multi-language.

=====================================================================
5. FACT PACK — the only numbers you may use
=====================================================================
STATUS
  Feature-complete on testnet; 14 of 14 build phases (0–13) complete; never deployed to mainnet;
  no security audit performed.

BUILD METRICS
  ~72 application routes/screens across 5 surfaces (public, auth, worker, client, admin/jury)
  ~13,300 lines of TypeScript/TSX across ~186 source files
  392 lines of Solidity (PhaseEscrow.sol 373 + MockStablecoin.sol 19)
  30 database models — 21 in the platform schema, 9 in the admin schema
  25 enums (19 platform + 6 admin); 5 migrations across the two databases
  31 passing smart-contract tests + 18 passing application tests
  19 tunable PlatformConfig parameters, editable by admins without a deployment
  6 design-pack source files defining every screen (PUB / AUTH / WK / CL / ADM codes)

PLATFORM RULES AND DEFAULTS
  Verification window: 2 working days, business-day calendar with configurable holidays
  Reminder cap: at most 2 per phase before auto-release
  KYC tiers: UNVERIFIED → BASIC → VERIFIED → TRUSTED; money movement requires ≥ VERIFIED
  Jury panels by claim value: SMALL under ₹5,000 → 3 jurors · STANDARD under ₹20,000 → 5 ·
    LARGE → 7. Always odd.
  Juror settlement: majority +100 stake units fee, minority −200 slashed; agreement-with-majority
    reputation recalculated each case
  Quorum: revealed votes must be more than half the panel; split verdicts resolve to the median
  Appeals: exactly one per case, to a larger panel
  Delivery stake: refundable, required above a configurable hire-value threshold, forfeited on
    ghosting; below the threshold the penalty is reputation-only
  Admin sessions: 8-hour, separate cookie namespace, mandatory TOTP 2FA, no self-signup
  Auth brute-force cap: 5 attempts per 15 minutes per identifier (single-instance, in-memory)

TECH STACK
  Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 with CSS-variable theming
  PostgreSQL 17 × 2 databases · Prisma × 2 schemas · custom JWT-cookie auth (jose + bcryptjs)
  Solidity 0.8.24 · OpenZeppelin 5 · Hardhat · viem · Polygon Amoy testnet target
  Three.js + @react-three/fiber for the marketing hero (lazy-loaded, degrades to a static
    gradient without WebGL or under reduced-motion)
  Cron-driven escrow tick worker for reminders, auto-release and ghosting rollback
  Pluggable SMS (Twilio / Fast2SMS) and email (Resend / Brevo) adapters

DEMO ENVIRONMENT (mention only if the deck includes a live-demo slide)
  27 worker accounts, 4 clients, 14 jurors, several admins; two live dispute cases mid-commit
  and two complaints in triage; every wallet carries ₹40,000 of clearly-labelled, structurally
  non-withdrawable demo credit (it never exists on-chain, so no code path can pay it out).

=====================================================================
6. WHAT TO PRODUCE
=====================================================================
1. First, output a one-screen outline: slide number → slide title → the single takeaway. Stop
   and let me approve it.
2. Then generate the .pptx implementing the approved outline, with:
   - real editable text boxes and native shapes (no flattened images of text)
   - speaker notes on every slide, written as what I should SAY, not as a repeat of the slide
   - consistent master styling: dark canvas, bronze accents, Italiana titles, Outfit body
   - a thin bronze footer rule on content slides carrying "ChainWork · testnet build"
3. Finally, list anything you had to leave out or simplify, so I can decide whether to add it.
```

---

## Variants

Swap the `SET THESE FIRST` block and the slide list as follows.

**Investor / demo-day (10 slides, 5 minutes).** Keep slides 1, 2, 3, 4, 8, 9/10 merged, 15, 20,
23, 24. Lead with the problem and the wage-theft framing; compress all architecture into a single
"how it works under the hood" slide; keep the pre-mainnet slide — sophisticated audiences read it
as discipline, not as an unfinished product.

**Technical deep-dive / viva (30+ slides).** Keep the full 24 and promote all four appendix
slides into the body. Add: the phase state machine as its own slide, the escrow tick worker's
idempotency guarantees, the RBAC matrix, the security findings and fixes, and a live walkthrough
of `PhaseEscrow.sol`'s trust boundary.

**Non-technical stakeholder / client-facing.** Drop slides 11, 12, 18, 19. Replace them with one
plain-language slide built from the spec's blockchain glossary — smart contract as "a vending
machine for money", escrow as "money held by a neutral system", gas fees as "a network fee the
platform pays for you". Keep slide 9 (the clock) as the centrepiece — it is the idea non-technical
audiences actually buy.

**If your tool renders Markdown rather than building .pptx directly** (Gamma, Tome, Slidev),
append: "Output as Markdown with `---` slide separators, one `#` title per slide, bullets under
it, and a `Notes:` block per slide. Use the exact hex palette above in any theme configuration
you emit."
