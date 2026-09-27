# ChainWork — Payment System Implementation Plan

_Created 2026-09-27 · baseline HEAD `349ab55` · status: **P0 done · P1 code complete, UI check paused (2026-09-28) — see PROGRESS.md "Resume here"**_

This plan covers ROADMAP sections 1 and 2: the wallet problems (W1–W10), the browser-extension
problems (E1–E8) and the fix-pass principles. It also covers four new requirements:

1. **Receipts:** a downloadable **PDF receipt** (UPI-style) for every transaction, and a ledger / statement. **Failed transactions are recorded and get a receipt too.**
2. **Demo money:** payments keep using **dummy money while the bypass flag is on in production**, *including* MetaMask users, until that flag is removed.
3. **Payment window:** a **multi-crypto payment window**. The payer picks a currency and network; the worker's receiving wallet address is shown; the payer pays from their own wallet.
4. **Live wallet panel:** after connecting a wallet extension (Chrome, Edge or any browser), the site **tracks the wallet live every ~12 s** and shows the non-zero holdings in an **animated rolling ticker**.

The payment-related analysis findings are included: **F4** (phase status guard), **F5** (delivery stake on-chain), **F6** (mock mode) and **F7** (DB-chain drift).
Not in this plan, done after it: F1 (2FA bypass — a one-line fix, recommended to slip in early anyway), F2/F3 (jury), F8 (cleanup).

---

## 0. How I've interpreted the requirements (and the hard limits)

| Requirement | Interpretation / constraint |
|---|---|
| "Extension" | The **user's wallet extension** (MetaMask, Coinbase Wallet, Brave, Rabby…), not a ChainWork-built browser extension. ChainWork detects and talks to it. We don't need to build or publish our own extension. |
| Chrome/Edge, or universal | Covered universally with the **EIP-6963** standard: every Chromium browser (Chrome, Edge, Brave, Opera, Arc) **and Firefox** has MetaMask. **Safari and mobile** use **WalletConnect** (QR code or deep link into the wallet app). |
| BTC, XRP in the wallet | MetaMask's dapp interface (`window.ethereum`) only covers **EVM networks** (Ethereum, Polygon, BNB Chain…). Native Bitcoin and XRP can't be read or paid through it. We support **ETH, POL, BNB, USDT, USDC** natively, plus **BTC and XRP only in wrapped form** (e.g. WBTC) where a wrapped token exists. Native BTC/XRP would need other wallets (Xverse, Xaman) — a possible later add-on. |
| "Pay to the worker's wallet address" | The worker's receiving address **is shown** in the payment window, but the money goes **into the escrow contract, which releases to that address**. Paying the worker directly would remove escrow, which is the product's core protection. A direct "tip / pay outside escrow" option can be added later if you want it (decision D1). |
| Dummy money while the flag is on | Today that flag is `MOCK_BLOCKCHAIN=true` on the deployed site. It is replaced by an explicit **payment mode** (section 1) that keeps dummy money working for **everyone, including MetaMask users**. |

---

## 1. Payment modes — the "dummy money" switch, made explicit and safe

`MOCK_BLOCKCHAIN` becomes **`PAYMENT_MODE`**. For backward compatibility, `MOCK_BLOCKCHAIN=true` still means `demo`, so the deployed site keeps working unchanged.

| Mode | Money | Chain | What a MetaMask user does | Receipt stamp |
|---|---|---|---|---|
| **`demo`** (current production) | Demo credit (₹40,000 per wallet, **not withdrawable**) | None — simulated | Connects the real wallet, picks a currency, **signs an EIP-712 "payment authorisation"** in MetaMask. This is a signature only: no gas, no funds move. The server verifies it and moves demo credit. | **DEMO — no real money** watermark |
| **`testnet`** (when the flag is removed) | Free test tokens | Polygon Amoy (+ optional Sepolia / BSC testnet) | Real transactions signed in MetaMask, using test tokens from a faucet | **TESTNET — no real value** watermark |
| **`mainnet`** | Real money | — | **Hard-locked.** The app refuses to boot unless `PAYMENT_MODE=mainnet` **and** `MAINNET_AUDIT_APPROVED=<audit-ref>` are both set (pre-mainnet checklist). | none |

Safety rules:
- **Removing the flag never means real money.** An unset mode defaults to `testnet`, never `mainnet`.
- **Switching to `testnet` is gated by a health check** (`/api/health/chain`): relayer has the right permissions, relayer has gas, contracts are deployed, and the key phrase is not the public one. If the check fails, payments show "Payments temporarily unavailable" instead of failing halfway.
- **A banner on every payment surface** states the mode ("Demo money — nothing here is real").
- **The mode is recorded on every payment and every receipt**, so demo records can never pass for real ones.

---

## 2. Target architecture

```
Browser (worker / client dashboard)
 ├─ WalletProvider (wagmi + EIP-6963 + WalletConnect)  ── connect / switch network / sign
 ├─ WalletTicker ◄── polls /api/wallet/portfolio every 12 s (paused when tab hidden)
 ├─ PaymentWindow ── quote ► sign (demo: EIP-712 · testnet: approve + fund tx) ► submit
 └─ Receipts / Statement ── GET /api/receipts/[no]/pdf

Server
 ├─ PaymentService  (one entry point for every money movement)
 │    ├─ ChainAdapter: "viem" (testnet/mainnet) | "demo" (ledger-only, no chain)
 │    ├─ PaymentTransaction  ← every attempt recorded: INITIATED → SUBMITTED → CONFIRMED | FAILED | CANCELLED | EXPIRED
 │    ├─ LedgerEntry         ← debit/credit rows with running balances (wallet · escrow · demo credit)
 │    └─ Receipt             ← issued at every final state (success AND failure), numbered + hashed
 ├─ Tx outbox + one relayer sender (nonce-safe) ── cron tick processes the queue + reconciles with chain
 ├─ QuoteService  ── INR ⇄ crypto rates (CoinGecko, cached; fixed table in demo mode), 5-min price lock
 └─ PortfolioService ── multi-chain balance reads (batched per chain), 10 s server cache

Chain (testnet mode)
 └─ PhaseEscrow v2 — multi-token + native-coin escrow (allowlisted assets), releases to the worker's address
```

**The fix-pass principles (ROADMAP §2), as they show up in this design:**
1. **Stop the bleeding first:** Phase P0.
2. **The chain is the source of truth:** the P1 reconciler; receipts are issued only from confirmed transactions.
3. **Every state change has a guard:** the payment and phase state machines in P1.
4. **Two wallet modes, one escrow:** custodial *and* extension payments go through the same PaymentService and ledger.
5. **Tests every phase:** the "Done when" checks per phase, plus P7.

---

## 3. Phases

Effort key: **S** ≈ under half a day · **M** ≈ 1–2 days · **L** ≈ 3–5 days.

### P0 — Foundations & safety (M)
| # | Task | Covers |
|---|---|---|
| 0.1 | Baseline: typecheck, lint, `npm test`, `npm run test:contracts`; switch fix work to local Postgres + local Hardhat (`.env.local.example`). | — |
| 0.2 | `PAYMENT_MODE` config module (`src/lib/payments/mode.ts`) with the rules in section 1, the `MOCK_BLOCKCHAIN` alias, and the refuse-to-boot checks. | Requirement 2 |
| 0.3 | A **ChainAdapter** interface replacing the scattered `if (MOCK_BLOCKCHAIN)` checks. `demo` adapter = ledger-only and internally consistent: balances, escrow status, top-up, withdraw. | F6 / W9 |
| 0.4 | New private key phrase (the public Hardhat phrase is refused on non-local chains); `deploy.js` + `grant-roles.js` give the relayer `ATTESTOR_ROLE` and `DISPUTE_ROLE`; fund the relayer; `/api/health/chain`. | W1 |
| 0.5 | Mode banner component on Payments, Earnings, hire pages and the payment window. | Requirement 2 |

**Done when:** the site behaves exactly as today with `MOCK_BLOCKCHAIN=true`; with `PAYMENT_MODE=testnet` the health check passes on Amoy and one fund → deliver → approve cycle confirms on-chain.

### P1 — Payment ledger, transaction outbox, state machines (L)
| # | Task | Covers |
|---|---|---|
| 1.1 | **`PaymentTransaction`** model (see section 4). A row is created the moment "Pay" is pressed (`INITIATED`), **before** any chain call, so every attempt exists even if it fails. | Requirement 1 (failures recorded) |
| 1.2 | **`LedgerEntry`** model: debit/credit per user and per bucket (wallet / escrow / demo credit) with a running balance. The existing `EscrowTransaction` rows are backfilled into it and the old table becomes read-only. | Requirement 1 (ledger) |
| 1.3 | **Payment state machine:** `INITIATED → SUBMITTED → CONFIRMED`; failure paths `FAILED` (reverted, out of gas, RPC error, timeout), `CANCELLED` (rejected in wallet), `EXPIRED` (price lock ran out). Each failure stores a code and a plain-language reason. | Principle 3 |
| 1.4 | **Phase state machine** (`PHASE_TRANSITIONS`) plus status-guarded writes; `requestChangesAction` only from `DELIVERED` / `VERIFICATION_WINDOW_OPEN`. | F4 |
| 1.5 | **Transaction outbox:** money actions queue their chain work and return a "processing" status immediately. **One relayer sender** (viem `nonceManager`, one transaction at a time), processed by the cron worker and triggered right away after each action. | W6, W7 |
| 1.6 | **Reconciler** in the tick: compare `readEscrow()` with the DB, repair drift by following the chain, and mark stuck `SUBMITTED` transactions after a timeout (`FAILED` or `CONFIRMED`, depending on the receipt). | F7 |
| 1.7 | Payment status endpoint `GET /api/payments/[id]` for the live UI (P5). | — |

**Done when:** every money action (fund / release / auto-release / refund / split / withdraw / top-up) produces a `PaymentTransaction` + `LedgerEntry` rows; a deliberately killed request is repaired on the next tick; a wallet rejection is recorded as `CANCELLED`; forbidden phase transitions are rejected by tests.

### P2 — Receipts & statements, as downloadable PDFs (M–L)
| # | Task |
|---|---|
| 2.1 | **`Receipt`** model: issued when a transaction reaches a final state — **success *and* failure**. Number format `CW-RCPT-2026-000123` for successful payments and `CW-FAIL-2026-000045` for failed ones (separate gap-free yearly sequences, see D7). A **SHA-256 of the receipt content** is stored, so a receipt can't be altered afterwards. |
| 2.2 | **PDF generator** (`src/lib/receipts/pdf.ts`): **pdf-lib + fontkit** (pure JS, runs on Vercel) with embedded **Outfit** + **Noto Sans** (for the ₹ glyph) and `qrcode` for the verify QR. |
| 2.3 | **UPI-style receipt layout:** ChainWork header → large status (✓ Success / ✗ Failed / ⏳ Pending) → **₹ amount** + crypto amount and rate → *Paid to* (worker name + wallet address) / *From* (client name + address) → Receipt no. · tx hash · network · block · confirmations · gas fee (who paid it) · date/time (IST) → purpose (Job · Phase n "name" · Hire ref) → escrow contract → **mode watermark** (DEMO / TESTNET) → QR to the verify page → footer disclaimer. **Failed receipts** show the failure reason and "No money was moved" (or "Refunded" when that applies). |
| 2.4 | **Download** `GET /api/receipts/[receiptNo]/pdf`: Node runtime, only the payer, payee or an admin (through the bridge) can download it; sent as an attachment named `ChainWork-Receipt-CW-RCPT-….pdf`. |
| 2.5 | **Public verify page** `/receipts/verify/[receiptNo]?h=<hash>`: shows status, amount and hash match, and hides personal details (masked names and addresses). This is what the QR code opens. |
| 2.6 | **Statement / ledger PDF** for a date range: opening balance, every entry (debit / credit / running balance), closing balance; one per user, per bucket. |
| 2.7 | **Where receipts show up:** a "Transactions" table with a **Download receipt** button on CL-08 Payments and WK-12 Earnings, a per-phase receipt link on the hire pages, the success/failure toast, a notification with a link, and an email with the receipt link (existing `notify()`). Payer sees "Paid", payee sees "Received" for the same transaction. |

**Done when:** a funded phase, a released phase, a refund, a withdrawal and a *failed* funding each produce a correct downloadable PDF; the verify QR resolves; the stored hash matches the rendered content; demo receipts carry the watermark.

### P3 — Wallet model rework (L)
| # | Task | Covers |
|---|---|---|
| 3.1 | Funding spends the **real balance**; no more hidden minting. A shortfall returns `INSUFFICIENT_BALANCE` → the UI offers Add funds. Minting happens only in the explicit on-ramp. | W2 |
| 3.2 | `getWalletSummary` returns **custodial, external, in-escrow and demo-credit** amounts separately, and the UI shows all of them. | W3 |
| 3.3 | **"Move to my wallet"** (custodial → verified external address), with a receipt. | W3, W4 |
| 3.4 | Honest per-role behaviour: worker payee address shown per phase; client external wallet used for self-custody funding (P6) and receives refunds of phases it funded. | W4 |
| 3.5 | **Wallet linking via Sign-In with Ethereum (EIP-4361):** server nonce (single use, 10 min), domain + chain + URI + userId in the message, **OTP re-check** to link or change, SMS + email notice, **24 h cooldown** before a new payout address is used for new fundings. | W5 |
| 3.6 | **Delivery stake on-chain** (lock / refund / forfeit through the outbox, with receipts). | F5 |
| 3.7 | Gas: amounts configurable per chain, leftover gas recovered on withdraw; a gasless option (ERC-2771 / 4337) noted for later. | W8 |

**Done when:** a client can't fund beyond their balance; after linking, all balances are correct; linking without the OTP, or with a replayed or expired SIWE message, is rejected.

### P4 — Universal wallet connection (M)
| # | Task | Covers |
|---|---|---|
| 4.1 | Install **wagmi v2 + viem + Reown AppKit** (WalletConnect v2). The `WalletProvider` goes **only** in the worker/client dashboard layouts, with cookie storage for SSR. Delete the raw `window.ethereum` code. | E1, E8 |
| 4.2 | **Wallet picker** through EIP-6963 (every installed extension, with its icon) plus WalletConnect QR / mobile deep link. | E1, E6 |
| 4.3 | **Network handling:** a `useEnsureChain()` hook → `switchChain`, falling back to `wallet_addEthereumChain`; a "Wrong network" banner blocks signing. | E2 |
| 4.4 | **Live connection state:** reacts to account / network / disconnect changes without reloading; warns when the active account ≠ the linked account, with *Switch* / *Re-link* options. `router.refresh()` replaces the full page reload. | E3 |
| 4.5 | `walletErrorMessage()` turns wallet error codes (4001, -32002, 4902, insufficient gas / balance) into plain-language text with next steps. | E5 |
| 4.6 | **CSP update:** `connect-src` for the RPC and WalletConnect relay / verify / pulse hosts, `frame-src` for the WalletConnect verify iframe, `img-src` for wallet icons. | E7 |
| 4.7 | "Add cwINR / USDT to MetaMask" (`wallet_watchAsset`); explorer links per chain. | W10 |

**Browser support:** Chrome, Edge, Brave, Opera, Arc and Firefox (extension); Safari and all mobile browsers (WalletConnect / wallet in-app browser).

**Done when:** with MetaMask **and** Coinbase installed, both appear in the picker; being on the wrong network prompts a switch; switching accounts in MetaMask updates the page within a second, with no reload; no CSP errors in the console.

### P5 — Live wallet tracker + rolling ticker (M)
| # | Task |
|---|---|
| 5.1 | **Portfolio endpoint** `GET /api/wallet/portfolio?address=`: reads native coins + an allowlist of tokens across the supported networks (one batched read per chain), 10 s server cache, keyed RPC (Alchemy or similar) to avoid public-RPC rate limits. Returns only **non-zero** assets: `{symbol, name, network, amount, decimals, icon, inrValue}`. |
| 5.2 | **Live polling every 12 s** (inside your 10–15 s window), paused when the tab is hidden and refreshed immediately when it becomes visible or a transaction confirms. |
| 5.3 | **Pending-transaction tracker:** any `SUBMITTED` payment is polled (`/api/payments/[id]` + the transaction receipt) every 10 s, with a status chip ("Confirming… 3/12 blocks") and a toast + receipt link on success or failure. |
| 5.4 | **`WalletTicker` component**, the rolling display:<br>• cycles through **non-zero holdings only**, about 3 s each;<br>• **symbol change**: each letter spins vertically through random characters, **up or down at random, with staggered timing**, then lands on the next symbol (`BTC → ETH → POL…`);<br>• **amount change**: odometer-style digit columns roll from the old value to the new (`2 → 5 → 50`), each column in a random direction;<br>• coin icon crossfades; network tag ("Polygon", "test") and ≈ ₹ value underneath;<br>• pauses on hover; click opens the full holdings panel;<br>• **reduced-motion** users get a simple crossfade; screen readers get a static list (no announcement spam). |
| 5.5 | Placement: in the top bar (compact) and on Earnings / Payments (large), visible once a wallet is connected; "No balances on supported networks" when empty. |

**Done when:** connecting a wallet with several non-zero assets starts the ticker within a few seconds; a balance change on-chain shows up within ~12 s; the animation matches the spec and passes the reduced-motion check.

### P6 — Multi-crypto payment window (L)
| # | Task |
|---|---|
| 6.1 | **PhaseEscrow v2** contract: allowlisted assets (ERC-20 **and** native coin); `fundPhase(phaseId, worker, token, amount)` + `fundPhaseNative(phaseId, worker) payable`; release / refund / split / settlement pay out **in the same asset**. The existing tests are extended to every asset type (including a fee-on-transfer / reentrant-token case), then redeployed on Amoy (optionally also Sepolia and BSC testnet). |
| 6.2 | **QuoteService:** INR → asset rate from CoinGecko (server-side, 60 s cache; fixed rates in demo mode); stablecoins pegged; **5-minute price lock** with a quote id; underpayment rejected, a 1% tolerance for slippage. |
| 6.3 | **Payment window (checkout modal)**, opened from "Fund phase" and "Pay now":<br>① **Amount due in ₹** + phase / job summary<br>② **Choose currency & network**, with the payer's balance per option (from P5), unaffordable options greyed out<br>③ **Recipient card**: worker name, **worker wallet address** (copy button + QR), and "Held in escrow until you approve" with the escrow contract address<br>④ **Quote**: crypto amount, rate, network fee estimate, lock countdown<br>⑤ **Pay with**: *ChainWork wallet* (custodial) · *My wallet* (MetaMask / WalletConnect)<br>⑥ **Live status**: Awaiting signature → Submitted → Confirming (n/12) → ✓ Paid / ✗ Failed → **Download receipt** |
| 6.4 | **Signing per mode:** demo → one EIP-712 authorisation signature (no gas); testnet → token `approve` (skipped if already allowed) + `fundPhase` / `fundPhaseNative` signed in the wallet. |
| 6.5 | **Server-side verification** before anything changes in the DB: the server fetches the transaction receipt and checks the `PhaseFunded` event: correct contract, phaseId, worker address, asset and amount ≥ quote. Only then do the phase + ledger move and the receipt get issued. |
| 6.6 | **Currencies, in order:** 6a Polygon (Amoy): **POL, USDT, USDC, cwINR** → 6b Ethereum (Sepolia): **ETH, USDC, WBTC** → 6c BNB Chain testnet: **BNB, USDT**. BTC / XRP appear only as wrapped tokens where available. |

**Done when:** in demo mode a MetaMask user pays a phase with "USDT" via one signature and gets a DEMO receipt; in testnet mode a client pays a phase in POL and in USDT from MetaMask on Amoy, the worker's address shown is the one the contract pays on release, and paying with a tampered amount or phase id is rejected by server verification.

### P7 — Hardening, E2E tests, go-live switch (M)
- **Unit tests:** payment / phase state machines, quote locking, SIWE, receipt hashing and numbering, wallet error mapping, ticker formatting.
- **Contract tests:** v2 multi-asset escrow (including no-drain and reentrancy), relayer role grants.
- **E2E (Playwright):** an injected test EIP-1193 wallet backed by a Hardhat account covering EIP-6963 announce, network switch, account switch, demo signature payment, testnet payment, a failed payment → failed receipt, and PDF download.
- **Security regression:** replayed SIWE message, payout redirection, receipt download by a non-party, forged transaction hash.
- **Runbook "turning off demo money":** (1) the P0 health check passes on Amoy, (2) relayer funded, (3) contracts v2 deployed + roles granted, (4) remove `MOCK_BLOCKCHAIN` / set `PAYMENT_MODE=testnet` on Vercel, (5) smoke-test one payment and its receipt.
- Update CLAUDE.md, PROGRESS.md, ROADMAP.md, and `DEMO_WALKTHROUGH.md` (new screenshots).

---

## 4. Data model additions (platform DB)

```prisma
enum PaymentMode   { DEMO TESTNET MAINNET }
enum PaymentKind   { FUND RELEASE REFUND SPLIT WITHDRAW TOPUP MOVE_TO_EXTERNAL STAKE_LOCK STAKE_REFUND STAKE_FORFEIT }
enum PaymentStatus { INITIATED SUBMITTED CONFIRMED FAILED CANCELLED EXPIRED }
enum SignerKind    { CUSTODIAL EXTERNAL_WALLET DEMO_SIGNATURE RELAYER }

model PaymentTransaction {
  id            String        @id @default(cuid())
  kind          PaymentKind
  mode          PaymentMode
  status        PaymentStatus @default(INITIATED)
  payerUserId   String?
  payeeUserId   String?
  fromAddress   String?
  toAddress     String?
  amountInr     Decimal       @db.Decimal(14, 2)
  assetSymbol   String        // "cwINR", "POL", "USDT"…
  assetChainId  Int?
  assetAddress  String?       // null = native coin
  assetAmount   String        // exact base units (wei) as string
  quoteId       String?
  quoteRate     Decimal?      @db.Decimal(24, 8) // INR per 1 asset unit
  signer        SignerKind
  txHash        String?       @unique
  blockNumber   BigInt?
  gasFeeWei     String?
  failureCode   String?
  failureReason String?
  phaseId       String?
  hireId        String?
  initiatedAt   DateTime      @default(now())
  submittedAt   DateTime?
  finalizedAt   DateTime?
  receipt       Receipt?
  ledger        LedgerEntry[]
}

model LedgerEntry {
  id           String   @id @default(cuid())
  userId       String
  paymentId    String
  payment      PaymentTransaction @relation(fields: [paymentId], references: [id])
  bucket       String   // WALLET | ESCROW | DEMO_CREDIT
  direction    String   // DEBIT | CREDIT
  amountInr    Decimal  @db.Decimal(14, 2)
  balanceAfter Decimal  @db.Decimal(14, 2)
  createdAt    DateTime @default(now())
  @@index([userId, createdAt])
}

model Receipt {
  id          String   @id @default(cuid())
  receiptNo   String   @unique   // CW-RCPT-2026-000123
  paymentId   String   @unique
  payment     PaymentTransaction @relation(fields: [paymentId], references: [id])
  contentHash String             // SHA-256 of the canonical receipt JSON
  issuedAt    DateTime @default(now())
}

model PaymentQuote {
  id          String   @id @default(cuid())
  amountInr   Decimal  @db.Decimal(14, 2)
  assetSymbol String
  assetChainId Int
  rate        Decimal  @db.Decimal(24, 8)
  assetAmount String
  expiresAt   DateTime
}
```
Plus a `WalletLinkNonce` (or reuse `VerificationToken` with a new purpose) for SIWE.
All of this lives in the **platform DB**; admin screens read it **only through the bridge**, so the two-DB rule holds.

**New dependencies:** `wagmi`, `@tanstack/react-query`, `@reown/appkit` + `@reown/appkit-adapter-wagmi`, `pdf-lib`, `@pdf-lib/fontkit`, `qrcode`, `siwe` (or viem's built-in SIWE helpers).
**New env:** `PAYMENT_MODE`, `NEXT_PUBLIC_WC_PROJECT_ID`, `ALCHEMY_API_KEY` (or other RPC key), optional `COINGECKO_API_KEY`, per-chain `CHAIN_*` for extra testnets, `MAINNET_AUDIT_APPROVED` (unset).

---

## 5. Order, dependencies, rough timeline

```
P0 Foundations ─► P1 Ledger + outbox ─┬─► P2 Receipts (PDF)
                                      ├─► P3 Wallet model ─► P4 Wallet connection ─► P5 Live ticker
                                      │                                         └─► P6 Payment window
                                      └──────────────────── P7 tests run alongside ────────────────┘
```
- **P2 can run in parallel with P3/P4:** receipts depend only on the P1 ledger.
- **P6 needs P1 + P3 + P4**, and its contract part (6.1) can start early.
- Rough solo estimate: **P0 2d · P1 5d · P2 4d · P3 5d · P4 2d · P5 3d · P6 6d · P7 3d ≈ 6 weeks**. Each phase ends with a verified, working state and a commit.

**Covers:** W1–W10, E1–E8, F4, F5, F6, F7, ROADMAP §2 principles, and the four new requirements.

---

## 6. Decisions — my defaults (say if you want any changed)

| # | Decision | Default I'll use |
|---|---|---|
| D1 | Crypto payments go **into escrow** (worker's address shown as the final payee) vs **direct to the worker** | **Escrow.** Direct pay/tip only as a later add-on. |
| D2 | Networks & currencies | **Polygon first** (POL, USDT, USDC, cwINR), then Ethereum, then BNB. BTC/XRP as wrapped tokens only. |
| D3 | Demo mode with MetaMask | **EIP-712 signature, demo credit moves**, DEMO receipt. |
| D4 | What the ticker shows | Real holdings on supported **mainnets (read-only, display only)** **plus** testnet balances, each tagged by network. Payments still follow the payment mode. |
| D5 | External services | Reown / WalletConnect `projectId` (free), Alchemy RPC key (free tier), CoinGecko (free tier). You create these accounts; I wire them in. |
| D6 | Dev environment for the fix work | **Local Postgres + local Hardhat**; Neon + Amoy only for the deployed demo. |
| D7 | Receipt numbering | Gap-free yearly sequence `CW-RCPT-YYYY-NNNNNN`; failed attempts get numbers too (prefixed `CW-FAIL-…`) so the paid-receipt sequence stays clean. |

---

## Implementation notes (deviations, recorded 2026-09-28)
- **P1.5:** money actions still run synchronously inside the request, but every attempt is
  recorded first and its hash is saved at broadcast, so a timed-out request is finished by
  the reconciler instead of drifting. Fully asynchronous processing with a "processing"
  UI state moves to P5 (live tracker).
- **P1.2:** ledger running balances are computed on read (statements, P2), not stored.
- **Reconciler side effects:** when it finishes a payment it applies the money effects
  (phase status, ledger, escrow row), but not action-specific extras such as a no-show
  strike or notifications.
