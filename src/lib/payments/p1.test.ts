import test from "node:test";
import assert from "node:assert/strict";
import { assertPaymentTransition, canTransitionPayment, isFinalPaymentStatus, PaymentStateError } from "./states";
import { classifyPaymentError } from "./errors";
import { phaseTransition, canTransitionPhase, isPhaseSettled, PhaseTransitionError } from "../escrow/phaseMachine";
import { EscrowRuleError } from "../chain/escrowRules";

// ---- payment attempt states ----
test("a payment goes INITIATED → SUBMITTED → CONFIRMED and final states never move", () => {
  assertPaymentTransition("INITIATED", "SUBMITTED");
  assertPaymentTransition("SUBMITTED", "CONFIRMED");
  for (const final of ["CONFIRMED", "FAILED", "CANCELLED", "EXPIRED"] as const) {
    assert.equal(isFinalPaymentStatus(final), true);
    for (const to of ["INITIATED", "SUBMITTED", "CONFIRMED", "FAILED"] as const) {
      assert.equal(canTransitionPayment(final, to), false, `${final} → ${to}`);
    }
  }
});

test("a submitted payment can't be cancelled (the tx is already on the network)", () => {
  assert.throws(() => assertPaymentTransition("SUBMITTED", "CANCELLED"), PaymentStateError);
  assert.throws(() => assertPaymentTransition("SUBMITTED", "EXPIRED"), PaymentStateError);
});

// ---- phase state machine (F4 lives here) ----
test("F4: request-changes only from a delivered phase", () => {
  for (const s of ["PENDING_FUNDING", "FUNDED", "IN_PROGRESS", "RELEASED", "DISPUTED", "AUTO_CANCELLED", "RESOLVED"]) {
    assert.equal(canTransitionPhase("requestChanges", s), false, s);
  }
  assert.deepEqual(phaseTransition("requestChanges", "VERIFICATION_WINDOW_OPEN").to, "IN_PROGRESS");
  assert.deepEqual(phaseTransition("requestChanges", "DELIVERED").to, "IN_PROGRESS");
});

test("a released or resolved phase can't be refunded, disputed or approved again", () => {
  for (const s of ["RELEASED", "RESOLVED", "AUTO_CANCELLED"]) {
    for (const ev of ["approve", "refund", "dispute", "deliver", "fund"] as const) {
      assert.throws(() => phaseTransition(ev, s), PhaseTransitionError, `${ev} from ${s}`);
    }
  }
});

test("a disputed phase only leaves through a verdict", () => {
  assert.equal(phaseTransition("resolve", "DISPUTED").to, "RESOLVED");
  for (const ev of ["approve", "autoRelease", "refund", "requestChanges"] as const) {
    assert.equal(canTransitionPhase(ev, "DISPUTED"), false, ev);
  }
});

test("the next phase unlocks after RELEASED or RESOLVED", () => {
  assert.equal(isPhaseSettled("RELEASED"), true);
  assert.equal(isPhaseSettled("RESOLVED"), true);
  assert.equal(isPhaseSettled("DISPUTED"), false);
});

test("transition errors read as plain language", () => {
  assert.match(new PhaseTransitionError("requestChanges", "RELEASED").message, /released can't be sent back for changes/);
});

// ---- error classification ----
test("wallet rejection is CANCELLED, not FAILED", () => {
  const c = classifyPaymentError({ code: 4001, message: "User rejected the request." });
  assert.equal(c.code, "USER_REJECTED");
  assert.equal(c.cancelled, true);
});

test("rule errors map to their codes with a no-money-moved reason", () => {
  assert.equal(classifyPaymentError(new EscrowRuleError("WrongStatus")).code, "WRONG_STATUS");
  assert.equal(classifyPaymentError(new EscrowRuleError("TooEarly")).code, "TOO_EARLY");
  assert.match(classifyPaymentError(new EscrowRuleError("InsufficientBalance")).reason, /No money was moved/);
});

test("viem-shaped errors: revert, gas, timeout (pending), RPC", () => {
  const revert = { name: "ContractFunctionExecutionError", shortMessage: "reverted", cause: { name: "ContractFunctionRevertedError", message: "WrongStatus()" } };
  assert.equal(classifyPaymentError(revert).code, "WRONG_STATUS");
  assert.equal(classifyPaymentError({ name: "ContractFunctionRevertedError", message: "execution reverted" }).code, "REVERTED");
  assert.equal(classifyPaymentError({ name: "InsufficientFundsError", message: "insufficient funds for gas * price + value" }).code, "INSUFFICIENT_GAS");
  const t = classifyPaymentError({ name: "WaitForTransactionReceiptTimeoutError", message: "Timed out while waiting for transaction" });
  assert.equal(t.code, "TIMEOUT");
  assert.equal(t.pending, true);
  assert.equal(classifyPaymentError({ name: "HttpRequestError", message: "fetch failed" }).code, "RPC_UNAVAILABLE");
  assert.equal(classifyPaymentError({ name: "ChainConfigError", message: "public mnemonic" }).code, "CHAIN_CONFIG");
});
