import test from "node:test";
import assert from "node:assert/strict";
import { stakeAmountInr, stakeRequired, stakeState } from "./stakeRules";

test("a stake is required at or above the threshold only", () => {
  assert.equal(stakeRequired(9_999, 10_000), false);
  assert.equal(stakeRequired(10_000, 10_000), true);
  assert.equal(stakeRequired(120_000, 10_000), true);
  assert.equal(stakeRequired(50_000, 0), false); // threshold 0 = feature off
});

test("the stake is the configured share, rounded up to whole rupees", () => {
  assert.equal(stakeAmountInr(18_000, 10), 1_800);
  assert.equal(stakeAmountInr(12_345, 10), 1_235);
  assert.equal(stakeAmountInr(10_000, 0), 0);
});

test("only an unlocked, required stake blocks funding", () => {
  assert.equal(stakeState(true, null), "AWAITING");
  assert.equal(stakeState(false, null), "NOT_REQUIRED");
  assert.equal(stakeState(true, "LOCKED"), "LOCKED");
  assert.equal(stakeState(true, "REFUNDED"), "REFUNDED");
});
