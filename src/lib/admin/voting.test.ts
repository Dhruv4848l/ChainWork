import { test } from "node:test";
import assert from "node:assert/strict";
import { voteCommitHash, revealMatches, median, tallyChoice, hasQuorum } from "./voting";

/* Phase 13 — commit-reveal integrity, the core guarantee of jury voting. */

test("a correct reveal reproduces the commitment", () => {
  const h = voteCommitHash("SPLIT", 60, "salt-abc");
  assert.equal(revealMatches(h, "SPLIT", 60, "salt-abc"), true);
});

test("changing ANY field after committing is rejected", () => {
  const h = voteCommitHash("RELEASE_WORKER", 0, "s1");
  assert.equal(revealMatches(h, "REFUND_CLIENT", 0, "s1"), false, "choice change caught");
  assert.equal(revealMatches(h, "RELEASE_WORKER", 50, "s1"), false, "split change caught");
  assert.equal(revealMatches(h, "RELEASE_WORKER", 0, "s2"), false, "salt change caught");
});

test("the commitment hides the vote (different salts → different hashes)", () => {
  assert.notEqual(voteCommitHash("SPLIT", 50, "a"), voteCommitHash("SPLIT", 50, "b"));
});

test("median resolves tied split proposals (odd + even counts)", () => {
  assert.equal(median([40, 50, 60]), 50);
  assert.equal(median([40, 60]), 50);
  assert.equal(median([10, 20, 90]), 20); // median, not the mean (40)
});

test("tally picks the majority choice", () => {
  assert.equal(tallyChoice(["SPLIT", "SPLIT", "RELEASE_WORKER"]), "SPLIT");
  assert.equal(tallyChoice(["REFUND_CLIENT", "REFUND_CLIENT", "SPLIT", "RELEASE_WORKER"]), "REFUND_CLIENT");
});

test("quorum requires a strict majority of the panel", () => {
  assert.equal(hasQuorum(3, 5), true); // 3 of 5
  assert.equal(hasQuorum(2, 5), false); // 2 of 5 is not a majority
  assert.equal(hasQuorum(2, 3), true); // 2 of 3
  assert.equal(hasQuorum(1, 3), false);
});
