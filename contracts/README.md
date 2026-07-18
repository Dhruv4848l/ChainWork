# ChainWork Contracts — Phase-Based Escrow

The money layer (spec Section 13). Self-contained Hardhat project, separate from the
Next.js app. **Testnet only** — this never touches mainnet until a professional
third-party audit is done.

## What's here

- **`PhaseEscrow.sol`** — holds each phase's funds in a stablecoin and moves them only
  by the rules: client approval, timeout auto-release, jury verdict, mutual settlement,
  or ghosting refund. Also handles the worker's refundable delivery stake. Built on
  OpenZeppelin `AccessControl`, `ReentrancyGuard`, `Pausable`, and `SafeERC20`.
- **`MockStablecoin.sol`** — a test ERC-20 (`cwINR`) standing in for a rupee-pegged
  stablecoin. Freely mintable — **test only**.
- **`test/PhaseEscrow.test.js`** — 31 tests covering every rule + edge case.

## The one thing to understand: the attestation trust boundary

A blockchain can't see off-chain events — it doesn't know a client clicked *Approve* or
that two working days passed. The platform's backend acts as a trusted **attestor**
(`ATTESTOR_ROLE`) that relays those facts in. It relays; it can't send money anywhere
the rules don't already dictate.

Crucially, `markDelivered` stores an off-chain-computed `releaseEligibleAfter` timestamp,
and `autoRelease` **reverts before that timestamp** — so even though the *timing figure*
comes from the backend, the contract enforces that auto-release can't fire early. And
there is **no function that lets the platform drain escrow**: funds only ever reach the
phase's recorded worker or client.

## Run the tests (local, free, instant)

```bash
cd contracts
npm install
npm test          # 31 passing
npm run compile   # compile only
```

## Deploy to Polygon Amoy testnet

Amoy is a free testnet — the "money" is faucet tokens with zero real value.

1. **Make a throwaway wallet.** In MetaMask, create a *new* account you'll only use for
   testing. Never use one that holds real funds. Copy its private key
   (Account details → Show private key).
2. **Get free Amoy MATIC** for gas from a faucet, e.g. the Polygon faucet
   (https://faucet.polygon.technology/ — select Polygon Amoy) or the Alchemy Amoy faucet.
   Paste your throwaway address, request tokens.
3. **Configure.** Copy `.env.example` to `.env` and fill in:
   - `DEPLOYER_KEY` = your throwaway wallet's private key
   - `AMOY_RPC_URL` = the public endpoint (already set) or your own provider URL
4. **Deploy:**
   ```bash
   npm run deploy:amoy
   ```
   Addresses are printed and written to `deployments/amoy.json`. Phase 7 reads that file
   to wire the app to the live contracts. The test stablecoin has an open `mint`, so you
   can hand test balances to any address to exercise funding end to end.

## Before mainnet (non-negotiable)

A professional third-party smart-contract audit, a real regulated stablecoin (not the
mock), multisig control of `DEFAULT_ADMIN_ROLE` / `PAUSER_ROLE`, and an upgrade-proxy +
circuit-breaker review. Until then: **testnet only.**
