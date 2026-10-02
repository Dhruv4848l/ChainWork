import test from "node:test";
import assert from "node:assert/strict";
import { computeStatement, defaultPeriod, paiseToRupees, parsePeriod, toPaise, type LedgerLine } from "./statementMath";

const L = (day: string, bucket: LedgerLine["bucket"], direction: LedgerLine["direction"], rupees: number, memo = "m"): LedgerLine => ({
  at: new Date(`${day}T06:00:00Z`), bucket, direction, amountPaise: rupees * 100, memo, receiptNo: null,
});

test("escrow: opening from before the period, running balance, closing", () => {
  const before = [L("2026-09-01", "ESCROW", "CREDIT", 4000), L("2026-09-05", "ESCROW", "DEBIT", 4000), L("2026-09-10", "ESCROW", "CREDIT", 8000)];
  const during = [L("2026-10-02", "ESCROW", "DEBIT", 1500), L("2026-10-01", "ESCROW", "CREDIT", 1500)]; // out of order on purpose
  const s = computeStatement(before, during);
  assert.equal(s.escrow.openingPaise, 800000);
  assert.deepEqual(s.escrow.rows.map((r) => r.balancePaise), [950000, 800000]);
  assert.equal(s.escrow.closingPaise, 800000);
  assert.equal(s.escrow.lockedPaise, 150000);
  assert.equal(s.escrow.releasedPaise, 150000);
});

test("wallet: in / out / net only, no running balance; escrow rows don't leak in", () => {
  const s = computeStatement([L("2026-09-01", "WALLET", "DEBIT", 9999)], [
    L("2026-10-01", "WALLET", "CREDIT", 1500),
    L("2026-10-02", "WALLET", "DEBIT", 500),
    L("2026-10-02", "ESCROW", "CREDIT", 700),
  ]);
  assert.equal(s.wallet.rows.length, 2);
  assert.equal(s.wallet.totalInPaise, 150000);
  assert.equal(s.wallet.totalOutPaise, 50000);
  assert.equal(s.wallet.netPaise, 100000);
});

test("period: inclusive IST days, validated", () => {
  const p = parsePeriod("2026-10-01", "2026-10-31");
  assert.equal(p.startUtc.toISOString(), "2026-09-30T18:30:00.000Z");
  assert.equal(p.endUtc.toISOString(), "2026-10-31T18:30:00.000Z");
  assert.throws(() => parsePeriod("2026-10-05", "2026-10-01"), /on or before/);
  assert.throws(() => parsePeriod("2025-01-01", "2026-10-01"), /one year/);
  assert.throws(() => parsePeriod("01/10/2026", "2026-10-01"), /look like/);
  const d = defaultPeriod(new Date("2026-10-02T20:00:00Z")); // already 3 Oct in IST
  assert.equal(d.to, "2026-10-03");
  assert.equal(d.from, "2026-09-04");
});

test("paise conversions are exact", () => {
  assert.equal(toPaise("1500.00"), 150000);
  assert.equal(toPaise("0.1"), 10);
  assert.equal(toPaise("120000.55"), 12000055);
  assert.equal(paiseToRupees(12000055), "1,20,000.55");
  assert.equal(paiseToRupees(-150000), "−1,500.00");
});
