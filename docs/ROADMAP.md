# ChainWork — Fix & Completion Roadmap

_Created 2026-09-27 · baseline HEAD `349ab55` · companion to [PROJECT_ANALYSIS.md](PROJECT_ANALYSIS.md)_

Goal: make ChainWork **correct, secure and fully working on testnet (Polygon Amoy)**. That
covers the 8 analysis findings (F1–F8), the wallet-integration problems (W1–W10) and the
browser-extension problems (E1–E8). Mainnet readiness is a separate, later track (section 9).

> **Payment-first execution:** the wallet and extension work (sections 1–2 below), plus receipts,
> demo-mode payments, the multi-crypto payment window and the live wallet ticker, is broken into
> phases P0–P7 in [PAYMENT_SYSTEM_PLAN.md](PAYMENT_SYSTEM_PLAN.md). That plan runs **before**
> the jury and cleanup work here. **Status (2026-10-03): P0–P7 done** on the local chain; going
> live on Amoy follows [RUNBOOK_DEMO_TO_TESTNET.md](RUNBOOK_DEMO_TO_TESTNET.md).

---

## 1. The new findings: wallet and browser extension

These were found after the first report, by reading the wallet code and by running **read-only**
checks against the Amoy deployment configured in `.env`.

### Wallet integration (W)

| ID | Problem | Evidence |
|---|---|---|
| **W1** | **The Amoy setup can't move money.** (a) `CHAIN_MNEMONIC` is the **public Hardhat test phrase**, so the relayer is `0xf39F…2266` (Hardhat account #0) and every custodial wallet's private key is public. Sweeper bots drain these addresses on every public testnet; the relayer holds **0.0005 POL**. (b) The relayer **does not have `ATTESTOR_ROLE`** on the deployed escrow `0xfd80…0dd8`: `deploy.js` gives every role to the *deployer* key, not to the relayer. (c) So every gas top-up fails ("relayer out of gas"), and `markDelivered` / `approveRelease`-relay / `autoRelease` / `raiseDispute` / `resolveDispute` / `refundToClient` would all revert. | Live `hasRole` read → `false`; balance read; `contracts/scripts/deploy.js:26` |
| **W2** | **Funding creates money out of nothing.** `fundPhase` mints any shortfall straight into the client's wallet (`ensureStablecoin`), so the client's balance and "Add funds" have no effect, and escrow is never really funded by the client. | `src/lib/chain/escrow.ts` `ensureStablecoin` |
| **W3** | **Balances are wrong after linking a wallet.** Once an external wallet is linked, the balance shown is the *external* address's; "Withdraw" still moves the *custodial* balance. Earnings already in the custodial wallet disappear from the UI, and withdraw reports moving money the user can't see. | `src/lib/chain/wallet.ts` `getWalletSummary` vs `withdrawCustodial` |
| **W4** | **Linking a wallet only half works.** For **workers**, it only affects phases funded *after* linking (the payee is fixed at funding time). For **clients** it does nothing: funding and refunds always use the custodial address, yet the UI says "payouts now settle to this address". | `fundPhase` records `msg.sender` = custodial client |
| **W5** | **The ownership proof is weak.** The nonce is made in the browser and never checked by the server. There's no domain / chain / expiry binding (not Sign-In with Ethereum, EIP-4361), no re-authentication, no notification, no cooldown, and the same address can be linked by several users. Anyone with a hijacked session can quietly redirect a worker's future payouts. | `ExternalWalletConnect.tsx`, `verifyAndLinkWalletAction` |
| **W6** | **Parallel transactions can collide.** One relayer account signs everything, from concurrent requests *and* the cron. Two transactions sent at once can get the same nonce ("nonce too low" / "replacement underpriced"). | `escrow.ts`, `gas.ts`, `tick.ts` |
| **W7** | **Money actions wait on chain confirmations inside a single request.** Funding can need 4 confirmed transactions (gas top-up → mint → approve → fund) within one server action. On Amoy this can outlast the host's time limit: the user sees "failed" while the transactions still land, and the DB and chain drift apart (same root cause as F7). | `fundPhase`, `waitFor` |
| **W8** | **Gas top-ups get expensive at scale.** Every custodial wallet is topped up to 0.05 POL. That's fine for a demo, costly with many users, and the gas is stranded in each wallet. | `src/lib/chain/gas.ts` |
| **W9** | = **F6**: `MOCK_BLOCKCHAIN` only covers part of the chain code (balances are faked, wallet top-up/withdraw hit the real chain). | |
| **W10** | **The token is invisible in wallets.** Users can't see cwINR in MetaMask (no `wallet_watchAsset`), escrow addresses aren't shown, and explorer links only work on Amoy. | `explorerTxBase()` |

### Browser-extension integration (E) — why it "doesn't work hand in hand"

| ID | Problem |
|---|---|
| **E1** | **Only one extension is ever seen.** The app reads raw `window.ethereum`. With several extensions installed (MetaMask + Coinbase + Brave/Phantom), whichever claims `window.ethereum` last wins. There's no EIP-6963 multi-wallet discovery and no wallet picker. |
| **E2** | **No network handling.** The app never checks `chainId` and never calls `wallet_switchEthereumChain` / `wallet_addEthereumChain` for Amoy (80002). A user on Ethereum mainnet can link, but can never transact or see funds. |
| **E3** | **No live connection state.** No `accountsChanged` / `chainChanged` / `disconnect` listeners. If the user switches account in MetaMask, the site doesn't notice, and the linked address and the active account can silently differ. State is refreshed with a full `window.location.reload()`. |
| **E4** | **The extension can't sign any real transaction.** It's used for one thing only: a `personal_sign` to link. A client can't fund, approve or refund from MetaMask, and a worker can't move custodial funds to their own wallet. The contract already allows direct client calls (`approveRelease` accepts `msg.sender == e.client`); the app just never uses them. |
| **E5** | **Raw error messages.** Errors such as user-rejected (4001), request already pending (-32002) and wrong chain are shown to users unchanged. |
| **E6** | **No mobile support.** Mobile browsers have no injected wallet, and the WalletConnect button is disabled ("coming soon"). |
| **E7** | **The security policy (CSP) will block a proper wallet stack.** `connect-src 'self'` blocks browser-side RPC reads and the WalletConnect relay (`wss://relay.walletconnect.com` etc.). |
| **E8** | **No wallet library.** CLAUDE.md says "wagmi/viem", but wagmi isn't installed. There's no provider, no SSR-safe cookie storage, and no shared hooks. |

---

## 2. Principles for the fix pass

1. **Stop the bleeding first:** fix what is insecure or broken on the live testnet before polishing anything.
2. **The chain is the source of truth for money.** The DB mirrors the chain and must be able to rebuild itself from on-chain state (reconciliation), never the other way round.
3. **Every state change has a guard.** Each action checks the current status, and each state machine (phase, dispute) has one table of allowed transitions.
4. **Two wallet modes, one escrow.** *Custodial* (default, no keys, gas sponsored) and *self-custody via extension* (the user signs in their wallet) both drive the same contract and the same DB records.
5. **Each phase ships with tests** and ends with the build-manual checklist (typecheck, lint, `npm test`, `npm run test:contracts`, browser check), a commit, and CLAUDE.md / PROGRESS.md updates.

Effort key: **S** ≈ under half a day · **M** ≈ 1–2 days · **L** ≈ 3–5 days.

---

## 3. Phase R0 — Baseline (S)

- [ ] Run `tsc --noEmit`, `npm run lint`, `npm test`, `npm run test:contracts`; record the baseline in PROGRESS.md.
- [ ] Decide the dev targets. Recommended: **local Postgres + local Hardhat chain** for development, with Neon + Amoy only for the deployed demo, so fix work never touches shared data.
- [ ] Add `.env.local.example` with a complete local profile (local DB URLs, Hardhat chain, mock SMS/email).

**Done when:** a clean baseline is recorded and a fresh clone runs end to end locally from the README.

---

## 4. Phase R1 — Stop the bleeding: security & live-config (M) · _do first_

| # | Item | Covers | Size |
|---|---|---|---|
| 1 | **Remove the `000000` 2FA bypass.** If a demo shortcut is still wanted, allow it only when `ADMIN_2FA_DEMO_BYPASS=true` **and** `NODE_ENV !== "production"`, and write an audit entry when it's used. | F1 | S |
| 2 | **Move rate limiting to a shared store** (Upstash Redis / Vercel KV), keeping the in-memory limiter as a dev fallback. Apply it to consumer login, admin login, OTP, forgot-password. | F1 | M |
| 3 | **Rotate the chain keys.** Generate a private mnemonic (never the Hardhat phrase) and keep it only in `.env` / Vercel secrets. Add a startup guard that **refuses to boot on a non-local chain with the public test mnemonic**. | W1 | S |
| 4 | **Fix role wiring.** `deploy.js` grants `ATTESTOR_ROLE` + `DISPUTE_ROLE` to the relayer address (from env) and writes `deployments/<net>.json`. Add a one-off `scripts/grant-roles.js` for the existing Amoy deployment, run by you with `DEPLOYER_KEY`. | W1 | S |
| 5 | **Fund the relayer and monitor it.** Top up the new relayer from the Amoy faucet. Add `/api/health/chain` (RPC reachable, contracts deployed, relayer roles, relayer gas above threshold); the admin dashboard shows it and alerts when gas is low. | W1 | S |
| 6 | **Rotate every demo password in deployed environments.** `admin123` / `password123` stay only in local seeds. | F1 | S |

**Done when:** `000000` is rejected in production; a health check against Amoy shows relayer roles `true` and gas above threshold; one full fund → deliver → approve cycle succeeds on Amoy with real tx hashes.

---

## 5. Phase R2 — State machines & chain reliability (L)

### 5a. Escrow phase state machine
- [ ] One `PHASE_TRANSITIONS` map in `src/lib/escrow/stateMachine.ts`; every phase action calls `assertTransition(from, to)`.
- [ ] **F4:** `requestChangesAction` only from `DELIVERED` / `VERIFICATION_WINDOW_OPEN`.
- [ ] Guard DB writes with `updateMany({ where: { id, status: <expected> } })` so a double-click or a parallel cron tick can't apply a change twice.

### 5b. Transaction outbox + reconciliation (fixes F7, W6, W7)
- [ ] New `ChainTx` table: `{ id, kind, phaseId, status: QUEUED|SENT|CONFIRMED|FAILED, txHash, nonce, attempts, error }`.
- [ ] Money actions **queue** their chain work and return immediately with a "processing" status; the UI polls or uses `ThreadPoller`. The DB phase status only moves when the receipt is confirmed.
- [ ] **One sender** for the relayer: a queue processed by the cron worker, plus viem's `nonceManager`, so the relayer's transactions go out one at a time (W6).
- [ ] **Reconciler** in the tick: for each phase, compare `readEscrow()` with DB status and fix drift by following the chain. The retry loop the tick is currently stuck in goes away.
- [ ] Record `EscrowTransaction` rows from confirmed receipts and events, not optimistically.

### 5c. Jury engine (F2, F3)
- [ ] **F2:** add `JurorProfile.adminUserId` (unique, nullable, admin DB only, still no cross-DB FK). Commit/reveal derive `jurorId` **from the session** and never trust one sent from the browser. The case detail page and `JuryVoteControls` show only the viewer's own ballot. Fix the queue filter (`platformUserId: admin.id` → `adminUserId: admin.id`).
- [ ] **F3:** a `DISPUTE_TRANSITIONS` map:
  - `commit` only in `COMMIT` and before `commitDeadline`.
  - `reveal` only in `REVEAL` and before `revealDeadline`.
  - `finalize` only from `REVEAL` (once quorum is met or the reveal deadline has passed).
  - `appeal` / `settle` only from `VERDICT`; an `APPEALED` case can never settle.
  - `settle` flips the status atomically, so it can't run twice.
- [ ] Deadlines enforced by the tick: commit timeout → non-committers replaced or case moves on; reveal timeout → non-revealers slashed.
- [ ] Stakes: minimum stake to be eligible; slash clamped at 0; `panelSize` = jurors actually assigned (or refuse to open the case if too few are eligible).
- [ ] Replace `Math.random()` with `crypto.randomInt`, and record the seed in the audit log so panel draws can be audited.
- [ ] Remove the dead `fee` placeholder.

### 5d. Delivery stake on-chain (F5)
- [ ] Call `chain.lockStake` when a hire at or above `deliveryStakeThresholdInr` is signed, `refundStake` when the hire completes, and `forfeitStake` in the tick's auto-cancel. DB stake status only follows confirmed transactions (through the outbox).

**Done when:** new unit tests cover every allowed and forbidden transition (phase + dispute), a juror can't vote for another juror, double-finalize and double-settle are rejected, and a deliberately dropped DB write is repaired by the reconciler on the next tick.

---

## 6. Phase R3 — Wallet model rework (L)

| # | Item | Covers |
|---|---|---|
| 1 | **Funding spends the real balance.** `fundPhase` no longer mints; if the balance is short, it returns `INSUFFICIENT_BALANCE` and the UI offers "Add funds". Minting happens **only** in the explicit on-ramp (`topUpCustodial`), which later becomes the real payment processor. | W2 |
| 2 | **Clear balances.** `getWalletSummary` returns custodial **and** external balances separately, plus money currently in escrow. Earnings and Payments show all three; demo credit stays labelled "not withdrawable". | W3 |
| 3 | **"Move to my wallet".** A new action sends the custodial balance to the verified external address (signed by the custodial account, gas sponsored). Withdraw to bank/UPI stays as the mock off-ramp. | W3, W4 |
| 4 | **Honest role behaviour.** Worker: the linked wallet is the payee for new fundings, and each phase shows which address it pays. Client: the external wallet is used for self-custody funding (R4) and receives refunds of phases it funded; the UI text says exactly this. | W4 |
| 5 | **Secure linking with SIWE (EIP-4361).** The server issues the nonce (`VerificationToken`, 10-minute expiry, single use). The message binds domain, URI, chainId, address and userId. Linking or changing an address requires an OTP re-check, notifies the user by SMS + email, and new payout addresses take effect on new fundings only after a 24h cooldown. Add a unique constraint on `Wallet.externalAddress`. | W5 |
| 6 | **Finish `MOCK_BLOCKCHAIN` properly.** Replace the scattered `if`s with one `ChainAdapter` interface (`viem` / `mock`). The mock keeps an in-memory or DB ledger, so balances, escrow status, top-up and withdraw behave consistently. | F6 / W9 |
| 7 | **Gas strategy.** Short term: keep top-ups but make them configurable per chain and recover leftover gas on withdraw. Medium term: ERC-2771 forwarder or ERC-4337 paymaster, so custodial wallets never hold gas. | W8 |
| 8 | **Visibility.** "Add cwINR to MetaMask" (`wallet_watchAsset`), escrow contract address plus a per-phase explorer link, and an explorer base URL per chain from config. | W10 |

**Done when:** a client can't fund beyond their balance; after linking, the worker sees custodial, external and in-escrow amounts correctly and can move custodial funds to their wallet; linking without the OTP, or with a replayed or expired SIWE message, is rejected.

---

## 7. Phase R4 — Browser-extension integration done properly (L)

Stack: **wagmi v2 + viem + Reown AppKit (WalletConnect v2)**. The wagmi provider is mounted
only in the worker/client dashboard layouts, with cookie storage for SSR (Next 16 App Router).
Needs a free WalletConnect `projectId` (`NEXT_PUBLIC_WC_PROJECT_ID`).

| # | Item | Covers |
|---|---|---|
| 1 | **Wallet picker.** Install wagmi + AppKit; EIP-6963 discovery lists every installed extension (MetaMask, Coinbase, Brave, Rabby…) plus WalletConnect QR / mobile deep links. Delete the raw `window.ethereum` code. | E1, E6, E8 |
| 2 | **Network handling.** Amoy chain config comes from env. A `useEnsureChain()` hook prompts `switchChain` and falls back to `wallet_addEthereumChain`; a "Wrong network" banner blocks signing until fixed. | E2 |
| 3 | **Live connection state.** Use wagmi's `useAccount` / `useChainId` / `watchAccount`. If the active account ≠ the linked address, show "Connected wallet differs from your linked wallet" with *Switch* / *Re-link* options. No more `window.location.reload()`: after actions, use `router.refresh()`. | E3 |
| 4 | **Self-custody transactions.** A "Pay with my wallet" choice on Fund Phase: (a) check allowance → `approve` in the extension, (b) `fundPhase` in the extension (`msg.sender` = the client's external address), (c) the transaction hash is sent to the server, which **verifies the receipt and the `PhaseFunded` event** (correct phaseId, worker, amount, contract) before the DB moves; this goes through the R2 outbox as an externally-signed entry. Approve-release can also be signed directly by the client. | E4 |
| 5 | **Friendly errors.** One `walletErrorMessage(e)` helper maps 4001, -32002, 4902 (unknown chain), insufficient gas and insufficient token balance to plain-language text with next steps. | E5 |
| 6 | **Security policy update.** Add to `connect-src`: the Amoy RPC, WalletConnect relay/verify/pulse hosts, and AppKit API; `frame-src` for the WalletConnect verify iframe; `img-src` for wallet icons. Check the browser console for CSP violations. | E7 |
| 7 | **Mobile.** WalletConnect QR on desktop; deep links into MetaMask / Trust / Coinbase mobile; test at 375px. | E6 |

**Done when:** in a browser with MetaMask **and** Coinbase installed, both show in the picker; being on the wrong network prompts a switch; switching accounts in the extension updates the UI without a reload; a client funds and approves a phase entirely from MetaMask on Amoy and the DB reflects it only after server verification; WalletConnect works from a phone.

---

## 8. Phase R5 — Completeness & cleanup (M)

- [ ] **Mutual settlement:** wire "Propose settlement" to `proposeSettlement` / `acceptSettlement` (the contract already supports it); both parties see the proposal and accept or decline. (F8)
- [ ] **Check-in:** either build the QR on-site check-in or hide the button until it exists. (F8)
- [ ] Delete dead stubs `addFundsAction` (client/actions) and `withdrawAction` (worker/actions); the UI already uses the real wallet actions. Rename `StubButton` → `ActionButton`, since it runs real actions. (F8)
- [ ] `git rm` the Word lock file `docs/~$ainWork_ProjectII_PPT_Fill_Guide.docx`; add `~$*` to `.gitignore`. (F8)
- [ ] Set `APP_BASE_URL` per environment; derive it from the request host in dev. (Found during local run.)
- [ ] Update CLAUDE.md for the five undocumented commits and every change in this roadmap. Regenerate the demo screenshots (`npm run demo:capture`) so the walkthrough has images.

---

## 9. Phase R6 — Verification & tests (M, runs alongside R2–R5)

- **Unit:** phase + dispute transition tables; SIWE message build/verify (nonce reuse, expiry, wrong domain, wrong chain); reconciler drift cases; `walletErrorMessage` mapping.
- **Contracts:** tests that the deploy script grants relayer roles; tests for the settlement and stake paths used by the app.
- **Integration (local Hardhat):** a full hire lifecycle through the outbox (queue → confirm → DB), including a killed-mid-flight case recovered by the reconciler.
- **E2E (Playwright):** extend `scripts/demo-capture.mjs`. Extension flows use an injected test EIP-1193 provider backed by a Hardhat account, covering EIP-6963 announce, chain switching, account switching, and self-custody fund + approve.
- **Security regression:** rerun the 8-attack assessment in `docs/ChainWork_Security_Assessment.docx`, plus new cases: 2FA bypass, juror impersonation, payout redirection, replayed SIWE message.

---

## 10. Later — pre-mainnet (not needed for "perfect on testnet")

Tracked in [PRE_MAINNET_CHECKLIST.md](PRE_MAINNET_CHECKLIST.md): professional smart-contract audit;
custodial keys in HSM/MPC custody (no shared mnemonic); ERC-4337 paymaster; a real INR on/off-ramp
(payment processor) replacing mint/burn; a real stablecoin (the test token's `mint` is open to anyone);
a multisig as `DEFAULT_ADMIN_ROLE`; verifiable randomness (e.g. Chainlink VRF) for jury draws;
real KYC provider; monitoring and alerting.

---

## 11. Order & dependencies

```
R0 Baseline ──► R1 Stop the bleeding ──► R2 State machines + outbox ──► R3 Wallet model ──► R4 Extension
                                              │                             │                  │
                                              └──────── R6 tests run alongside each phase ─────┘
                                                                                     R5 Cleanup (any time after R2)
```

- R4 depends on R3 (wallet modes and SIWE) and on the R2 outbox (extension-signed transactions are verified through it).
- R1 items 1, 3, 4 and 5 are independent quick wins and can land the same day.

## 12. Decisions needed from you

1. **Self-custody scope:** should clients be able to fund escrow from MetaMask (R4 item 4), or should external wallets stay *payout-only*? _Recommended: support both, with custodial as the default._
2. **WalletConnect:** OK to add Reown AppKit? It needs a free `projectId` from cloud.reown.com.
3. **Amoy contracts:** grant roles on the existing deployment (you run `grant-roles.js` with `DEPLOYER_KEY`), or redeploy fresh? _Recommended: redeploy once R2/R3 contract-facing changes are settled; grant roles now to unblock testing._
4. **Dev databases:** keep developing against Neon, or switch fix work to local Postgres? _Recommended: local._
5. **Shared rate-limit store:** Upstash Redis (free tier) acceptable?
