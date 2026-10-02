import test from "node:test";
import assert from "node:assert/strict";
import { assetAmountFor, formatAsset, meetsQuote, quoteExpired, QUOTE_TTL_MS } from "./quoteMath";

test("₹ → asset base units, rounded up so the worker is never short", () => {
  // ₹1,500 of cwINR (₹1/unit, 18 dp) is exactly 1500 tokens.
  assert.equal(assetAmountFor(1500, 1, 18), 1500n * 10n ** 18n);
  // ₹8,800 of USDT at ₹88/USDT (6 dp) is exactly 100 USDT.
  assert.equal(assetAmountFor(8800, 88, 6), 100_000_000n);
  // ₹100 at ₹88/USDT = 1.136363… → rounded UP to the next base unit.
  assert.equal(assetAmountFor(100, 88, 6), 1_136_364n);
  // ₹2,500 of POL at ₹20.37/POL (18 dp) ≈ 122.729504… POL.
  const pol = assetAmountFor(2500, 20.37, 18);
  assert.ok(Number(pol) / 1e18 * 20.37 >= 2500);
  assert.ok(Number(pol) / 1e18 * 20.37 < 2500.0001);
  assert.throws(() => assetAmountFor(0, 88, 6));
});

test("underpayment beyond 1 % is refused; within it is accepted", () => {
  assert.equal(meetsQuote(100_000_000n, 100_000_000n), true);
  assert.equal(meetsQuote(99_000_000n, 100_000_000n), true);
  assert.equal(meetsQuote(98_999_999n, 100_000_000n), false);
  assert.equal(meetsQuote(150_000_000n, 100_000_000n), true); // overpaying is fine
});

test("the price lock lasts five minutes", () => {
  const t0 = new Date("2026-10-02T10:00:00Z");
  const exp = new Date(t0.getTime() + QUOTE_TTL_MS);
  assert.equal(quoteExpired(exp, new Date("2026-10-02T10:04:59Z")), false);
  assert.equal(quoteExpired(exp, new Date("2026-10-02T10:05:00Z")), true);
});

test("asset amounts display exactly", () => {
  assert.equal(formatAsset(1_136_364n, 6), "1.136364");
  assert.equal(formatAsset(1500n * 10n ** 18n, 18), "1,500");
  assert.equal(formatAsset(122_729_504_000_000_000_000n, 18, 4), "122.7295");
});
