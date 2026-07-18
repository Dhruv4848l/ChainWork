import { keccak256, toHex } from "viem";

/*
  Pure commit-reveal + tally logic for the peer jury (Phase 11), split out from
  `jury.ts` so it carries no server-only / DB imports and can be unit-tested directly.
  These functions are the integrity core of dispute voting.
*/

export type VerdictChoice = "RELEASE_WORKER" | "REFUND_CLIENT" | "SPLIT";

/** The commitment a juror publishes before revealing: keccak256 over a canonical string. */
export function voteCommitHash(choice: VerdictChoice, splitPct: number, salt: string): string {
  return keccak256(toHex(`${choice}|${splitPct}|${salt}`));
}

/** True iff a revealed (choice, split, salt) reproduces the committed hash. */
export function revealMatches(commitHash: string, choice: VerdictChoice, splitPct: number, salt: string): boolean {
  return voteCommitHash(choice, splitPct, salt) === commitHash;
}

/** Median of a list — used for SPLIT verdicts so tied proposals resolve fairly (not the mean). */
export function median(nums: number[]): number {
  if (nums.length === 0) return 50;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/** The winning choice: the most-revealed option (first-listed wins ties, deterministically). */
export function tallyChoice(choices: VerdictChoice[]): VerdictChoice {
  const counts: Record<VerdictChoice, number> = { RELEASE_WORKER: 0, REFUND_CLIENT: 0, SPLIT: 0 };
  for (const c of choices) counts[c]++;
  return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]) as VerdictChoice;
}

/** Quorum rule: a strict majority of the panel must have revealed. */
export function hasQuorum(revealedCount: number, panelSize: number): boolean {
  return revealedCount * 2 > panelSize;
}
