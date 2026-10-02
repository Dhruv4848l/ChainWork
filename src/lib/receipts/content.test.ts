import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalJson,
  formatReceiptNo,
  gasPaidBy,
  isReceiptNo,
  outcomeFor,
  receiptHash,
  receiptYear,
  sequenceKey,
  verifyReceiptHash,
  type ReceiptContent,
} from "./content";

const sample = (): ReceiptContent => ({
  v: 1,
  receiptNo: "CW-RCPT-2026-000001",
  outcome: "SUCCESS",
  status: "CONFIRMED",
  kind: "FUND",
  operation: "fundPhase",
  mode: "TESTNET",
  amountInr: "1500.00",
  splitWorkerBps: null,
  asset: { symbol: "cwINR", chainId: 31337, address: null, amount: "1500000000000000000000" },
  payer: { userId: "u1", name: "Imran K.", address: "0xabc" },
  payee: { userId: "u2", name: "Ravi Kumar", address: "0xdef" },
  txHash: "0x" + "1".repeat(64),
  blockNumber: "5",
  gasFeeWei: "226047730338308",
  gasPaidBy: "ChainWork",
  failure: null,
  purpose: { hireId: "h1", phaseId: "p1", jobTitle: "Fan install", phaseIndex: 1, phaseName: "Site prep" },
  escrowContract: "0xe7f1",
  reconciled: false,
  initiatedAt: "2026-10-02T05:00:00.000Z",
  finalizedAt: "2026-10-02T05:00:05.000Z",
  issuedAt: "2026-10-02T05:00:05.100Z",
});

test("receipt numbers: success and failure use separate, zero-padded sequences", () => {
  assert.equal(formatReceiptNo("SUCCESS", 2026, 123), "CW-RCPT-2026-000123");
  assert.equal(formatReceiptNo("FAILED", 2026, 45), "CW-FAIL-2026-000045");
  assert.equal(sequenceKey("SUCCESS", 2026), "RCPT-2026");
  assert.equal(sequenceKey("FAILED", 2026), "FAIL-2026");
  assert.equal(isReceiptNo("CW-RCPT-2026-000123"), true);
  assert.equal(isReceiptNo("CW-RCPT-2026-12"), false);
  assert.equal(isReceiptNo("../etc/passwd"), false);
  assert.throws(() => formatReceiptNo("SUCCESS", 2026, 0));
});

test("only CONFIRMED is a success; cancelled and expired count as failed receipts", () => {
  assert.equal(outcomeFor("CONFIRMED"), "SUCCESS");
  for (const s of ["FAILED", "CANCELLED", "EXPIRED"]) assert.equal(outcomeFor(s), "FAILED", s);
});

test("the receipt year follows India time, not UTC", () => {
  // 31 Dec 2026 20:00 UTC is already 1 Jan 2027 01:30 IST.
  assert.equal(receiptYear(new Date("2026-12-31T20:00:00Z")), 2027);
  assert.equal(receiptYear(new Date("2026-12-31T18:00:00Z")), 2026);
});

test("canonical JSON ignores key order, so the hash is stable", () => {
  assert.equal(canonicalJson({ b: 1, a: { d: 2, c: 3 } }), canonicalJson({ a: { c: 3, d: 2 }, b: 1 }));
  const a = sample();
  const b = Object.fromEntries(Object.entries(sample()).reverse()) as unknown as ReceiptContent;
  assert.equal(receiptHash(a), receiptHash(b));
  assert.match(receiptHash(a), /^[0-9a-f]{64}$/);
});

test("any edit to the content breaks the hash", () => {
  const original = sample();
  const hash = receiptHash(original);
  assert.equal(verifyReceiptHash(original, hash), true);
  assert.equal(verifyReceiptHash(original, hash.toUpperCase()), true);
  for (const tamper of [
    (c: ReceiptContent) => { c.amountInr = "15000.00"; },
    (c: ReceiptContent) => { c.payee.address = "0xattacker"; },
    (c: ReceiptContent) => { c.mode = "MAINNET"; },
    (c: ReceiptContent) => { c.outcome = "FAILED"; },
  ]) {
    const c = sample();
    tamper(c);
    assert.equal(verifyReceiptHash(c, hash), false);
  }
});

test("gas is attributed to whoever signed", () => {
  assert.equal(gasPaidBy("DEMO", "CUSTODIAL"), "None");
  assert.equal(gasPaidBy("TESTNET", "DEMO_SIGNATURE"), "None");
  assert.equal(gasPaidBy("TESTNET", "CUSTODIAL"), "ChainWork");
  assert.equal(gasPaidBy("TESTNET", "RELAYER"), "ChainWork");
  assert.equal(gasPaidBy("TESTNET", "EXTERNAL_WALLET"), "Payer");
});
