# ChainWork — Fix & Completion Roadmap

_Created 2026-09-27 · baseline HEAD `349ab55` · companion to [PROJECT_ANALYSIS.md](PROJECT_ANALYSIS.md) ·
**updated 2026-10-09** (F2/F3 fixed; status of every finding + the [future path](#future-path))_

Goal: make ChainWork **correct, secure and fully working on testnet (Polygon Amoy)**, then
grow it into the product the pitch describes. Real money comes only after the
[pre-mainnet checklist](PRE_MAINNET_CHECKLIST.md).

**Where things stand (2026-10-09):**
- The payment rework ([PAYMENT_SYSTEM_PLAN.md](PAYMENT_SYSTEM_PLAN.md), P0–P7) carried out most
  of this roadmap: every wallet (W) and browser-extension (E) problem is fixed or reduced to a
  manual check.
- It is live at https://chain-work-afdm.vercel.app with dummy money, and PhaseEscrow v2 is on
  Amoy.
- Two critical production holes found while deploying are closed: the admin 2FA bypass and the
  public wallet phrase.
- **Still open:**
  - The switch to real testnet transactions (wallet top-ups only).
  - A shared rate-limit store.
  - A few half-built buttons (F8).

---

## 1. Status of every finding

Found 2026-09-27. F1–F8 are written up in PROJECT_ANALYSIS.md. The full write-up of each W / E
problem as found (with evidence) is in this file's history (`git show 9bc4531:docs/ROADMAP.md`).
✅ fixed · 🟡 partly · ⬜ open.

| ID | Problem (short) | Status | Where it was fixed |
|---|---|---|---|
| F1 | Admin 2FA bypass `000000` in production | ✅ 2026-10-03 | `totpPolicy.ts` (`db22435`); prod admins rotated. The shared rate limiter is still ⬜ (R1.2) |
| F2 | One jury admin can cast every juror's vote | ✅ 2026-10-09 | `JurorProfile.adminUserId`; juror from the session (`currentJuror()`), `juryActions.test.ts` |
| F3 | Jury engine never checks case status / deadlines | ✅ 2026-10-09 | `disputeBlocker` + guarded claims in `jury.ts`, `runJuryTick` in the cron; `disputeMachine.test.ts`, `jury.int.test.mts` |
| F4 | "Request changes" on any phase | ✅ P1 | `phaseMachine.ts` |
| F5 | Delivery stake only in the DB | ✅ P3.6 | `src/lib/escrow/stake.ts` |
| F6 / W9 | `MOCK_BLOCKCHAIN` half-covers the chain | ✅ P0 | `PAYMENT_MODE` + `demoAdapter.ts` |
| F7 | DB and chain drift | ✅ P1 | `reconcile.ts` (every cron tick) |
| F8 | Leftover stubs + repo clutter | 🟡 | screenshots done (P7.3); the rest is in [Stage 3](#stage-3--finish-whats-half-built-m) |
| W1 | Amoy can't move money (public phrase, no roles, no gas) | 🟡 | phrase replaced (`29b7fc7`), v2 deployed + roles granted (2026-10-06). **The relayer still has no gas** (Stage 1.2) |
| W2 | Funding mints money out of nothing | ✅ P3.1 | real balance only |
| W3 | Wrong balances after linking | ✅ P3.2–3.3 | every balance separately + "Move to my wallet" |
| W4 | Linking only half works | ✅ P3.4 / P6 | per-phase payout target; clients fund from their own wallet |
| W5 | Weak ownership proof | ✅ P3.5 | SIWE + one-time code + 24 h hold (`src/lib/wallet/link.ts`) |
| W6 | Parallel transactions collide | ✅ P1 | `signerLock.ts` |
| W7 | Money actions wait on chain inside one request | 🟡 P1 | every attempt recorded first + finished by the reconciler; a fully async queue was not built |
| W8 | Gas top-ups expensive at scale | 🟡 P3.7 | leftover gas swept back; paymaster is [Stage 4.5](#stage-4--the-features-the-pitch-promises-l) |
| W10 | Token invisible in wallets | ✅ P4.7 | `wallet_watchAsset`, explorer links |
| E1 | Only one extension seen | ✅ P4 | EIP-6963 picker |
| E2 | No network handling | ✅ P4 | `useEnsureChain()` + wrong-network banner |
| E3 | No live connection state | ✅ P4 | wagmi watchers, no reloads |
| E4 | Extension can't sign real transactions | 🟡 P6 | clients fund from their wallet; **approve-release from the wallet** is [Stage 3.6](#stage-3--finish-whats-half-built-m) |
| E5 | Raw wallet errors | ✅ P4 | `walletErrorMessage()` |
| E6 | No mobile | 🟡 P4 | WalletConnect wired, project id set on Vercel; **never tried from a real phone** (Stage 1.5) |
| E7 | CSP blocks the wallet stack | ✅ P4 | `next.config.ts` |
| E8 | No wallet library | ✅ P4 | wagmi 3 |

**Found while deploying (not in the original analysis):**

| Problem | Status |
|---|---|
| Live admin console open to anyone (`000000` + the public dev TOTP secret + `admin123`) | ✅ 2026-10-03 |
| Production wallets derived from the public Hardhat phrase | ✅ 2026-10-03 |
| Reconciler adopted short / wrong-currency fundings | ✅ P7.1 (regression-tested) |
| WalletConnect set up on every server render (leak) | ✅ P7.2 |
| Refused wallet payments stranded in escrow with no admin tool | ✅ 2026-10-06 — flagged desk + alert. Refund needs v3 on Amoy (Stage 1.1) |

## 2. Status of the original fix plan (R0–R6)

| Phase | Outcome |
|---|---|
| R0 Baseline | ✅ local Postgres + Hardhat for dev (`.env.local`). ⬜ `.env.local.example` was never added (Stage 3.5) |
| R1 Stop the bleeding | ✅ items 1, 3, 4 · 🟡 item 5: health check done; relayer gas, a dashboard card and a low-gas alert open (Stage 1.2 / 2.6) · 🟡 item 6: admins rotated; demo user logins to check (Stage 2.5) · ⬜ item 2: shared rate limits (Stage 2.4) |
| R2 State machines + outbox | ✅ 5a phase machine, 5b ledger + reconciler (synchronous, record-first), 5d stake on-chain · ✅ 5c jury engine (F2, F3, 2026-10-09) |
| R3 Wallet model | ✅ all 8 items (P3, P0, P4) |
| R4 Extension integration | ✅ items 1–3, 5–6 · 🟡 item 4: approve from wallet open · 🟡 item 7: phone untested |
| R5 Cleanup | ✅ `APP_BASE_URL`, docs, screenshots · ⬜ settlement, check-in, dead stubs, lock file → Stage 3 |
| R6 Tests | ✅ four layers (102 unit · 45 contract · 26 integration · 11 E2E + 9 against the live site) · ✅ dispute-transition tests · ⬜ re-run of the 8-attack assessment → Stage 2.7 |

## 3. Principles (unchanged)

1. **Stop the bleeding first:** fix what is insecure or broken on the live site before polishing anything.
2. **The chain is the source of truth for money.** The DB mirrors the chain and repairs itself from it (the reconciler), never the other way round.
3. **Every state change has a guard:** one table of allowed transitions per state machine (phase ✅, payment ✅, dispute ✅).
4. **Two wallet modes, one escrow:** custodial and self-custody both go through `runPayment()` and the same ledger.
5. **Each step ships with tests** and ends with: typecheck, lint, all four test layers, a browser check, a commit, and CLAUDE.md / PROGRESS.md updates.

Effort key: **S** ≈ under half a day · **M** ≈ 1–2 days · **L** ≈ 3–5 days.
Owner: **you** = needs your wallet, account or decision · **dev** = code work.

---

## Future path

```
Stage 1 Go live on testnet ──► Stage 2 Jury integrity + security ──► Stage 4 Pitch features ──► Stage 5 Pre-mainnet
   (days, mostly top-ups)        (~1 week)                    ▲              (weeks)              (audit first)
                                                              │
                                 Stage 3 Finish half-built ───┘  (any time after Stage 1)
```

### Stage 1 — Go live on testnet (S each)

Real transactions on Amoy with free test tokens. Nothing here has real value.

| # | Item | Owner |
|---|---|---|
| 1.1 | **Deploy PhaseEscrow v3 to Amoy** so ADM-10 can refund flagged payments. Send ~0.05 test POL to the deployer `0x6a04Fa4D1CB867106b3A362066a96E2921834cF8` (the deploy measured about 0.074–0.086 POL; it holds 0.075). Code: `deploy.js` option to reuse the live USDT / USDC. After the deploy: allowlist the assets, grant the relayer roles, set `CHAIN_ESCROW_ADDRESS` on Vercel and redeploy. | you (POL) + dev |
| 1.2 | **Fund the relayer:** ≥ 0.5 test POL to `0x4170d656a439E1682004f9Fb1d3302442a076258`. It pays gas for every relayed action. | you |
| 1.3 | **Switch to testnet** with [RUNBOOK_DEMO_TO_TESTNET.md](RUNBOOK_DEMO_TO_TESTNET.md): close the demo-money escrows, set `PAYMENT_MODE=testnet`, smoke-test one payment and its receipt, then run `npm run test:e2e:remote`. | dev, with your go-ahead |
| 1.4 | Set `OPS_ALERT_EMAIL` on Vercel so flagged payments email someone. | you |
| 1.5 | **One manual pass with real wallets:** MetaMask and Coinbase extensions together, plus WalletConnect from a phone. Everything so far used an injected test wallet. | you + dev |
| 1.6 | ✅ **Gmail email provider** committed 2026-10-09 (`EMAIL_PROVIDER=gmail`). | — |

**Done when:** health shows `testnetReady: true`; one fund → deliver → approve cycle confirms on
Amoy through the UI with real tx hashes and a TESTNET receipt; ADM-10 shows "Refund to payer".

### Stage 2 — Jury integrity & security (M)

The jury decides where escrowed money goes, so these are correctness bugs in a money path. Fix
them before anyone relies on a verdict.

| # | Item | Size |
|---|---|---|
| 2.1 | ✅ **F2** (2026-10-09). Juror ↔ login link `JurorProfile.adminUserId`; commit / reveal take the juror from the session; the case page shows only the viewer's ballot; queue filter fixed. Every seeded juror has its own login. | M |
| 2.2 | ✅ **F3** (2026-10-09). `DISPUTE_TRANSITIONS` + `disputeBlocker`; guarded claims for finalize / appeal / settle; finalize waits for every reveal or the deadline; `runJuryTick` replaces non-committers, slashes non-revealers, redraws without quorum; stake floor 0; panel = jurors seated; appeals draw a real fresh panel; `fee` placeholder gone. | M |
| 2.3 | ✅ Verifiable draw (2026-10-09): keccak-seeded Fisher–Yates over the sorted eligible list; seed + eligible + result in the audit log. (Chainlink VRF stays a pre-mainnet item.) | S |
| 2.4 | **Shared rate limits:** Upstash Redis / Vercel KV for consumer login, admin login, OTP and forgot-password. The in-memory limiter stays as the dev fallback. On serverless, the current limiter barely protects anything. | M |
| 2.5 | Check production for the seeded `password123` worker / client logins. If they're there, rotate or remove them before testnet mode. | S |
| 2.6 | Admin dashboard: a chain-health card (the `/api/health/chain` result) plus an `OPS_ALERT_EMAIL` alert when relayer gas runs low. | S |
| 2.7 | Re-run the 8-attack assessment (`docs/ChainWork_Security_Assessment.docx`) plus the new cases: juror impersonation, double finalize / settle, rate limits across instances. | S |

**Done when:**
- Unit tests cover every allowed and forbidden dispute transition.
- A juror can't commit or reveal for another juror.
- Double finalize and double settle are rejected.
- Login limits hold across instances.
- SECURITY.md is updated.

### Stage 3 — Finish what's half-built (M)

| # | Item | Size |
|---|---|---|
| 3.1 | **Mutual settlement:** wire "Propose settlement" to the contract's `proposeSettlement` / `acceptSettlement` through `runPayment()`. Both parties see the proposal, either can accept or decline, and both get receipts. | M |
| 3.2 | **On-site check-in (QR):** build it (worker scans a code the client shows; a timestamp and location go to the hire) or hide the button until it exists. | S hide · M build |
| 3.3 | Delete the dead stubs (client `addFundsAction`, worker `withdrawAction`, `checkInAction` if hidden). Rename `StubButton` → `ActionButton`: it runs real actions now. | S |
| 3.4 | `git rm` the Word lock file `docs/~$ainWork_ProjectII_PPT_Fill_Guide.docx`; add `~$*` to `.gitignore`. | S |
| 3.5 | Add `.env.local.example` (local DBs, Hardhat chain, mock SMS / email), so a fresh clone runs from the README. | S |
| 3.6 | **Approve release from the client's own wallet** (`approveRelease` signed in MetaMask, verified server-side like funding). It's relayed today. | M |
| 3.7 | Payment window: a network-fee estimate in the quote. | S |
| 3.8 | Statements: wallet section as a running balance (today it shows in / out / net). | S |
| 3.9 | Local dev: run the local chain with state kept across restarts (anvil `--state`), or a re-seed script. A restarted Hardhat node forgets every balance and escrow. | S |
| 3.10 | Refresh the walkthrough `.docx`: `pip install python-docx`, then `python scripts/build-demo-docx.py`. | S |

### Stage 4 — The features the pitch promises (L)

The LinkedIn pitch video lists these as coming next. Each one is testnet / sandbox first.

| # | Feature | Notes | Size |
|---|---|---|---|
| 4.1 | **Usernames & public IDs** | A unique handle + a short public UID per user, shown on profiles, contracts and receipts instead of internal IDs (noted as a future feature in the demo-accounts doc). | M |
| 4.2 | **More chains** | Ethereum Sepolia (ETH, USDC, WBTC) and BNB testnet (BNB, USDT): PhaseEscrow per chain, the payment window's network picker, health checks per chain (payment plan 6.6b / 6.6c). | M each |
| 4.3 | **UPI & card payments** | A licensed Indian payment processor in sandbox mode for Add funds and Withdraw, replacing the mint / transfer mocks (`topUpCustodial` / `withdrawCustodial`). It needs idempotent webhooks and a "held pending" state for partial failures. | L |
| 4.4 | **Official KYC** | A real KYC + liveness vendor in sandbox mode instead of auto-approve (`submitKycAction`), plus the rejected → manual-review path on the admin KYC queue. | L |
| 4.5 | **Gasless custodial wallets** | ERC-4337 paymaster or ERC-2771 forwarder, so custodial wallets never hold gas and the relayer stops topping them up (W8). | L |
| 4.6 | **Real-time messaging** (optional) | Replace the 5-second poll with a push channel once there are real users. | M |

### Stage 5 — Pre-mainnet (real money)

The [pre-mainnet checklist](PRE_MAINNET_CHECKLIST.md) is the gate. Nothing moves real money
before it is done:
- A **professional smart-contract audit** of PhaseEscrow, including v3's re-fund-after-refund
  rule.
- HSM / managed custody with no mnemonic in an env var.
- A multisig as `DEFAULT_ADMIN_ROLE` and `PAUSER_ROLE`, with a pause runbook.
- Verifiable randomness for jury draws.
- The real processor and KYC from Stage 4.
- Monitoring, backups and a tested restore.
- Legal / AML review per jurisdiction.
- Then a soft launch: one city, one or two categories, capped job values.

---

## 4. Decisions

**Settled:**
1. Self-custody scope: clients can fund from their own wallet; custodial stays the default. ✅
2. WalletConnect: our own EIP-6963 picker, with AppKit only as the QR modal; the project id is set on Vercel. ✅
3. Amoy contracts: redeployed fresh as v2 (2026-10-06) rather than patching v1. ✅
4. Dev databases: local Postgres + local Hardhat; Neon + Amoy only for the deployed site. ✅

**Needed from you:**
1. **Shared rate-limit store** (Stage 2.4): is the Upstash Redis free tier OK? (Open since 2026-09-27.)
2. **Check-in** (Stage 3.2): build QR check-in now, or hide the button?
3. **A demo-money copy after the switch?** Once production runs on testnet, should a demo-money
   site stay online for pitching? It needs its own database, because Preview shares
   production's today.
4. **Providers for Stage 4:** which payment processor (UPI + cards) and which KYC vendor. Both
   need accounts you create; sandbox keys first.
