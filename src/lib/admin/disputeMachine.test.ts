import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DISPUTE_TRANSITIONS, disputeBlocker, drawPanel, slashFor, isCommitHash, isValidBallot, voteCommitHash,
  type CaseState, type DisputeAction, type DisputeStatus,
} from "./voting";

/* F3 — the dispute case state machine: every allowed and forbidden transition. */

const NOW = new Date("2026-10-09T12:00:00Z");
const LATER = new Date("2026-10-10T12:00:00Z");
const EARLIER = new Date("2026-10-08T12:00:00Z");

const STATUSES: DisputeStatus[] = ["INTAKE", "EVIDENCE", "COMMIT", "REVEAL", "VERDICT", "EXECUTED", "APPEALED", "CLOSED"];
const ACTIONS: DisputeAction[] = ["commit", "reveal", "finalize", "appeal", "settle"];

/** A case in `status` where every non-status rule passes (deadlines ahead, everyone revealed). */
function open(status: DisputeStatus, over: Partial<CaseState> = {}): CaseState {
  return { status, commitDeadline: LATER, revealDeadline: LATER, isAppeal: false, panelSize: 5, revealed: 5, ...over };
}

test("each action is allowed from exactly the statuses in the table", () => {
  for (const action of ACTIONS) {
    for (const status of STATUSES) {
      const allowed = DISPUTE_TRANSITIONS[action].from.includes(status);
      const blocker = disputeBlocker(open(status), action, NOW);
      assert.equal(blocker === null, allowed, `${action} from ${status}: ${blocker}`);
    }
  }
});

test("the table: commit←COMMIT, reveal←REVEAL, finalize REVEAL→VERDICT, appeal/settle only from VERDICT", () => {
  assert.deepEqual(DISPUTE_TRANSITIONS.commit.from, ["COMMIT"]);
  assert.deepEqual(DISPUTE_TRANSITIONS.reveal.from, ["REVEAL"]);
  assert.deepEqual(DISPUTE_TRANSITIONS.finalize, { from: ["REVEAL"], to: "VERDICT" });
  assert.deepEqual(DISPUTE_TRANSITIONS.appeal, { from: ["VERDICT"], to: "APPEALED" });
  assert.deepEqual(DISPUTE_TRANSITIONS.settle, { from: ["VERDICT"], to: "EXECUTED" });
});

test("double finalize and double settle are refused (the status has already moved on)", () => {
  assert.notEqual(disputeBlocker(open("VERDICT"), "finalize", NOW), null);
  assert.notEqual(disputeBlocker(open("EXECUTED"), "settle", NOW), null);
});

test("an APPEALED case can't be settled or appealed again", () => {
  assert.notEqual(disputeBlocker(open("APPEALED"), "settle", NOW), null);
  assert.notEqual(disputeBlocker(open("APPEALED"), "appeal", NOW), null);
});

test("an appeal's verdict can't be appealed", () => {
  assert.match(disputeBlocker(open("VERDICT", { isAppeal: true }), "appeal", NOW) ?? "", /already an appeal/);
  assert.equal(disputeBlocker(open("VERDICT", { isAppeal: true }), "settle", NOW), null);
});

test("commit after the commit deadline is refused; reveal after the reveal deadline is refused", () => {
  assert.match(disputeBlocker(open("COMMIT", { commitDeadline: EARLIER }), "commit", NOW) ?? "", /deadline/);
  assert.match(disputeBlocker(open("REVEAL", { revealDeadline: EARLIER }), "reveal", NOW) ?? "", /deadline/);
});

test("reveal before everyone committed is refused (the case is still in COMMIT)", () => {
  assert.notEqual(disputeBlocker(open("COMMIT"), "reveal", NOW), null);
});

test("finalize needs quorum", () => {
  assert.match(disputeBlocker(open("REVEAL", { revealed: 2, revealDeadline: EARLIER }), "finalize", NOW) ?? "", /Quorum/);
});

test("finalize waits for every reveal or the reveal deadline (no early-majority shut-out)", () => {
  // 3 of 5 revealed = quorum, but two jurors can still reveal before the deadline.
  assert.match(disputeBlocker(open("REVEAL", { revealed: 3 }), "finalize", NOW) ?? "", /haven't revealed/);
  assert.equal(disputeBlocker(open("REVEAL", { revealed: 3, revealDeadline: EARLIER }), "finalize", NOW), null);
  assert.equal(disputeBlocker(open("REVEAL", { revealed: 5 }), "finalize", NOW), null);
});

test("an empty panel never reaches quorum", () => {
  assert.notEqual(disputeBlocker(open("REVEAL", { panelSize: 0, revealed: 0, revealDeadline: EARLIER }), "finalize", NOW), null);
});

test("a slash never takes a stake below zero", () => {
  assert.equal(slashFor(1000), 200);
  assert.equal(slashFor(150), 150);
  assert.equal(slashFor(0), 0);
  assert.equal(slashFor(-5), 0);
});

test("the panel draw is deterministic for a seed, order-independent, and without repeats", () => {
  const ids = ["j1", "j2", "j3", "j4", "j5", "j6", "j7", "j8"];
  const seed = "0x" + "ab".repeat(32);
  const a = drawPanel(ids, 5, seed);
  assert.deepEqual(drawPanel([...ids].reverse(), 5, seed), a, "input order doesn't matter");
  assert.equal(new Set(a).size, 5);
  assert.ok(a.every((id) => ids.includes(id)));
  assert.notDeepEqual(drawPanel(ids, 8, "0x" + "cd".repeat(32)), drawPanel(ids, 8, seed), "a different seed draws differently");
  assert.equal(drawPanel(ids.slice(0, 2), 5, seed).length, 2, "short of jurors: the panel is who's available");
});

test("commit hashes and ballots are validated", () => {
  assert.equal(isCommitHash(voteCommitHash("SPLIT", 50, "s")), true);
  assert.equal(isCommitHash("0x1234"), false);
  assert.equal(isValidBallot("SPLIT", 60), true);
  assert.equal(isValidBallot("SPLIT", 101), false);
  assert.equal(isValidBallot("SPLIT", 50.5), false);
  assert.equal(isValidBallot("BRIBE", 50), false);
});
