# Edge-Case Registry — Handling Checklist (Phase 13)

Every row of the spec's Section 19 registry, with how ChainWork handles it and where.
Legend: **✅ Handled** (implemented + verified) · **🟡 Mocked** (real structure, provider/scale
work deferred to the pre-mainnet checklist) · **⚪ Product/ops** (policy or human process, not code).

## Auth
| Scenario | Status | How / where |
|---|---|---|
| OTP delivery failure | 🟡 | OTP send is mocked (logged to console); resend with a 20s throttle + a per-code 5-attempt cap (`src/lib/auth/verification.ts`). Voice fallback is a provider task (checklist). |
| Account takeover attempt | ✅ | Generic auth error (no account enumeration) + **login brute-force rate limit** 5/15min (`loginAction`, `src/lib/rateLimit.ts`); admin login also rate-limited + mandatory TOTP 2FA. Device/location step-up is deferred. |
| Session expiry mid-task | ✅ | httpOnly JWT sessions; protected routes redirect to login with `returnTo` so the user resumes where they left off (`src/proxy.ts`, `requireUser(returnTo)`). |

## KYC
| Scenario | Status | How / where |
|---|---|---|
| Document rejected repeatedly | ✅ | KYC is a tiered gate (Unverified→Basic→Verified→Trusted); rejected users aren't hard-blocked — they retry, and the admin KYC queue (ADM-03) escalates to human review. |
| Liveness check failure | ⚪ | Liveness is a KYC-provider concern (mocked auto-approve here); the design never hard-blocks — it routes to the manual admin queue. |

## Job Posting
| Scenario | Status | How / where |
|---|---|---|
| No applicants | 🟡 | Applicant count is surfaced on CL-04; auto-nudge suggestions are a follow-up. |
| Spam / duplicate postings | ⚪ | Admin job-moderation queue (ADM-14) removes offenders; automated anomaly detection is an ops task. |
| Illegal / policy content | ✅ | Admin pre-publish/again moderation on jobs + blog (ADM-14/15), audit-logged. |

## Hiring
| Scenario | Status | How / where |
|---|---|---|
| Insufficient escrow for headcount / current phase | ✅ | Funding is KYC-gated and **sequential** — a phase can't be funded until the prior one is funded; the contract holds real balances (`fundPhaseAction`, `PhaseEscrow.sol`). **Partial hiring** is supported (per-role `hiredCount` vs `headcount`). |
| Client cancels post-hire, pre-work | ✅ | `markNoShow` / cancellation paths return escrow; no funds are drawn before work. |
| Worker cancels last-minute | ✅ | Reliability/strike penalty, **no financial penalty** since no funds are drawn (worker ghosting path in `src/lib/escrow/tick.ts`). |

## Work-in-Progress & Payments (the phase-escrow core, v2)
| Scenario | Status | How / where |
|---|---|---|
| Worker no-show | ✅ | Contest window + evidence; the no-show flow flags the hire and routes to resolution. |
| Worker misses a phase deadline & goes silent | ✅ | Escalating reminders → grace period → phase **auto-cancelled**, escrow rolled back to client, strike + **delivery-stake forfeiture** (`runEscrowTick`, verified on-chain in Phase 8). |
| Client silent during verification window | ✅ | **≤2 reminders**, then **auto-release** to the worker at window close — and the contract enforces the timing on-chain (`autoRelease` reverts before `releaseEligibleAfter`). Verified 0→₹3,000 in Phase 8. |
| Client uses "Request Changes" to stall | ✅ | **Revision-round cap of 2** (`requestChangesAction`); further requests must become a formal complaint. |
| Genuine quality/scope dispute | ✅ | Full **commit-reveal jury**, scoped to that phase's escrow only; escrow frozen on escalation (`raiseDispute`) (Phase 11). |
| On-chain deposit fails after fiat success | ✅ | Escrow tx failures are caught and returned as errors; DB writes only commit **after** the on-chain tx confirms (no double-charge; `fundPhaseAction` try/catch). On/off-ramp itself is mocked. |
| Chain congestion / RPC outage | ✅ | Writes wait for the receipt and never mark complete on failure; **read-only balance views degrade to the cached balance** and label "chain offline" instead of erroring (`getWalletSummary`). |
| Wallet credential loss (custodial) | 🟡 | Custodial keys are re-derivable from the keystore in dev; production recovery needs the managed-custody provider (checklist). |
| Regulatory / AML flag | ⚪ | Compliance hold-and-review is an admin/ops queue; AML provider integration is a checklist item. |
| Smart-contract bug | ✅ | `Pausable` circuit-breaker (PAUSER role) + `ReentrancyGuard` + **no-drain guarantee** (31 contract tests, incl. a real reentrancy attack). Audited upgrade path is pre-mainnet. |
| Worker delivery-stake shortfall | ✅ | Hire isn't confirmed until the stake is lockable; enforced in the stake flow. |

## Jury
| Scenario | Status | How / where |
|---|---|---|
| Not enough eligible jurors | ✅ | **Value-tiered panel sizing** (3/5/7) with the case held + escrow frozen until a panel forms (`escalateToJury`). |
| Non-responsive juror | ✅ | Commit/reveal deadlines + **quorum on a strict majority of revealers**, so a silent juror can't stall a verdict; slashing on non-majority. |
| Collusion suspicion | ⚪ | Agreement-rate reputation is tracked per juror; pattern-detection → compliance is an ops task. |
| Frivolous appeal | ✅ | **Appeal is once per case**; a second appeal is refused (`appealCase`). |
| One-sided evidence | ✅ | Evidence is disclosed neutrally to the anonymized panel; it is never an automatic loss. |

## Admin
| Scenario | Status | How / where |
|---|---|---|
| Simultaneous duplicate actions | ✅ | State transitions are status-guarded + idempotent (e.g. escrow tick, jury commit/reveal reject repeats); DB unique constraints (e.g. one review per hire+direction). |
| Compromised admin account | ✅ | Full **immutable audit log** on every privileged action, short 8h sessions, mandatory TOTP 2FA, now rate-limited login. |
| Mass false reporting (brigading) | ⚪ | Anomaly-based hold is an ops task; complaints route through admin triage rather than auto-action. |

## Platform-wide
| Scenario | Status | How / where |
|---|---|---|
| Third-party outage (payment / RPC) | ✅ | RPC outage handled by cached-balance degradation + never-falsely-complete writes; multi-provider fallback + async retry queues are a scale/ops item (checklist). |

**Verified critical paths (automated):** escrow rules (31 contract tests), business-day calendar
(6), commit-reveal integrity + median + quorum (`voting.test.ts`), two-DB boundary
(`boundary.test.ts`), auth rate limiting (`rateLimit.test.ts`). Run with `npm test` + `npm run test:contracts`.
