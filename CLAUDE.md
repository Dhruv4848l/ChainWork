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

- [~] **Phase 0** — Setup, design system, theming, UI primitives, this file — *in progress*
- [ ] Phase 1 — Two databases (Prisma ×2), full data model, seed data
- [ ] Phase 2 — Consumer auth (Worker/Client toggle, sessions, KYC-tier gating)
- [ ] Phase 3 — Public marketing site (Home hero + all PUB pages)
- [ ] Phase 4 — Worker dashboard (all WK screens, mock money)
- [ ] Phase 5 — Client dashboard (all CL screens + Post-a-Job, mock money)
- [ ] Phase 6 — Escrow smart contracts (Solidity/Hardhat, testnet)
- [ ] Phase 7 — Wire escrow into the app (live testnet)
- [ ] Phase 8 — Auto-release timer + reminder-cap worker
- [ ] Phase 9 — Wallet layer (custodial + external)
- [ ] Phase 10 — Admin/Jury console (separate app + DB + bridge service)
- [ ] Phase 11 — Complaint → triage → commit-reveal jury → verdict
- [ ] Phase 12 — Notifications, messaging, reviews
- [ ] Phase 13 — Hardening (edge cases, tests, security, mobile/a11y, pre-mainnet checklist)

## Reference files (not in this repo — on the developer's machine)

- Spec v2: `C:\Users\ASUS\Downloads\ChainWork_Complete_Specification_v2.docx` (23 sections;
  §13 phase escrow, §15 data model, §19 edge-case registry).
- Build manual: `C:\Users\ASUS\Downloads\ChainWork_ClaudeCode_Build_Manual.md`.
- Design pack (6 `.dc.html`): `C:\Users\ASUS\Downloads\Updated ChainWork\`.
