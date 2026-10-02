# Runbook — turning off demo money (demo → testnet)

_Payment plan P7 · applies to the deployed app (Vercel + Neon) · target network: **Polygon Amoy**_

The deployed site runs with `PAYMENT_MODE=demo`: payments are simulated in the database
under the same rules as the contract, and nothing touches a chain. This runbook switches it
to **testnet**: real transactions on Amoy, with test tokens that have no value.

> **Never mainnet.** Real money stays forbidden until every 🔴 item in
> [PRE_MAINNET_CHECKLIST.md](PRE_MAINNET_CHECKLIST.md) is done, starting with a professional
> audit. The server refuses to start in `mainnet` mode without `MAINNET_AUDIT_APPROVED`.

**Rollback at any point:** set `PAYMENT_MODE=demo` on Vercel and redeploy. Nothing on the
chain is lost, and demo balances are where you left them.

---

## 0. Before you start — run the checks locally

All four must pass on your machine against the local Hardhat chain (see CLAUDE.md, "Running
the app with the chain"):

```bash
npm test                    # unit tests
npm run test:contracts      # PhaseEscrow v2
npm run test:integration    # payments + security regressions against Postgres + Hardhat
npm run test:e2e            # Playwright: wallet, testnet + demo payment windows, receipts
```

## 1. A private key set for the app

> **Done for production on 2026-10-03:** a fresh 24-word phrase is set as `CHAIN_MNEMONIC` on
> Vercel (Production + Preview), backed up in the git-ignored `.secrets/` folder, and every
> existing wallet was re-keyed with `scripts/rotate-chain-mnemonic.mts`. New relayer:
> `0x4170d656a439E1682004f9Fb1d3302442a076258`. To rotate again, use that script (it moves demo
> balances and open demo escrows to the new addresses in one transaction) and redeploy at once.


The local `.env` uses Hardhat's **public** test mnemonic; anyone can drain wallets derived
from it. The app refuses to sign with it on any chain except 31337 (`assertChainWritable`).

- Generate a new 12/24-word mnemonic offline and keep it in a password manager. It becomes
  `CHAIN_MNEMONIC`. Account `CHAIN_RELAYER_INDEX` (default 0) is the **relayer**; the other
  accounts are users' custodial wallets.
- Note the relayer's address. Once the env is set (step 5), `GET /api/health/chain` prints it.
  Before that, derive it locally with viem's `mnemonicToAccount(mnemonic, { addressIndex: 0 })`.

## 2. Deploy PhaseEscrow v2 to Amoy

The demo build may point at an older v1 contract. v2 (multi-asset escrow) is required by the
P6 payment window. **Phases funded on v1 stay on v1**, so close them first (see step 4).

```bash
cd contracts
# contracts/.env: DEPLOYER_KEY (a throwaway key holding Amoy POL from a faucet), optional AMOY_RPC_URL
npm run deploy:amoy
```

This deploys the cwINR test stablecoin, PhaseEscrow v2, and test USDT / USDC (6 decimals).
It allowlists those tokens and the native coin, and writes every address to
`contracts/deployments/amoy.json`.

## 3. Grant the relayer its roles, then fund it

```bash
cd contracts
RELAYER_ADDRESS=0x…relayer npx hardhat run scripts/grant-roles.js --network amoy
```

The relayer needs `ATTESTOR_ROLE` and `DISPUTE_ROLE`; the script grants nothing else and is
safe to re-run. Then send it **≥ 0.5 POL** from the Amoy faucet: it pays gas for every relayed
call and tops up users' custodial wallets with gas.

## 4. Close open demo-money escrows

Demo-funded phases live in the demo tables. Once the mode switches, the chain has never
heard of them, and approving or refunding one would revert. List them:

```bash
npm run script -- scripts/open-demo-escrows.mts
```

Approve, refund or settle each one **while still in demo mode**. Demo credit
(`Wallet.demoCredit`) does not exist on-chain: after the switch, users start from their real
test balance and top up with **Add funds** (the mock on-ramp mints test cwINR).

## 5. Database, then environment

1. Apply migrations to Neon **before** the new code serves traffic. Use the direct (non-pooler)
   connection string:
   ```bash
   npm run db:deploy
   ```
   If `PROGRESS.md` says so, also run `npm run script -- scripts/backfill-payments.mts`
   (idempotent).
2. On Vercel (Project → Settings → Environment Variables, Production), set the following. Use
   `.env.production.example` as the reference.

| variable | value |
|---|---|
| `PAYMENT_MODE` | `testnet` |
| `MOCK_BLOCKCHAIN` | **delete it** (legacy alias for demo) |
| `CHAIN_ID` | `80002` |
| `CHAIN_RPC_URL` | private Amoy RPC (may hold an API key; never sent to browsers) |
| `PUBLIC_CHAIN_RPC_URL` | a public Amoy RPC for wallets' reads (optional) |
| `CHAIN_MNEMONIC` | from step 1 |
| `CHAIN_RELAYER_INDEX` | `0` (or whichever index you granted) |
| `CHAIN_ESCROW_ADDRESS` | `PhaseEscrow` from `deployments/amoy.json` |
| `CHAIN_TOKEN_ADDRESS` | `MockStablecoin` (cwINR) |
| `CHAIN_USDT_ADDRESS` / `CHAIN_USDC_ADDRESS` | `MockUSDT` / `MockUSDC` |
| `NEXT_PUBLIC_WC_PROJECT_ID` | already set (WalletConnect) |
| `CRON_SECRET` | already set; the escrow cron must be running |

3. Redeploy.

## 6. Prove it's healthy

Open `https://<your-domain>/api/health/chain`. It must return **`"ok": true`** with every check
green:

- payment config resolves to `testnet`; private keys (not the public test phrase); `rpc` on
  chain 80002;
- escrow and stablecoin contracts present;
- **escrow asset cwINR / USDT / USDC / native coin: allowlisted.** "not PhaseEscrow v2" means
  `CHAIN_ESCROW_ADDRESS` still points at the old contract;
- relayer `ATTESTOR_ROLE` and `DISPUTE_ROLE` granted, relayer gas ≥ the minimum.

Anything red: fix it, or roll back (`PAYMENT_MODE=demo`).

## 7. Smoke test (about 15 minutes, two browsers)

1. Worker and client test accounts; sign a small two-phase contract (e.g. ₹200 + ₹200).
2. **Client → Payments → Add funds** ₹500. The balance shows "live", not "cached".
3. **Fund Phase** → the payment window → cwINR from the ChainWork wallet. Expect "Escrow
   funded" and a receipt. The tx link opens on amoy.polygonscan.com.
4. Worker: **Mark Delivered**. Client: **Approve**. The worker's balance rises; download both
   receipts (PDF).
5. Optional, crypto: the worker links MetaMask (Earnings → link wallet; there's a 24 h payout
   hold). After the hold, the client pays phase 2 in USDT from MetaMask on Amoy. Test USDT has
   an open `mint` (call it from Polygonscan's "Write contract" tab on `MockUSDT`). Expect the
   approve + fund prompts, then "Escrow funded".
6. `GET /api/health/chain` is still `ok`, and the cron tick log shows `reconcile` with no
   errors.

7. Optionally run the browser suite against the live site (writes clearly-labelled test
   accounts into the production DB):
   `E2E_BASE_URL=https://<your-domain> E2E_DATABASE_URL=<neon platform direct url> npm run test:e2e:remote`

Done: demo money is off. Keep `PAYMENT_MODE=demo` handy as the rollback.

## Reference

| what | where |
|---|---|
| mode switch | `src/lib/payments/mode.ts`, `src/instrumentation.ts` |
| health check | `src/lib/chain/health.ts` → `/api/health/chain` |
| contracts + deploy | `contracts/contracts/PhaseEscrow.sol`, `contracts/scripts/deploy.js`, `grant-roles.js` |
| what's still simulated on testnet | fiat on/off-ramp (mint / transfer to a sink), KYC, custodial keys from a mnemonic — see the pre-mainnet checklist |
