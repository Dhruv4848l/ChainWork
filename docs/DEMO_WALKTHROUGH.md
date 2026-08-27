# ChainWork — End-to-End Walkthrough

**One project, start to finish: a business hires an Android developer for ₹1,20,000, split into five phases, paid through blockchain escrow.**

This document follows a single real run of the platform. Every screenshot is a genuine capture of the app doing the thing described — no mockups. Alongside each money step there's a paired note: what happens **in this build** (test money on a test chain) and what would happen **with real money**, so you can see the production design without us moving a rupee we shouldn't.

| | |
|---|---|
| **Reproduce it** | `npm run demo:capture` — see [How to regenerate](#how-to-regenerate-this-document) |
| **Screenshots** | `docs/images/demo/` (62 numbered captures) |
| **Observed values** | `docs/demo-run.json` — real tx hashes, addresses and balances from the run |
| **Money status** | **Test money only.** Test ERC-20 token on a local/testnet chain. No mainnet, no real funds. |

---

## Contents

1. [Read this first: what's real and what's simulated](#1-read-this-first-whats-real-and-whats-simulated)
2. [The cast and the project](#2-the-cast-and-the-project)
3. [The worker signs up](#3-the-worker-signs-up)
4. [The client signs up](#4-the-client-signs-up)
5. [Posting the Android job](#5-posting-the-android-job)
6. [The worker applies](#6-the-worker-applies)
7. [The client builds the five-phase payment plan](#7-the-client-builds-the-five-phase-payment-plan)
8. [Both parties digitally sign the contract](#8-both-parties-digitally-sign-the-contract)
9. [The wallet and the money on-ramp](#9-the-wallet-and-the-money-on-ramp)
10. [Phase 1 — the full escrow cycle](#10-phase-1--the-full-escrow-cycle)
11. [Phase 2 — with a revision round](#11-phase-2--with-a-revision-round)
12. [Phase 3 — the client goes silent and escrow auto-releases](#12-phase-3--the-client-goes-silent-and-escrow-auto-releases)
13. [Phases 4 and 5 — closing out](#13-phases-4-and-5--closing-out)
14. [Mutual reviews](#14-mutual-reviews)
15. [The worker takes the money out](#15-the-worker-takes-the-money-out)
16. [Appendix A — test money vs real money, line by line](#appendix-a--test-money-vs-real-money-line-by-line)
17. [Appendix B — what has to happen before real money](#appendix-b--what-has-to-happen-before-real-money)
18. [Appendix C — where each thing lives in the code](#appendix-c--where-each-thing-lives-in-the-code)
19. [How to regenerate this document](#how-to-regenerate-this-document)

---

## 1. Read this first: what's real and what's simulated

The most common question from a judge is *"is this actually doing anything, or is it a clickable prototype?"* Here is the honest split.

### Genuinely real, right now

- **The escrow smart contract.** `PhaseEscrow.sol` is deployed and every fund / deliver / approve / release / refund in this walkthrough is a real blockchain transaction with a real hash. 31 contract tests pass.
- **The money movement.** When a phase releases, tokens move from the escrow contract to the worker's wallet address. The balance you see on the earnings screen is read live from the token contract, not from our database.
- **The rules are enforced on-chain, not in the UI.** `autoRelease` reverts if called before the deadline. No function can drain escrow to a third party. Disabling a button in the browser changes nothing.
- **Identity, contracts, signatures, disputes, reviews.** All persisted, all server-validated.

### Deliberately simulated

- **The currency.** A test ERC-20 called **cwINR**, minted freely on a test chain, pegged 1:1 to the rupee for display. It has no value.
- **The chain.** A local Hardhat node (or Polygon Amoy testnet). Never mainnet.
- **The fiat on-ramp.** "Add Funds" mints test tokens instead of charging a card.
- **The fiat off-ramp.** "Withdraw" moves tokens out of the wallet on-chain, but to a platform sink rather than a bank account.
- **KYC, SMS and email delivery.** Mocked by default, each behind a provider interface with a real implementation already written — flip one variable in `.env` and Twilio or Resend take over.

### Why we haven't gone to real money

Not because the code isn't there. Because moving real money through a smart contract without a professional third-party audit is how people lose other people's savings. The blockers are written down in [`PRE_MAINNET_CHECKLIST.md`](PRE_MAINNET_CHECKLIST.md) and summarised in [Appendix B](#appendix-b--what-has-to-happen-before-real-money).

> **The one-sentence version for a judge:** *every rule is real and enforced on a real blockchain; only the currency is play money, and switching it to real money is a configuration change plus an audit, not a rewrite.*

---

## 2. The cast and the project

| | |
|---|---|
| **Worker** | Aditya Raghavan — Android developer, 6 years, Bengaluru. Charges **₹750/hour** or **₹28,000/week**. |
| **Client** | Meridian Retail Labs Pvt Ltd — a grocery chain with 11 stores, signing up as a **Business** account. |
| **Job** | Android customer ordering app in Kotlin + Jetpack Compose. **₹1,20,000**, five phases, ~8 weeks. |

Both accounts are created from scratch during the run — nothing is pre-seeded. Phone numbers and email addresses are generated per run so the capture can be repeated indefinitely.

![The public site](images/demo/01-landing.png)

*Where both sides arrive. One product, two doors: **Find Work** and **Post a Job**. Worker and client are the same `User` table with a role flag — the toggle is the only thing that differs at signup.*

---

## 3. The worker signs up

### 3.1 Choose a side and enter details

![Worker signup — role toggle](images/demo/02-worker-signup-empty.png)

![Worker signup — details entered](images/demo/03-worker-signup-filled.png)

Name, phone, email, password. The password is bcrypt-hashed before it touches the database. Email is optional at this point but required before applying to anything — the flow nudges rather than blocks.

Signup also provisions the worker's **custodial wallet**: a real address on the chain, created before they've earned anything, so there is somewhere for money to land later.

### 3.2 Phone OTP — mandatory, and first

![Phone OTP requested](images/demo/04-worker-otp-empty.png)

A six-digit code is generated, **hashed with bcrypt**, stored with a 10-minute expiry and a 5-attempt cap, then sent. Codes are single-use: verifying marks the token consumed, so a replayed code fails.

![Phone OTP entered](images/demo/05-worker-otp-filled.png)

> **In this demo** — `SMS_PROVIDER` is unset, so the mock provider writes the code to the server console and to a gitignored `.dev-outbox.json`. No real phone number is needed; the capture script reads the code from there, exactly as a human would read it off the terminal.
>
> **In production** — set `SMS_PROVIDER=twilio` (or `fast2sms` for India) plus credentials in `.env`. The same `sendPhoneOtp()` call sends a real text. No other code changes. If a real provider is configured but fails, it falls back to the console log rather than blocking a signup — a misconfigured box can't lock users out.

### 3.3 Email verification link

![Waiting on the email link](images/demo/06-worker-email-wait.png)

The waiting screen polls. The link is normally opened somewhere else — another tab, a phone — so this page notices the moment the address is confirmed and moves itself on.

![Email verification link opened](images/demo/07-worker-email-confirmed.png)

The link carries a 32-character token that is **hashed at rest** and expires in an hour.

> **In this demo** — the mock email provider logs the link. The capture script opens it in a second tab, exactly like a user clicking from their inbox.
>
> **In production** — `EMAIL_PROVIDER=resend` (or `brevo`) with an API key. The branded HTML template in `src/lib/email.ts` is already written and email-client-safe.

### 3.4 Experience and charges — the worker's shopfront

![Worker profile — experience and charges](images/demo/08-worker-profile-setup.png)

This is where the worker publishes what they've done and **what they charge, per hour and per week**. Both are reference rates: they appear on the profile, on the applicant card the client sees, and they pre-fill the apply form. The binding number is always the one agreed on the specific job.

Skills come from a shared taxonomy (here: *Mobile App Development* under *Tech & Digital*), which is what makes the job feed's matching work.

### 3.5 Identity verification

![Identity verification (KYC)](images/demo/09-worker-kyc.png)

A four-rung ladder: **Unverified → Basic → Verified → Trusted**. Nothing that touches money is reachable below *Verified*, and that gate is checked server-side in the money actions themselves — not merely hidden in the interface.

> **In this demo** — documents are mock uploads and submission auto-approves to *Verified*.
>
> **In production** — a KYC/AML provider (Signzy, HyperVerge, Onfido) verifies the ID and liveness selfie and returns a decision asynchronously. It slots into the same `submitKycAction`; the tier comes from their verdict instead of a constant.

![Worker dashboard](images/demo/10-worker-dashboard.png)

Verified phone, verified email, *Verified* KYC tier, published profile, published charges. The worker is live.

---

## 4. The client signs up

The identical verification path — a client who can post work is as verified as a worker who can take it.

![Client signup — Post a Job](images/demo/11-client-signup-empty.png)

![Client signup — business details](images/demo/12-client-signup-filled.png)

Choosing **Business** adds company name and registration number. These are captured up front so the contract can name a legal entity rather than a person.

![Client phone OTP](images/demo/13-client-otp-empty.png)

![Client OTP entered](images/demo/14-client-otp-filled.png)

![Client email pending](images/demo/15-client-email-wait.png)

![Client email verified](images/demo/16-client-email-confirmed.png)

![Client profile setup](images/demo/17-client-profile-setup.png)

The address is stored but never shown publicly — jobs only ever advertise an area, and the exact address is released after a hire exists.

![Client verified](images/demo/18-client-kyc-done.png)

The client clears KYC too. Funding escrow is gated on it.

---

## 5. Posting the Android job

A five-step builder. Nothing is charged here.

### Step 1 — basics

![Post a job — step 1, basics](images/demo/19-post-job-1-basics.png)

The description isn't decoration: **it becomes the contract's scope clause verbatim**. The one posted here specifies the stack (Kotlin, Jetpack Compose, MVVM, minSdk 24), the screens, the backend contract (existing OpenAPI 3 REST API, Retrofit + Room, FCM), the per-phase deliverables (source in the client's GitHub org, a signed debug APK, a walkthrough video), and explicitly what is **not** in scope (backend work, design from scratch, iOS). Vagueness here is what disputes are made of.

### Step 2 — role line items

![Post a job — step 2, role line items](images/demo/20-post-job-2-roles.png)

One post can hire a whole crew: each role carries its own headcount and per-person rate, and the budget auto-sums. Here it's one Android Developer at ₹1,20,000. Partial hiring is supported — hire two of the four electricians you asked for and the other slots stay open.

### Step 3 — logistics

![Post a job — step 3, logistics](images/demo/21-post-job-3-logistics.png)

Area only, plus a date range.

### Step 4 — funding mode

![Post a job — step 4, funding mode](images/demo/22-post-job-4-funding.png)

Two choices. *Fund escrow now* gets the job a **Funded** badge, which materially increases applications. *Fund at hire time* is the honest choice for a phased project like this one: the client funds phase by phase rather than parking ₹1,20,000 for two months.

### Step 5 — review and publish

![Post a job — step 5, review](images/demo/23-post-job-5-review.png)

![The job is live](images/demo/24-client-jobs-list.png)

Published. It appears in every matching worker's feed immediately.

---

## 6. The worker applies

![Find Jobs](images/demo/25-worker-find-jobs.png)

The client's post, seconds old, in the worker's feed.

![The job as the worker reads it](images/demo/26-worker-job-detail.png)

Full spec, per-person rate, open slots — and the **client's** verification badge. Trust runs both ways here: the worker is checking the client out at the same time.

![Applying](images/demo/27-worker-apply.png)

A cover note and a rate. The rate pre-fills from the posting and is negotiable; whatever the worker types becomes the contract total if they're hired.

![Application submitted](images/demo/28-worker-applications.png)

---

## 7. The client builds the five-phase payment plan

![The applicant, as the client sees them](images/demo/29-client-applicants.png)

The applicant card carries a rating, completed-job count, years of experience, and **the charges the worker published at signup** — ₹750/hr and ₹28,000/wk — sitting next to what they've quoted for this specific job. A heuristic Fit Score sorts the shortlist.

Accepting does **not** create a hire on its own. It opens the offer screen.

![Milestone plan — the suggested split](images/demo/30-milestone-plan-default.png)

The app suggests a phase structure that suits software work and splits the money evenly. Every field is editable.

![Milestone plan — the agreed split](images/demo/31-milestone-plan-final.png)

The plan this client actually built:

| # | Phase | Amount | Why it's shaped this way |
|---|---|---|---|
| 1 | Requirements, Figma handoff & project scaffold | ₹15,000 | Small first commitment — low risk for a first-time pairing on both sides |
| 2 | Catalogue browse, product detail & cart screens | ₹25,000 | First visible product |
| 3 | REST API integration, Room offline cart & FCM | ₹30,000 | The hardest, highest-risk stretch |
| 4 | Razorpay checkout, order tracking & polish | ₹30,000 | Payments and the tracking flow |
| 5 | QA, Play Store internal release & handover | ₹20,000 | Held back until the app is genuinely shipped |
| | **Total** | **₹1,20,000** | |

The running total must land exactly on the agreed value. The server re-checks the sum before creating anything, so an unbalanced plan cannot become a hire.

**Why this structure matters:** each phase is funded on its own, released on its own, and disputed on its own. The client is never exposed for more than one phase at a time; the worker is never asked to work beyond money that's already locked.

---

## 8. Both parties digitally sign the contract

![The generated contract](images/demo/32-contract-unsigned-client.png)

The document is **generated**, not typed: parties, engagement, the scope pulled from the job description, the five-phase payment schedule, ten fixed escrow and dispute clauses, and cancellation terms. Under it sits a **SHA-256 hash of the exact text**.

![Client signing](images/demo/33-contract-client-signing.png)

The signature is the party's **full legal name, typed**. The server checks it against the verified account name — you cannot sign as somebody else — and records:

- the typed name,
- a timestamp,
- the signer's network address,
- and the document hash the signature is bound to.

![Client signed — one of two](images/demo/34-contract-client-signed.png)

One signature is not a contract. Escrow stays locked.

![Worker's hire — signature pending](images/demo/35-worker-hire-awaiting-signature.png)

The worker sees a blocking banner. Nothing is funded and no work is expected until they've read the terms.

![The same document, worker side](images/demo/36-contract-unsigned-worker.png)

**Byte-identical text, identical hash.** Both sides render from a single function, so the two parties provably cannot be shown different terms — a failure mode that plagues paper and PDF contracts.

![Fully executed](images/demo/37-contract-fully-signed.png)

Both signatures recorded against the same hash. **Change one rupee in the schedule now and the recomputed hash stops matching** — the app flags the contract as void and demands both parties re-sign, rather than silently accepting altered terms.

Only at this moment does `fundPhaseAction` stop refusing.

> **In this demo** — a typed-name signature bound to a document hash, verified against the signer's KYC-verified account.
>
> **In production** — the same ceremony, plus (a) an eSign provider such as Aadhaar eSign or DocuSign for statutory weight under the IT Act, and (b) anchoring the document hash on-chain so the timestamp is independently provable rather than resting on our database clock. The hash is already computed and stored; anchoring it is one contract call.

---

## 9. The wallet and the money on-ramp

![Client wallet — before any funding](images/demo/38-client-wallet-before.png)

Every account has a **custodial wallet** provisioned at signup — a real on-chain address whose key the platform holds. The client never sees a private key, never installs MetaMask, never buys gas, and sees a balance in rupees. Advanced users can link their own self-custody wallet by signing an ownership message; once linked, that becomes the payout address.

![Mock fiat on-ramp](images/demo/39-client-wallet-topped-up.png)

₹10,000 credited.

> **In this demo** — the platform relayer mints cwINR test tokens to the client's address. It is a genuine on-chain transaction; the token just has no value.
>
> **In production** — the client pays by UPI, card or netbanking through a payment processor (Razorpay / Cashfree). The processor confirms settlement via webhook, and the platform's treasury releases the matching amount of a **regulated INR-pegged stablecoin** to the client's wallet. Same function signature, real value behind it. The code marks this exact spot: `topUpCustodial()` in `src/lib/chain/wallet.ts` carries a `TODO(production)`.

---

## 10. Phase 1 — the full escrow cycle

![Phase tracker — nothing funded yet](images/demo/40-phase-tracker-unfunded.png)

Five phases, strictly sequential. Only phase 1 offers a Fund button; the others say funding unlocks once the previous phase closes — and `fundPhaseAction` enforces the same rule server-side, so it isn't a UI courtesy.

### Fund

![Phase 1 funded — ₹15,000 in escrow](images/demo/41-phase1-funded.png)

Three on-chain transactions fire: **mint** (the mock on-ramp topping up the shortfall), **approve** (the ERC-20 allowance), then **fundPhase**. The money has left the client's wallet and now sits inside the `PhaseEscrow` contract, keyed to this phase.

Neither party can pull it out. The contract exposes no function that sends escrowed funds anywhere except the recorded worker or the recorded client, and the tests prove it.

![Worker sees the money is locked](images/demo/42-phase1-worker-funded.png)

This is the point of the entire design. The worker starts phase 1 knowing ₹15,000 is already locked and can only reach them or return to the client **by a rule**, not by the client's mood, cash flow, or willingness to answer the phone.

> **In this demo** — cwINR test tokens move into the escrow contract on a test chain.
>
> **In production** — identical contract, identical call, on Polygon mainnet with a regulated INR stablecoin. Gas is sponsored by a meta-transaction relayer so neither party ever holds MATIC.

### Deliver

![Phase 1 delivered](images/demo/43-phase1-delivered.png)

The worker marks the phase delivered. That does two things: it opens the client's **verification window** — two working days, weekends and configured public holidays skipped — and it writes the same deadline into the smart contract, which will refuse an early auto-release.

### Approve and release

![Client's verification window](images/demo/44-phase1-awaiting-approval.png)

Three options: approve and release, request changes (twice at most), or escalate to a complaint. Doing nothing is also an outcome — that's phase 3.

![Release](images/demo/45-phase1-forge-complete.png)

![Phase 1 closed — phase 2 unlocked](images/demo/46-phase1-released.png)

`approveRelease` fires and the escrow pays the worker's payout address in the same transaction. Irreversible. Phase 2's Fund button appears only now.

![The worker's money](images/demo/47-worker-earnings-after-p1.png)

**₹15,000.** That number is an on-chain balance read live from the token contract — not a figure in our database. The transaction row carries the real hash; on Amoy it links to the block explorer.

---

## 11. Phase 2 — with a revision round

![Phase 2 funded — ₹25,000](images/demo/48-phase2-funded.png)

Exactly the pattern in the brief: the client tops up the next phase only after the previous one closed. Total exposure at any moment is **one phase**, never the whole ₹1,20,000.

![Changes requested](images/demo/49-phase2-changes-requested.png)

Not every disagreement is a dispute. Two revision rounds are built in; each resets the verification window on redelivery. After the second, the app stops offering "request changes" and routes the client to a complaint instead of an endless loop.

![Redelivered](images/demo/50-phase2-redelivered.png)

The escrow never moved during the revision. It stayed locked the whole time — which is precisely why a revision request isn't frightening for the worker.

![Phase 2 released — ₹40,000 paid to date](images/demo/51-phase2-released.png)

---

## 12. Phase 3 — the client goes silent and escrow auto-releases

![Phase 3 delivered — and then nothing](images/demo/52-phase3-delivered.png)

The worker delivers. The client stops responding. **On most platforms this is where a freelancer loses a month chasing an invoice.**

![Reminders, capped](images/demo/53-phase3-reminders.png)

A background timing worker sends a **bounded** number of reminders — two by default, adjustable by an admin. Not a nagging loop: a countdown with a defined end.

![Auto-released](images/demo/54-phase3-auto-released.png)

The window lapses with the reminders spent, and the escrow pays out on its own. The critical detail: **the deadline is enforced by the smart contract, not by our server.** `autoRelease` reverts if called even a second early, so nobody — including us — can trigger it prematurely.

The rule is symmetrical, which is what makes it fair rather than merely pro-worker: a **funded phase the worker never delivers** gets the same treatment in reverse — reminders, then the escrow rolls back to the client, the worker's delivery stake is forfeited, and a strike is recorded. Three strikes suspends the account.

![₹70,000 received across three phases](images/demo/55-worker-earnings-after-p3.png)

Two phases approved by a human, one released by the clock. Same destination either way. **Silence is not leverage.**

> **In this demo** — the capture script fast-forwards the local chain and the verification deadline so you can watch in seconds what normally takes two working days.
>
> **In production** — nothing changes except that the clock runs at real speed. A host cron hits the same endpoint every minute.

---

## 13. Phases 4 and 5 — closing out

![Phase 4 released](images/demo/56-phase4-released.png)

![All five phases released](images/demo/57-phase5-complete.png)

The tracker is fully green. When the last phase settles, the hire flips to **Completed** automatically — which is what unlocks reviews, increments the worker's completed-jobs count, and notifies both sides.

---

## 14. Mutual reviews

![Client reviews the worker](images/demo/58-client-review.png)

A review is only reachable on a **completed** hire, by an actual party to it, **once per direction** — enforced by a database constraint, not a UI check. A client→worker review recomputes the worker's public rating and their punctuality / quality / communication sub-scores, which in turn feed juror eligibility and search ranking.

![Worker reviews the client](images/demo/59-worker-review.png)

Reputation is two-sided. The client's **escrow reliability score** is derived from funding behaviour rather than opinion — how promptly they funded phases, how often they approved before the window lapsed.

---

## 15. The worker takes the money out

![₹1,20,000 earned](images/demo/60-worker-earnings-final.png)

The full contract value, in the worker's own on-chain wallet, with a transaction row and a hash per phase.

![Withdrawn — the off-ramp](images/demo/61-worker-withdrawn.png)

The balance really leaves the wallet — a genuine on-chain transfer out of custody, not a database decrement.

> **In this demo** — the destination is the platform's off-ramp sink address. The balance drops to zero and the transfer has a hash you can inspect.
>
> **In production** — the same trigger calls a payout provider (RazorpayX, Cashfree Payouts) which credits **INR to the worker's bank account or UPI ID**, usually same-day. The worker's bank details are collected at KYC. From the worker's point of view the screen is identical; only the destination changes.
>
> **A note on demo credit:** wallets carry a showcase `demoCredit` balance for demonstrations. It can never be withdrawn — not because of a check that could be bypassed, but because demo credit never exists on-chain and the withdraw path only moves real on-chain balance. The guarantee is structural.

![The worker's profile after one project](images/demo/62-worker-profile-final.png)

Rating, completed-job count, published charges. The reputation this contract just earned — which is what gets them the next one.

---

## Appendix A — test money vs real money, line by line

| Step | In this build | With real money | Code that changes |
|---|---|---|---|
| Phone OTP | Mock provider → console + dev outbox | Twilio / Fast2SMS sends a real SMS | `SMS_PROVIDER` in `.env` — nothing else |
| Email verification | Mock provider → console + dev outbox | Resend / Brevo sends real email | `EMAIL_PROVIDER` in `.env` — nothing else |
| KYC | Auto-approves to *Verified* | Signzy / HyperVerge / Onfido returns a verdict | Provider call inside `submitKycAction` |
| Currency | `cwINR` test ERC-20, freely mintable | Regulated INR-pegged stablecoin | `CHAIN_TOKEN_ADDRESS` |
| Chain | Local Hardhat node / Polygon Amoy | Polygon mainnet | `CHAIN_RPC_URL`, `CHAIN_ID` |
| Client tops up | Relayer mints test tokens | UPI / card via Razorpay → webhook → treasury releases stablecoin | `topUpCustodial()` body |
| Funding a phase | Real tx, test token | Same contract, same call, real value | none |
| Delivery attest | Backend relayer signs as attestor | Same, with the key in an HSM | key custody only |
| Approve & release | Real tx, test token | Same contract, same call | none |
| Auto-release | Same contract logic, clock fast-forwarded for the demo | Same logic at real speed | none |
| Dispute freeze & verdict | Real on-chain freeze, real jury vote | Same | none |
| Gas | Pre-funded local accounts | Meta-transaction relayer sponsors gas | relayer service |
| Worker withdraws | On-chain transfer to a platform sink | RazorpayX / Cashfree payout to bank or UPI | `withdrawCustodial()` body |
| Key custody | HD accounts from a dev mnemonic | HSM or managed custody provider | `src/lib/chain/keystore.ts` |

**Read the middle column as the architecture, not as a wish list.** Every row on the left is already calling the interface the right-hand column plugs into.

---

## Appendix B — what has to happen before real money

From [`PRE_MAINNET_CHECKLIST.md`](PRE_MAINNET_CHECKLIST.md). These are blockers, not nice-to-haves:

1. **A professional smart-contract audit.** Non-negotiable and first. Everything else waits on it.
2. **Move custody off the dev mnemonic.** Custodial keys currently derive from an HD mnemonic in a local keystore. Production needs an HSM or a managed custody provider.
3. **A gasless meta-transaction relayer**, so neither party ever needs to hold MATIC.
4. **Real payment rails** for the on-ramp and off-ramp, with reconciliation and refund handling.
5. **Real KYC/AML**, including sanctions screening and transaction monitoring thresholds.
6. **A shared rate-limit store.** The current brute-force limiter is in-memory and therefore single-instance; production needs Redis.
7. **A multisig on the contract's admin role**, not a single key.
8. **Legal and regulatory review** — PMLA, the IT Act for eSign, GST treatment of platform fees, and how an INR-pegged stablecoin is treated in the jurisdiction of operation.

Until every one of these is done, the platform stays on testnet. That is a deliberate decision recorded in the project's own memory file, not an oversight.

---

## Appendix C — where each thing lives in the code

| Concern | File |
|---|---|
| Signup, OTP, email verify, KYC | `src/features/auth/actions.ts`, `src/lib/auth/verification.ts` |
| The KYC money gate | `src/lib/auth/guards.ts` → `assertKycVerified()` |
| SMS / email providers | `src/lib/sms.ts`, `src/lib/email.ts` |
| Job posting & applications | `src/features/client/actions.ts`, `src/features/worker/actions.ts` |
| Milestone plan → hire | `src/features/contracts/actions.ts` → `createHireWithMilestonesAction()` |
| Contract text & hash | `src/features/contracts/contractText.ts` |
| Digital signatures | `src/features/contracts/actions.ts` → `signContractAction()` |
| Escrow smart contract | `contracts/contracts/PhaseEscrow.sol` (31 tests) |
| Chain operations | `src/lib/chain/escrow.ts` |
| Wallets, on-ramp, off-ramp | `src/lib/chain/wallet.ts` |
| Verification window & auto-release | `src/lib/escrow/tick.ts`, `src/lib/calendar/businessDays.ts` |
| Peer jury (commit-reveal) | `src/lib/admin/jury.ts`, `src/lib/admin/voting.ts` |
| Reviews & hire completion | `src/lib/reviews.ts`, `src/lib/hires.ts` |
| This capture script | `scripts/demo-capture.mjs` |

---

## How to regenerate this document

Four terminals, then one command.

```bash
# 0. one-time setup
npm run demo:setup          # applies migrations, regenerates Prisma, installs Playwright

# 1. Postgres must be running (PG17 service)

# 2. local chain
cd contracts && npx hardhat node

# 3. deploy the contracts to it
cd contracts && npx hardhat run scripts/deploy.js --network localhost

# 4. the app
npm run dev

# 5. capture — headless, ~4 minutes
npm run demo:capture

#    …or watch it drive the browser
npm run demo:capture:headed
```

Screenshots land in `docs/images/demo/`, and `docs/demo-run.json` records the real tx hashes, wallet addresses, contract hash and demo logins from that run.

**Requirements for the capture to work:** `SMS_PROVIDER` and `EMAIL_PROVIDER` unset or `mock` (so the codes reach `.dev-outbox.json`), and `CRON_SECRET` set in `.env` if you've configured one.

Every run creates fresh accounts with unique phone numbers and emails, so it is safe to run repeatedly against the same database.

---

*ChainWork is on testnet by design. No real funds are at risk in anything shown above.*
