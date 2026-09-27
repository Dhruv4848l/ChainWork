import test from "node:test";
import assert from "node:assert/strict";
import {
  assertEscrowOp,
  assertStakeOp,
  assertReleaseEligible,
  splitPaise,
  toPaise,
  EscrowRuleError,
  ESCROW_ALLOWED_FROM,
  type EscrowStatus,
} from "./escrowRules";

const ALL: EscrowStatus[] = ["NONE", "FUNDED", "DELIVERED", "RELEASED", "DISPUTED", "RESOLVED", "REFUNDED"];

test("the happy path mirrors the contract: fund → deliver → release", () => {
  let s: EscrowStatus = "NONE";
  s = assertEscrowOp("fundPhase", s);
  assert.equal(s, "FUNDED");
  s = assertEscrowOp("markDelivered", s);
  assert.equal(s, "DELIVERED");
  s = assertEscrowOp("approveRelease", s);
  assert.equal(s, "RELEASED");
});

test("no double funding, no double release, nothing moves once final", () => {
  assert.throws(() => assertEscrowOp("fundPhase", "FUNDED"), EscrowRuleError);
  assert.throws(() => assertEscrowOp("approveRelease", "RELEASED"), EscrowRuleError);
  for (const final of ["RELEASED", "RESOLVED", "REFUNDED"] as const) {
    for (const op of Object.keys(ESCROW_ALLOWED_FROM) as (keyof typeof ESCROW_ALLOWED_FROM)[]) {
      assert.throws(() => assertEscrowOp(op, final), EscrowRuleError, `${op} from ${final}`);
    }
  }
});

test("a disputed phase is frozen until the verdict", () => {
  assert.throws(() => assertEscrowOp("approveRelease", "DISPUTED"), EscrowRuleError);
  assert.throws(() => assertEscrowOp("autoRelease", "DISPUTED"), EscrowRuleError);
  assert.throws(() => assertEscrowOp("refundToClient", "DISPUTED"), EscrowRuleError);
  assert.equal(assertEscrowOp("resolveDispute", "DISPUTED"), "RESOLVED");
  // resolveDispute only works on a disputed phase
  for (const s of ALL.filter((x) => x !== "DISPUTED")) {
    assert.throws(() => assertEscrowOp("resolveDispute", s), EscrowRuleError);
  }
});

test("auto-release needs delivery and the deadline", () => {
  assert.throws(() => assertEscrowOp("autoRelease", "FUNDED"), EscrowRuleError);
  assert.throws(() => assertReleaseEligible(2000, 1999), /TooEarly/);
  assertReleaseEligible(2000, 2000);
});

test("stakes lock once and settle once", () => {
  assert.equal(assertStakeOp("lockStake", "NONE"), "LOCKED");
  assert.throws(() => assertStakeOp("lockStake", "LOCKED"), EscrowRuleError);
  assert.equal(assertStakeOp("forfeitStake", "LOCKED"), "FORFEITED");
  assert.throws(() => assertStakeOp("refundStake", "FORFEITED"), EscrowRuleError);
});

test("the split never creates or loses a paisa", () => {
  assert.deepEqual(splitPaise(800_000, 5000), { toWorker: 400_000, toClient: 400_000 });
  assert.deepEqual(splitPaise(1001, 3333), { toWorker: 333, toClient: 668 });
  assert.deepEqual(splitPaise(1000, 10_000), { toWorker: 1000, toClient: 0 });
  assert.deepEqual(splitPaise(1000, 0), { toWorker: 0, toClient: 1000 });
  assert.throws(() => splitPaise(1000, 10_001), /InvalidBps/);
});

test("amounts must be positive", () => {
  assert.equal(toPaise(2500.5), 250_050);
  assert.throws(() => toPaise(0), /InvalidAmount/);
  assert.throws(() => toPaise(-5), /InvalidAmount/);
});
