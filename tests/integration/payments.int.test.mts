/*
  Payment integration + security regression tests (payment plan P7). They run against the
  REAL local stack — Postgres + the Hardhat node with contracts deployed — and refuse to
  run anywhere else (chain id must be 31337, mode must be testnet):

    npm run test:integration

  Each test makes fresh users and hires (tests/fixtures.mts), so runs are repeatable.
  The payer's "own wallet" is Hardhat account #18, which the node holds unlocked.
*/
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createPublicClient, createWalletClient, erc20Abi, http, keccak256, toHex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";
import { platformDb as db } from "@/lib/platformDb";
import { CHAIN_ID, ESCROW_ADDRESS, TOKEN_ADDRESS, USDT_ADDRESS, phaseEscrowAbi } from "@/lib/chain/config";
import { keyFor } from "@/lib/chain/keys";
import { payoutAddressFor } from "@/lib/chain/payout";
import * as chain from "@/lib/chain/escrow";
import { verifyPhaseFunding } from "@/lib/chain/verifyFunding";
import { paymentMode } from "@/lib/payments/mode";
import { createQuote, type QuoteView } from "@/lib/payments/quotes";
import { reconcile } from "@/lib/payments/reconcile";
import { recordVerifiedPayment, runPayment, type PaymentOutcome, type PaymentSpec } from "@/lib/payments/service";
import { completeWalletLink, startWalletLink } from "@/lib/wallet/link";
import { bridgeFlaggedEscrows, bridgeReviewFlag } from "@/lib/admin/bridge";
import { makeSignedHire, makeUser, type TestUser } from "../fixtures";

const RPC = process.env.CHAIN_RPC_URL ?? "http://127.0.0.1:8545";
const PAYER = "0xdD2FD4581271e230360230F9337D5c0430Bf44C0" as const; // Hardhat #18 (unlocked on the node)
const pub = createPublicClient({ chain: hardhat, transport: http(RPC) });
const payer = createWalletClient({ account: PAYER, chain: hardhat, transport: http(RPC) });
const mintAbi = [{ type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] }] as const;

async function send(req: Parameters<typeof payer.writeContract>[0]) {
  const hash = await payer.writeContract(req);
  await pub.waitForTransactionReceipt({ hash });
  return hash;
}

/** Why the suite can't run here, or null. */
async function unavailable(): Promise<string | null> {
  if (CHAIN_ID !== 31337) return `CHAIN_ID is ${CHAIN_ID} — integration tests only run on the local Hardhat chain (31337).`;
  if (paymentMode() !== "testnet") return `PAYMENT_MODE is ${paymentMode()} — set it to testnet for these tests.`;
  try {
    const code = await pub.getCode({ address: ESCROW_ADDRESS });
    if (!code || code === "0x") return "PhaseEscrow isn't deployed — run contracts/scripts/deploy.js against the local node.";
  } catch {
    return `No chain at ${RPC} — start it with \`cd contracts && npx hardhat node\`.`;
  }
  if (!USDT_ADDRESS) return "CHAIN_USDT_ADDRESS is not set.";
  return null;
}

let skip: string | null = null;
let client: TestUser;
let worker: TestUser; // paid to their OWN wallet (past the hold)
const workerWallet = privateKeyToAccount(generatePrivateKey()).address;

before(async () => {
  skip = await unavailable();
  if (skip) return;
  client = await makeUser("CLIENT");
  worker = await makeUser("WORKER", { externalAddress: workerWallet });
  await send({ address: USDT_ADDRESS as `0x${string}`, abi: mintAbi, functionName: "mint", args: [PAYER, 100_000_000_000n] });
  await send({ address: USDT_ADDRESS as `0x${string}`, abi: erc20Abi, functionName: "approve", args: [ESCROW_ADDRESS, 2n ** 255n] });
});

after(async () => {
  await db.$disconnect();
});

/** A fresh one-phase hire + a quote for it. */
async function quoted(assetKey: string, w: TestUser = worker): Promise<{ phaseId: string; hireId: string; q: QuoteView }> {
  const { hireId, phaseIds } = await makeSignedHire(client.id, w.id);
  const r = await createQuote(phaseIds[0], client.id, assetKey);
  if (!r.ok) throw new Error(r.error);
  return { phaseId: phaseIds[0], hireId, q: r.quote };
}

function walletSpec(phaseId: string, hireId: string, q: QuoteView): PaymentSpec {
  return {
    kind: "FUND", operation: "fundPhaseWallet", signer: "EXTERNAL_WALLET", amountInr: q.amountInr,
    payerUserId: client.id, payeeUserId: worker.id, toAddress: q.workerAddress, phaseId, hireId,
    asset: { symbol: q.assetSymbol, address: q.assetAddress, chainId: q.chainId, amount: q.assetAmount, quoteId: q.id, rate: q.rate },
  };
}

const check = (phaseId: string, q: QuoteView, txHash: `0x${string}`, receiptTimeoutMs?: number) => () =>
  verifyPhaseFunding({ txHash, phaseId, workerAddress: q.workerAddress, assetAddress: q.assetAddress, assetAmount: q.assetAmount, receiptTimeoutMs });

/** Asserts a payment was refused and returns the failure details. */
function refused(r: PaymentOutcome) {
  assert.equal(r.ok, false, "payment should have been refused");
  return r as Extract<PaymentOutcome, { ok: false }>;
}

/** Runs the reconciler and asserts it flagged this phase instead of adopting the funding. */
async function notAdopted(phaseId: string) {
  const rec = await reconcile();
  assert.ok(rec.errors.some((e) => e.includes(phaseId) && e.includes("not adopted")), `reconciler should flag ${phaseId}`);
  assert.equal(await phaseStatus(phaseId), "PENDING_FUNDING", "the phase must not become funded");
  // ...and records it for the admins' review desk (ADM-10), once per phase.
  const flags = await db.flaggedEscrow.findMany({ where: { phaseId } });
  assert.equal(flags.length, 1, "exactly one flag per phase");
  assert.equal(flags[0].status, "OPEN");
  return flags[0];
}

const phaseStatus = async (id: string) => (await db.phase.findUniqueOrThrow({ where: { id } })).status;

describe("payments from the payer's own wallet", () => {
  it("confirms a USDT funding that matches its quote, and releases in USDT", async (t) => {
    if (skip) return t.skip(skip);
    const { phaseId, hireId, q } = await quoted("USDT");
    assert.equal(q.workerAddress.toLowerCase(), workerWallet.toLowerCase(), "quote pays the worker's own wallet");
    const hash = await send({ address: ESCROW_ADDRESS, abi: phaseEscrowAbi, functionName: "fundPhaseWith", args: [keyFor(phaseId), q.workerAddress, USDT_ADDRESS, BigInt(q.assetAmount)] });
    const r = await recordVerifiedPayment(walletSpec(phaseId, hireId, q), hash, check(phaseId, q, hash));
    assert.ok(r.ok, r.ok ? "" : r.reason);
    assert.equal(await phaseStatus(phaseId), "FUNDED");
    const p = await db.paymentTransaction.findUniqueOrThrow({ where: { id: r.paymentId }, include: { ledger: true, receipt: true } });
    assert.equal(p.fromAddress?.toLowerCase(), PAYER.toLowerCase());
    assert.ok(p.ledger.every((l) => l.bucket === "ESCROW"), "own-wallet funding never debits the ChainWork wallet");
    assert.match(p.receipt!.receiptNo, /^CW-RCPT-/);

    const before = await pub.readContract({ address: USDT_ADDRESS as `0x${string}`, abi: erc20Abi, functionName: "balanceOf", args: [workerWallet] });
    const rel = await runPayment(
      { kind: "RELEASE", operation: "approveRelease", signer: "RELAYER", amountInr: q.amountInr, payerUserId: client.id, payeeUserId: worker.id, fromAddress: ESCROW_ADDRESS, toAddress: q.workerAddress, phaseId, hireId },
      () => chain.approveRelease(phaseId),
    );
    assert.ok(rel.ok);
    const afterBal = await pub.readContract({ address: USDT_ADDRESS as `0x${string}`, abi: erc20Abi, functionName: "balanceOf", args: [workerWallet] });
    assert.equal(afterBal - before, BigInt(q.assetAmount), "worker receives exactly the funded USDT");
    const relP = await db.paymentTransaction.findUniqueOrThrow({ where: { id: rel.paymentId } });
    assert.equal(relP.assetSymbol, "USDT", "the release record inherits the funding asset");
  });

  it("confirms a native-coin funding", async (t) => {
    if (skip) return t.skip(skip);
    const { phaseId, hireId, q } = await quoted("NATIVE");
    const hash = await payer.writeContract({ address: ESCROW_ADDRESS, abi: phaseEscrowAbi, functionName: "fundPhaseNative", args: [keyFor(phaseId), q.workerAddress], value: BigInt(q.assetAmount) });
    await pub.waitForTransactionReceipt({ hash });
    const r = await recordVerifiedPayment(walletSpec(phaseId, hireId, q), hash, check(phaseId, q, hash));
    assert.ok(r.ok, r.ok ? "" : r.reason);
  });
});

describe("security regressions — a forged or tampered payment never counts", () => {
  it("refuses to record the same transaction twice (replay), and records nothing", async (t) => {
    if (skip) return t.skip(skip);
    const a = await quoted("USDT");
    const hash = await send({ address: ESCROW_ADDRESS, abi: phaseEscrowAbi, functionName: "fundPhaseWith", args: [keyFor(a.phaseId), a.q.workerAddress, USDT_ADDRESS, BigInt(a.q.assetAmount)] });
    assert.ok((await recordVerifiedPayment(walletSpec(a.phaseId, a.hireId, a.q), hash, check(a.phaseId, a.q, hash))).ok);

    const b = await quoted("USDT");
    const count = await db.paymentTransaction.count();
    const r = refused(await recordVerifiedPayment(walletSpec(b.phaseId, b.hireId, b.q), hash, check(b.phaseId, b.q, hash)));
    assert.equal(r.code, "DUPLICATE_TX");
    assert.equal(await db.paymentTransaction.count(), count);
    assert.equal(await phaseStatus(b.phaseId), "PENDING_FUNDING");
  });

  it("refuses a funding that names a different worker address (payout redirection), and the reconciler won't adopt it", async (t) => {
    if (skip) return t.skip(skip);
    const { phaseId, hireId, q } = await quoted("USDT");
    const hash = await send({ address: ESCROW_ADDRESS, abi: phaseEscrowAbi, functionName: "fundPhaseWith", args: [keyFor(phaseId), PAYER, USDT_ADDRESS, BigInt(q.assetAmount)] });
    const r = refused(await recordVerifiedPayment(walletSpec(phaseId, hireId, q), hash, check(phaseId, q, hash)));
    assert.equal(r.code, "WRONG_WORKER");
    assert.match(r.receiptNo ?? "", /^CW-FAIL-/, "a failed attempt still gets a receipt");
    const flag = await notAdopted(phaseId);
    assert.match(flag.reason, /unexpected worker/);
    assert.equal(flag.onchainWorker.toLowerCase(), PAYER.toLowerCase());

    // The admin desk shows it, and a review closes it for good: the next tick re-sees the
    // escrow but neither duplicates nor re-opens the flag.
    const listed = (await bridgeFlaggedEscrows()).find((f) => f.id === flag.id);
    assert.ok(listed && listed.status === "OPEN" && /USDT$/.test(listed.amount), "listed with the amount in USDT");
    assert.equal(await bridgeReviewFlag(flag.id, "Contacted the payer; re-paying correctly.", "Test Admin (ROOT)"), true);
    assert.equal(await bridgeReviewFlag(flag.id, "again", "Test Admin (ROOT)"), false, "a reviewed flag can't be reviewed twice");
    await reconcile();
    const after = await db.flaggedEscrow.findMany({ where: { phaseId } });
    assert.equal(after.length, 1);
    assert.equal(after[0].status, "REVIEWED");
    assert.ok(after[0].lastSeenAt >= flag.lastSeenAt, "re-seen by the reconciler");
  });

  it("refuses an underpayment beyond the 1% tolerance", async (t) => {
    if (skip) return t.skip(skip);
    const { phaseId, hireId, q } = await quoted("USDT");
    const hash = await send({ address: ESCROW_ADDRESS, abi: phaseEscrowAbi, functionName: "fundPhaseWith", args: [keyFor(phaseId), q.workerAddress, USDT_ADDRESS, (BigInt(q.assetAmount) * 98n) / 100n] });
    const r = refused(await recordVerifiedPayment(walletSpec(phaseId, hireId, q), hash, check(phaseId, q, hash)));
    assert.equal(r.code, "UNDERPAID");
    await notAdopted(phaseId);
  });

  it("refuses a payment in a different currency than quoted", async (t) => {
    if (skip) return t.skip(skip);
    const { phaseId, hireId, q } = await quoted("USDT");
    await chain.adapter().mintInr(PAYER, 5000);
    await send({ address: TOKEN_ADDRESS, abi: erc20Abi, functionName: "approve", args: [ESCROW_ADDRESS, 2n ** 255n] });
    const hash = await send({ address: ESCROW_ADDRESS, abi: phaseEscrowAbi, functionName: "fundPhaseWith", args: [keyFor(phaseId), q.workerAddress, TOKEN_ADDRESS, BigInt(q.assetAmount)] });
    const r = refused(await recordVerifiedPayment(walletSpec(phaseId, hireId, q), hash, check(phaseId, q, hash)));
    assert.equal(r.code, "WRONG_ASSET");
    await notAdopted(phaseId);
  });

  it("refuses a funding of a different phase passed off as this one", async (t) => {
    if (skip) return t.skip(skip);
    const a = await quoted("USDT");
    const b = await quoted("USDT");
    const hash = await send({ address: ESCROW_ADDRESS, abi: phaseEscrowAbi, functionName: "fundPhaseWith", args: [keyFor(a.phaseId), a.q.workerAddress, USDT_ADDRESS, BigInt(a.q.assetAmount)] });
    const r = refused(await recordVerifiedPayment(walletSpec(b.phaseId, b.hireId, b.q), hash, check(b.phaseId, b.q, hash)));
    assert.equal(r.code, "WRONG_PHASE");
    assert.equal(await phaseStatus(b.phaseId), "PENDING_FUNDING");

    // Phase A really was paid in full (only its recording was lost): the reconciler adopts
    // it, as a payment from the client's own wallet in USDT — not a ChainWork-wallet debit.
    await reconcile();
    assert.equal(await phaseStatus(a.phaseId), "FUNDED");
    const adopted = await db.paymentTransaction.findFirstOrThrow({ where: { phaseId: a.phaseId, kind: "FUND", status: "CONFIRMED" }, include: { ledger: true } });
    assert.equal(adopted.assetSymbol, "USDT");
    assert.equal(adopted.signer, "EXTERNAL_WALLET");
    assert.ok(adopted.ledger.every((l) => l.bucket === "ESCROW"));
  });

  it("refuses an unrelated transaction", async (t) => {
    if (skip) return t.skip(skip);
    const { phaseId, hireId, q } = await quoted("USDT");
    const hash = await payer.sendTransaction({ to: PAYER, value: 1n });
    await pub.waitForTransactionReceipt({ hash });
    const r = refused(await recordVerifiedPayment(walletSpec(phaseId, hireId, q), hash, check(phaseId, q, hash)));
    assert.equal(r.code, "NOT_A_FUNDING");
  });

  it("never confirms a forged (non-existent) transaction hash — it stays pending, then the reconciler fails it", async (t) => {
    if (skip) return t.skip(skip);
    const { phaseId, hireId, q } = await quoted("USDT");
    const forged = keccak256(toHex(`forged-${Date.now()}`));
    const r = refused(await recordVerifiedPayment(walletSpec(phaseId, hireId, q), forged, check(phaseId, q, forged, 2_000)));
    assert.equal(r.pending, true, "an unknown hash is pending, never confirmed");
    assert.equal(await phaseStatus(phaseId), "PENDING_FUNDING");

    // Past the drop window, the reconciler marks it failed (dropped) — phase untouched.
    await reconcile(new Date(Date.now() + 31 * 60_000));
    const p = await db.paymentTransaction.findUniqueOrThrow({ where: { id: r.paymentId } });
    assert.equal(p.status, "FAILED");
    assert.equal(await phaseStatus(phaseId), "PENDING_FUNDING");
  });
});

describe("reconciler", () => {
  it("adopts a full cwINR funding from the ChainWork wallet whose DB record was lost", async (t) => {
    if (skip) return t.skip(skip);
    const { phaseIds } = await makeSignedHire(client.id, worker.id);
    await chain.adapter().mintInr(client.custodialAddress, 1500);
    await chain.fundPhase(phaseIds[0], client.id, worker.id, 1500); // chain only — no DB write
    assert.equal(await phaseStatus(phaseIds[0]), "PENDING_FUNDING");
    await reconcile();
    assert.equal(await phaseStatus(phaseIds[0]), "FUNDED");
    const p = await db.paymentTransaction.findFirstOrThrow({ where: { phaseId: phaseIds[0], kind: "FUND", status: "CONFIRMED" } });
    assert.equal(p.assetSymbol, "cwINR");
    assert.equal(p.signer, "RELAYER");
  });
});

describe("payout safety", () => {
  it("a freshly linked wallet doesn't receive payouts until its hold passes — and crypto is refused meanwhile", async (t) => {
    if (skip) return t.skip(skip);
    const fresh = await makeUser("WORKER", { externalAddress: privateKeyToAccount(generatePrivateKey()).address, linkedHoursAgo: 1 });
    assert.equal((await payoutAddressFor(fresh.id)).toLowerCase(), fresh.custodialAddress.toLowerCase());
    const { phaseIds } = await makeSignedHire(client.id, fresh.id);
    const usdt = await createQuote(phaseIds[0], client.id, "USDT");
    assert.equal(usdt.ok, false, "no crypto while payouts still go to the rupee-only ChainWork wallet");
    const inr = await createQuote(phaseIds[0], client.id, "cwINR");
    assert.ok(inr.ok && inr.quote.workerAddress.toLowerCase() === fresh.custodialAddress.toLowerCase());
  });

  it("only the client on the hire can get a quote for its phase", async (t) => {
    if (skip) return t.skip(skip);
    const stranger = await makeUser("CLIENT");
    const { phaseIds } = await makeSignedHire(client.id, worker.id);
    const r = await createQuote(phaseIds[0], stranger.id, "cwINR");
    assert.equal(r.ok, false);
  });
});

describe("wallet linking (SIWE + one-time code)", () => {
  function latestCode(phone: string): string {
    const all = JSON.parse(fs.readFileSync(path.join(process.cwd(), ".dev-outbox.json"), "utf8")) as { to: string; code?: string }[];
    const hit = all.filter((m) => m.to.replace(/\D/g, "").endsWith(phone) && m.code).at(-1);
    if (!hit?.code) throw new Error("No code in the dev outbox — SMS_PROVIDER must be mock for this test.");
    return hit.code;
  }

  it("links with a valid signature + code, and a replay of the same proof is refused", async (t) => {
    if (skip) return t.skip(skip);
    const u = await makeUser("WORKER");
    const acct = privateKeyToAccount(generatePrivateKey());
    const start = await startWalletLink(u.id, acct.address, CHAIN_ID);
    assert.ok(start.ok, start.ok ? "" : start.error);
    const signature = await acct.signMessage({ message: start.message });
    const code = latestCode(u.phone);

    const done = await completeWalletLink(u.id, start.message, signature, code);
    assert.ok(done.ok, done.ok ? "" : done.error);
    assert.ok(done.activeFrom && done.activeFrom > new Date(), "a new link starts its payout hold");

    const replay = await completeWalletLink(u.id, start.message, signature, code);
    assert.equal(replay.ok, false, "the same signed message + code can't be used twice");
  });

  it("refuses a signature from a different account than the one being linked", async (t) => {
    if (skip) return t.skip(skip);
    const u = await makeUser("WORKER");
    const owner = privateKeyToAccount(generatePrivateKey());
    const impostor = privateKeyToAccount(generatePrivateKey());
    const start = await startWalletLink(u.id, owner.address, CHAIN_ID);
    assert.ok(start.ok);
    const signature = await impostor.signMessage({ message: start.message });
    const r = await completeWalletLink(u.id, start.message, signature, latestCode(u.phone));
    assert.equal(r.ok, false);
    assert.equal((await db.wallet.findUniqueOrThrow({ where: { userId: u.id } })).externalAddress, null);
  });

  it("refuses another user's challenge", async (t) => {
    if (skip) return t.skip(skip);
    const victim = await makeUser("WORKER");
    const attacker = await makeUser("WORKER");
    const acct = privateKeyToAccount(generatePrivateKey());
    const start = await startWalletLink(victim.id, acct.address, CHAIN_ID);
    assert.ok(start.ok);
    const signature = await acct.signMessage({ message: start.message });
    const r = await completeWalletLink(attacker.id, start.message, signature, latestCode(victim.phone));
    assert.equal(r.ok, false);
  });
});
