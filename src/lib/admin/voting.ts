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

// ---------------------------------------------------------------------------
// The dispute case state machine (F3). One table of which status each action may
// start from; `disputeBlocker` adds the deadline / quorum / appeal rules on top.
// The engine (jury.ts) checks the blocker AND claims the status with a guarded
// `updateMany`, so two concurrent finalizes / settles can't both win.
// ---------------------------------------------------------------------------

export type DisputeStatus = "INTAKE" | "EVIDENCE" | "COMMIT" | "REVEAL" | "VERDICT" | "EXECUTED" | "APPEALED" | "CLOSED";
export type DisputeAction = "commit" | "reveal" | "finalize" | "appeal" | "settle";

export const DISPUTE_TRANSITIONS: Record<DisputeAction, { from: readonly DisputeStatus[]; to: DisputeStatus | null }> = {
  commit: { from: ["COMMIT"], to: null }, // the last commit moves the case to REVEAL
  reveal: { from: ["REVEAL"], to: null },
  finalize: { from: ["REVEAL"], to: "VERDICT" },
  appeal: { from: ["VERDICT"], to: "APPEALED" },
  settle: { from: ["VERDICT"], to: "EXECUTED" },
};

export interface CaseState {
  status: DisputeStatus;
  commitDeadline: Date | null;
  revealDeadline: Date | null;
  /** This case is itself an appeal — it can't be appealed again. */
  isAppeal: boolean;
  /** Jurors actually on the panel. */
  panelSize: number;
  revealed: number;
}

const WRONG_STATUS: Record<DisputeAction, string> = {
  commit: "Voting is closed — this case isn't taking commits.",
  reveal: "Reveals aren't open for this case.",
  finalize: "This case isn't in its reveal stage, so there's nothing to finalize.",
  appeal: "Only a case with a verdict that hasn't been settled can be appealed.",
  settle: "Only a case with a final verdict can be settled (an appealed case is settled by its appeal).",
};

/** Why `action` can't happen on this case right now, or null if it can. */
export function disputeBlocker(c: CaseState, action: DisputeAction, now: Date = new Date()): string | null {
  if (!DISPUTE_TRANSITIONS[action].from.includes(c.status)) return WRONG_STATUS[action];
  switch (action) {
    case "commit":
      if (c.commitDeadline && now > c.commitDeadline) return "The commit deadline has passed.";
      return null;
    case "reveal":
      if (c.revealDeadline && now > c.revealDeadline) return "The reveal deadline has passed.";
      return null;
    case "finalize": {
      if (!hasQuorum(c.revealed, c.panelSize)) return "Quorum not reached — need more revealed votes.";
      // Finalizing while jurors can still reveal would let an early majority shut out
      // later votes that might change the result. Wait for everyone, or the deadline.
      const everyoneRevealed = c.revealed >= c.panelSize;
      const deadlinePassed = !!c.revealDeadline && now > c.revealDeadline;
      if (!everyoneRevealed && !deadlinePassed) return "Some jurors haven't revealed yet — wait for them or for the reveal deadline.";
      return null;
    }
    case "appeal":
      if (c.isAppeal) return "This case is already an appeal — an appeal's verdict is final.";
      return null;
    case "settle":
      return null;
  }
}

// ---------------------------------------------------------------------------
// Juror stakes
// ---------------------------------------------------------------------------

/** Paid to each majority juror from the platform's dispute fee (not the parties' funds). */
export const JUROR_FEE_INR = 100;
/** Taken from a minority juror, and from a juror who committed but never revealed. */
export const JUROR_SLASH_INR = 200;

/** The slash actually applied: never more than the juror holds, so a stake can't go negative. */
export function slashFor(stakeBalance: number, slash: number = JUROR_SLASH_INR): number {
  return Math.max(0, Math.min(stakeBalance, slash));
}

// ---------------------------------------------------------------------------
// Verifiable panel draw (roadmap 2.3). The eligible ids are sorted, then shuffled by
// a Fisher–Yates whose randomness is keccak256(seed|i). With the seed and the eligible
// list (both written to the audit log) anyone can recompute the draw and check it.
// ---------------------------------------------------------------------------

/** Deterministically draw `size` ids from `eligible` using `seedHex` (0x-prefixed). */
export function drawPanel(eligible: readonly string[], size: number, seedHex: string): string[] {
  const ids = [...new Set(eligible)].sort();
  for (let i = ids.length - 1; i > 0; i--) {
    const r = BigInt(keccak256(toHex(`${seedHex}|${i}`)));
    const j = Number(r % BigInt(i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.slice(0, Math.max(0, size));
}

/** A well-formed commitment: what `voteCommitHash` produces. */
export function isCommitHash(s: string): boolean {
  return /^0x[0-9a-f]{64}$/.test(s);
}

/** A valid ballot: a known choice and a whole-number worker % from 0 to 100. */
export function isValidBallot(choice: string, splitPct: number): choice is VerdictChoice {
  return (choice === "RELEASE_WORKER" || choice === "REFUND_CLIENT" || choice === "SPLIT")
    && Number.isInteger(splitPct) && splitPct >= 0 && splitPct <= 100;
}
