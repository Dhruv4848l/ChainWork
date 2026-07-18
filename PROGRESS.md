# ChainWork — Build Progress Tracker

> A shareable, at-a-glance map of how much of ChainWork is built. Updated after every
> verified phase. Each phase is one step of the build manual; a phase is only marked done
> once its ✅ verification checklist passes and it's committed to git.

**Overall: ~36% — Phases 0–4 complete, 5 of 14 phases done.**

_Last updated: 2026-07-18 (Phase 4)._

| # | Phase | Status | % |
|---|---|---|---|
| 0 | Setup + design system + theming + UI primitives | ✅ Done | 100% |
| 1 | Two databases + data model + seed data | ✅ Done | 100% |
| 2 | Consumer auth (Worker/Client toggle, KYC gate) | ✅ Done | 100% |
| 3 | Public marketing site + cinematic 3D hero | ✅ Done | 100% |
| 4 | Worker dashboard (all WK screens, mock money) | ✅ Done | 100% |
| 5 | Client dashboard + Post-a-Job (mock money) ◀ first demoable | ⬜ Not started | 0% |
| 6 | Escrow smart contracts (Solidity, testnet) ◀ the heart | ⬜ Not started | 0% |
| 7 | Wire escrow into the app (live testnet) | ⬜ Not started | 0% |
| 8 | Auto-release timer + reminder-cap worker | ⬜ Not started | 0% |
| 9 | Wallet layer (custodial + external) | ⬜ Not started | 0% |
| 10 | Admin/Jury console (separate app + DB + bridge) | ⬜ Not started | 0% |
| 11 | Complaint → commit-reveal jury → verdict | ⬜ Not started | 0% |
| 12 | Notifications, messaging, reviews | ⬜ Not started | 0% |
| 13 | Hardening (edge cases, tests, security, a11y) | ⬜ Not started | 0% |

**Legend:** ✅ done · 🟡 in progress · ⬜ not started

## Milestones

- **After Phase 5** — a working marketplace on mock payments: a real, walkable demo.
- **After Phase 9** — payments are real (testnet only).
- **After Phase 13** — feature-complete on testnet. Then: professional smart-contract audit
  before anything touches real money.

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
