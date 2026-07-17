# ChainWork — Build Progress Tracker

> A shareable, at-a-glance map of how much of ChainWork is built. Updated after every
> verified phase. Each phase is one step of the build manual; a phase is only marked done
> once its ✅ verification checklist passes and it's committed to git.

**Overall: ~7% — Phase 0 complete, 1 of 14 phases done.**

_Last updated: 2026-07-17 (Phase 0)._

| # | Phase | Status | % |
|---|---|---|---|
| 0 | Setup + design system + theming + UI primitives | ✅ Done | 100% |
| 1 | Two databases + data model + seed data | ⬜ Not started | 0% |
| 2 | Consumer auth (Worker/Client toggle, KYC gate) | ⬜ Not started | 0% |
| 3 | Public marketing site + cinematic 3D hero | ⬜ Not started | 0% |
| 4 | Worker dashboard (all WK screens, mock money) | ⬜ Not started | 0% |
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
