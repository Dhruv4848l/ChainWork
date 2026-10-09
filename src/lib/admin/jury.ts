import "server-only";
import { randomBytes } from "node:crypto";
import { adminDb } from "@/lib/adminDb";
import { getPlatformSettings, type PlatformSettings } from "@/lib/config/platformConfig";
import * as chain from "@/lib/chain/escrow";
import type { DisputeCase, JuryVote, Prisma, ValueTier, VerdictChoice } from "@/generated/admin";
import { bridgeHireParties } from "./bridge";
import { writeAudit } from "./audit";
import {
  voteCommitHash, median, tallyChoice, hasQuorum, disputeBlocker, drawPanel, slashFor, isCommitHash, isValidBallot,
  JUROR_FEE_INR, JUROR_SLASH_INR, type CaseState,
} from "./voting";

// Re-exported so existing importers (`@/lib/admin/jury`) keep working.
export { voteCommitHash };

/*
  The peer-jury dispute engine (spec Section 12). Escalation freezes a phase's escrow
  and opens an anonymized case with a staked panel; jurors vote commit-then-reveal;
  the tally (median % for split verdicts) becomes the verdict; stakes settle
  (majority refunded + fee, minority slashed) and reputations update.

  Integrity rules (F2 / F3):
  - A juror is always identified from the logged-in console user
    (`JurorProfile.adminUserId`), never from an id the browser sends.
  - Every action passes `disputeBlocker` (the state machine in voting.ts) AND claims
    its status change with a guarded `updateMany`, so a double finalize / settle /
    appeal loses the race instead of paying stakes twice or moving money twice.
  - `runJuryTick` enforces the deadlines: non-committers are replaced, non-revealers
    slashed, and a panel that can't reach quorum is redrawn.
  - Panels are drawn with a recorded random seed (`drawPanel`), so a draw can be checked.
*/

type Db = typeof adminDb | Prisma.TransactionClient;
type Fail = { ok: false; error: string };

const HOUR = 3600_000;

/** A stable, non-identifying 4-digit label from a platform user id. */
function anonLabel(prefix: string, userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) % 10000;
  return `${prefix} #${String(h).padStart(4, "0")}`;
}

function tierFor(amountInr: number, s: PlatformSettings): { tier: ValueTier; panel: number } {
  if (amountInr < 5000) return { tier: "SMALL", panel: s.juryPanelSmall };
  if (amountInr < 20000) return { tier: "STANDARD", panel: s.juryPanelStandard };
  return { tier: "LARGE", panel: s.juryPanelLarge };
}

/** How many jurors a case should have — what a redraw tops it back up to. */
function targetPanel(c: Pick<DisputeCase, "valueTier" | "appealOfCaseId">, s: PlatformSettings): number {
  if (c.appealOfCaseId) return s.juryAppealPanelSize;
  return c.valueTier === "SMALL" ? s.juryPanelSmall : c.valueTier === "STANDARD" ? s.juryPanelStandard : s.juryPanelLarge;
}

/** The state-machine view of a case. Votes exist only for jurors currently on the panel. */
export function stateOf(c: DisputeCase, votes: JuryVote[]): CaseState {
  return {
    status: c.status,
    commitDeadline: c.commitDeadline,
    revealDeadline: c.revealDeadline,
    isAppeal: c.appealOfCaseId != null,
    panelSize: votes.length,
    revealed: votes.filter((v) => v.revealedChoice != null).length,
  };
}

export interface PanelDraw {
  /** 0x-prefixed 32-byte seed; with `eligible` it reproduces `drawn` via `drawPanel`. */
  seed: string;
  eligible: string[];
  drawn: string[];
}

/**
 * Draw jurors for a case. Eligible: ACTIVE, has a console login to vote with, holds at
 * least one slash's worth of stake, isn't a party, and hasn't sat on this case before.
 */
async function drawJurors(db: Db, size: number, excludePlatformUserIds: string[], excludeJurorIds: string[]): Promise<PanelDraw> {
  const rows = await db.jurorProfile.findMany({
    where: {
      status: "ACTIVE",
      adminUserId: { not: null },
      stakeBalance: { gte: JUROR_SLASH_INR },
      platformUserId: { notIn: excludePlatformUserIds },
      id: { notIn: excludeJurorIds },
    },
    select: { id: true },
  });
  const eligible = rows.map((r) => r.id).sort();
  const seed = "0x" + randomBytes(32).toString("hex");
  return { seed, eligible, drawn: drawPanel(eligible, size, seed) };
}

async function seatPanel(db: Db, caseId: string, jurorIds: string[]): Promise<void> {
  for (const jurorId of jurorIds) {
    await db.juryAssignment.create({ data: { caseId, jurorId } });
    await db.juryVote.create({ data: { caseId, jurorId } });
  }
}

/** The juror a console login votes as, or null (not linked = can't vote). */
export async function jurorForAdmin(adminUserId: string) {
  return adminDb.jurorProfile.findUnique({ where: { adminUserId } });
}

// ---------------------------------------------------------------------------
// Escalate a FINANCIAL-lane complaint to the jury: freeze escrow + open a case.
// `parties` come from the caller (resolved through the bridge) so this module
// never touches the Platform DB.
// ---------------------------------------------------------------------------
export async function escalateToJury(input: {
  complaintId: string;
  subjectHireId: string;
  subjectPhaseId: string;
  clientUserId: string;
  workerUserId: string;
  escrowAmountInr: number;
  reason: string;
}): Promise<{ caseId: string; panel: number; target: number; frozen: boolean; draw: PanelDraw }> {
  const settings = await getPlatformSettings();
  const { tier, panel: target } = tierFor(input.escrowAmountInr, settings);

  // Freeze the phase's escrow on-chain (best-effort — a seed phase may not be funded).
  let frozen = false;
  try {
    await chain.raiseDispute(input.subjectPhaseId);
    frozen = true;
  } catch (e) {
    console.warn("raiseDispute skipped (phase not funded on-chain?):", (e as Error).message.slice(0, 80));
  }

  const now = Date.now();
  const { dispute, draw } = await adminDb.$transaction(async (tx) => {
    const draw = await drawJurors(tx, target, [input.clientUserId, input.workerUserId], []);
    const dispute = await tx.disputeCase.create({
      data: {
        complaintId: input.complaintId,
        subjectHireId: input.subjectHireId,
        subjectPhaseId: input.subjectPhaseId,
        clientLabel: anonLabel("Client", input.clientUserId),
        workerLabel: anonLabel("Worker", input.workerUserId),
        reason: input.reason,
        valueTier: tier,
        // The jurors actually seated. Short of eligible jurors, the timer tops it up.
        panelSize: draw.drawn.length,
        escrowAmount: input.escrowAmountInr,
        status: "COMMIT",
        commitDeadline: new Date(now + settings.juryCommitHours * HOUR),
        revealDeadline: new Date(now + (settings.juryCommitHours + settings.juryRevealHours) * HOUR),
      },
    });
    await seatPanel(tx, dispute.id, draw.drawn);
    return { dispute, draw };
  });
  return { caseId: dispute.id, panel: draw.drawn.length, target, frozen, draw };
}

// ---------------------------------------------------------------------------
// Commit / reveal — `jurorId` is resolved from the session by the caller.
// ---------------------------------------------------------------------------
export async function commitVote(caseId: string, jurorId: string, commitHash: string, now: Date = new Date()): Promise<{ ok: true } | Fail> {
  if (!isCommitHash(commitHash)) return { ok: false, error: "That isn't a valid vote commitment." };
  const c = await adminDb.disputeCase.findUnique({ where: { id: caseId }, include: { votes: true } });
  if (!c) return { ok: false, error: "Case not found." };
  const blocked = disputeBlocker(stateOf(c, c.votes), "commit", now);
  if (blocked) return { ok: false, error: blocked };
  const vote = c.votes.find((v) => v.jurorId === jurorId);
  if (!vote) return { ok: false, error: "You're not on this panel." };

  const written = await adminDb.juryVote.updateMany({ where: { id: vote.id, commitHash: null }, data: { commitHash, committedAt: now } });
  if (written.count === 0) return { ok: false, error: "You've already committed — a commit can't be changed." };

  // Once every panellist has committed, open the reveal stage.
  const [total, committed] = await Promise.all([
    adminDb.juryVote.count({ where: { caseId } }),
    adminDb.juryVote.count({ where: { caseId, commitHash: { not: null } } }),
  ]);
  if (committed >= total) {
    const settings = await getPlatformSettings();
    const minReveal = new Date(now.getTime() + settings.juryRevealHours * HOUR);
    const revealDeadline = c.revealDeadline && c.revealDeadline > minReveal ? c.revealDeadline : minReveal;
    await adminDb.disputeCase.updateMany({ where: { id: caseId, status: "COMMIT" }, data: { status: "REVEAL", revealDeadline } });
  }
  return { ok: true };
}

export async function revealVote(
  caseId: string,
  jurorId: string,
  choice: VerdictChoice,
  splitPct: number,
  salt: string,
  now: Date = new Date(),
): Promise<{ ok: true } | Fail> {
  if (!isValidBallot(choice, splitPct)) return { ok: false, error: "Choose a verdict, and a worker share from 0 to 100%." };
  if (!salt || salt.length > 200) return { ok: false, error: "Enter the secret (salt) you committed with." };
  const c = await adminDb.disputeCase.findUnique({ where: { id: caseId }, include: { votes: true } });
  if (!c) return { ok: false, error: "Case not found." };
  const blocked = disputeBlocker(stateOf(c, c.votes), "reveal", now);
  if (blocked) return { ok: false, error: blocked };
  const vote = c.votes.find((v) => v.jurorId === jurorId);
  if (!vote) return { ok: false, error: "You're not on this panel." };
  if (!vote.commitHash) return { ok: false, error: "Nothing committed to reveal." };
  if (vote.revealedChoice) return { ok: false, error: "Already revealed." };
  // Verify the reveal matches the commitment — a mismatch is rejected.
  if (voteCommitHash(choice, splitPct, salt) !== vote.commitHash) {
    return { ok: false, error: "Reveal doesn't match your committed vote." };
  }
  const written = await adminDb.juryVote.updateMany({
    where: { id: vote.id, revealedChoice: null },
    data: { revealedChoice: choice, revealedSplitPct: choice === "SPLIT" ? splitPct : null, salt, revealedAt: now },
  });
  if (written.count === 0) return { ok: false, error: "Already revealed." };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Tally + finalize (median for split) + juror stake settlement — exactly once.
// ---------------------------------------------------------------------------
export async function tallyAndFinalize(
  caseId: string,
  now: Date = new Date(),
): Promise<{ ok: true; verdict: VerdictChoice; splitPct?: number; slashedNonRevealers: number } | Fail> {
  return adminDb.$transaction(async (tx) => {
    const c = await tx.disputeCase.findUnique({ where: { id: caseId }, include: { votes: true } });
    if (!c) return { ok: false as const, error: "Case not found." };
    const blocked = disputeBlocker(stateOf(c, c.votes), "finalize", now);
    if (blocked) return { ok: false as const, error: blocked };
    // Claim REVEAL → VERDICT. A concurrent finalize finds the status gone and stops here,
    // so stakes are paid / slashed once.
    const claim = await tx.disputeCase.updateMany({ where: { id: caseId, status: "REVEAL" }, data: { status: "VERDICT" } });
    if (claim.count === 0) return { ok: false as const, error: "This case has already been finalized." };

    const revealed = c.votes.filter((v) => v.revealedChoice != null);
    const verdict = tallyChoice(revealed.map((v) => v.revealedChoice as VerdictChoice));
    // Tied split proposals resolve to the MEDIAN proposed %, not the mean.
    const splitPct = verdict === "SPLIT"
      ? median(revealed.filter((v) => v.revealedChoice === "SPLIT").map((v) => v.revealedSplitPct ?? 50))
      : null;

    // Stakes + reputations: majority refunded + fee, minority slashed, and a juror who
    // committed but never revealed is slashed too (no reputation credit either way).
    let slashedNonRevealers = 0;
    for (const v of c.votes) {
      const juror = await tx.jurorProfile.findUnique({ where: { id: v.jurorId } });
      if (!juror) continue;
      if (v.revealedChoice == null) {
        await tx.jurorProfile.update({ where: { id: juror.id }, data: { stakeBalance: { decrement: slashFor(Number(juror.stakeBalance)) } } });
        slashedNonRevealers++;
        continue;
      }
      const isMajority = v.revealedChoice === verdict;
      const newCases = juror.casesCount + 1;
      await tx.jurorProfile.update({
        where: { id: juror.id },
        data: {
          casesCount: newCases,
          agreementRate: (juror.agreementRate * juror.casesCount + (isMajority ? 100 : 0)) / newCases,
          stakeBalance: isMajority ? { increment: JUROR_FEE_INR } : { decrement: slashFor(Number(juror.stakeBalance)) },
        },
      });
      await tx.juryVote.update({ where: { id: v.id }, data: { isMajority } });
    }

    await tx.disputeCase.update({ where: { id: caseId }, data: { verdictChoice: verdict, verdictSplitPct: splitPct } });
    return { ok: true as const, verdict, splitPct: splitPct ?? undefined, slashedNonRevealers };
  });
}

// ---------------------------------------------------------------------------
// Appeals — once, from a verdict, to a larger fresh panel (nobody who sat before).
// ---------------------------------------------------------------------------
export async function appealCase(
  caseId: string,
  now: Date = new Date(),
): Promise<{ ok: true; appealId: string; panel: number; target: number; draw: PanelDraw } | Fail> {
  const original = await adminDb.disputeCase.findUnique({ where: { id: caseId }, include: { votes: true, assignments: true } });
  if (!original) return { ok: false, error: "Case not found." };
  const blocked = disputeBlocker(stateOf(original, original.votes), "appeal", now);
  if (blocked) return { ok: false, error: blocked };
  const existing = await adminDb.disputeCase.findFirst({ where: { appealOfCaseId: caseId } });
  if (existing) return { ok: false, error: "This case has already been appealed once." };
  const parties = await bridgeHireParties(original.subjectHireId);
  if (!parties) return { ok: false, error: "The hire behind this case no longer exists." };
  const settings = await getPlatformSettings();
  const target = settings.juryAppealPanelSize;

  return adminDb.$transaction(async (tx) => {
    const claim = await tx.disputeCase.updateMany({ where: { id: caseId, status: "VERDICT" }, data: { status: "APPEALED" } });
    if (claim.count === 0) return { ok: false as const, error: "This case is no longer open to appeal." };
    const draw = await drawJurors(tx, target, [parties.clientUserId, parties.workerUserId], original.assignments.map((a) => a.jurorId));
    const appeal = await tx.disputeCase.create({
      data: {
        complaintId: original.complaintId,
        subjectHireId: original.subjectHireId,
        subjectPhaseId: original.subjectPhaseId,
        clientLabel: original.clientLabel,
        workerLabel: original.workerLabel,
        reason: `Appeal of case ${caseId.slice(-6)}: ${original.reason}`.slice(0, 500),
        valueTier: "LARGE",
        panelSize: draw.drawn.length,
        escrowAmount: original.escrowAmount,
        status: "COMMIT",
        appealOfCaseId: caseId,
        commitDeadline: new Date(now.getTime() + settings.juryCommitHours * HOUR),
        revealDeadline: new Date(now.getTime() + (settings.juryCommitHours + settings.juryRevealHours) * HOUR),
      },
    });
    await seatPanel(tx, appeal.id, draw.drawn);
    return { ok: true as const, appealId: appeal.id, panel: draw.drawn.length, target, draw };
  });
}

// ---------------------------------------------------------------------------
// Settlement claim (ADM-08). The caller claims VERDICT → EXECUTED before moving money,
// and gives the claim back if the payment fails — so two clicks can't settle twice.
// ---------------------------------------------------------------------------
export async function claimSettlement(caseId: string, now: Date = new Date()): Promise<{ ok: true; dispute: DisputeCase } | Fail> {
  const c = await adminDb.disputeCase.findUnique({ where: { id: caseId }, include: { votes: true } });
  if (!c) return { ok: false, error: "Case not found." };
  const blocked = disputeBlocker(stateOf(c, c.votes), "settle", now);
  if (blocked) return { ok: false, error: blocked };
  if (c.verdictChoice == null) return { ok: false, error: "No verdict to execute yet." };
  const claim = await adminDb.disputeCase.updateMany({ where: { id: caseId, status: "VERDICT" }, data: { status: "EXECUTED" } });
  if (claim.count === 0) return { ok: false, error: "This case is already being settled." };
  return { ok: true, dispute: c };
}

export async function releaseSettlementClaim(caseId: string): Promise<void> {
  await adminDb.disputeCase.updateMany({ where: { id: caseId, status: "EXECUTED" }, data: { status: "VERDICT" } });
}

// ---------------------------------------------------------------------------
// The jury timer — run from the cron tick. Idempotent: each lapsed case is claimed
// with a guarded update that also pushes its deadline, so a second tick finds nothing.
// ---------------------------------------------------------------------------
export interface JuryTickResult {
  /** Jurors dropped for missing the commit deadline. */
  removedNonCommitters: number;
  /** Replacement jurors seated. */
  seated: number;
  movedToReveal: number;
  finalized: number;
  /** Panels redrawn because the reveal deadline passed without quorum. */
  redrawn: number;
  errors: string[];
}

const TIMER = "Jury timer";

/** `onlyCaseIds` limits the tick to those cases (tests; the cron passes nothing). */
export async function runJuryTick(now: Date = new Date(), onlyCaseIds?: string[]): Promise<JuryTickResult> {
  const res: JuryTickResult = { removedNonCommitters: 0, seated: 0, movedToReveal: 0, finalized: 0, redrawn: 0, errors: [] };
  const lapsed = await adminDb.disputeCase.findMany({
    where: {
      ...(onlyCaseIds ? { id: { in: onlyCaseIds } } : {}),
      OR: [
        { status: "COMMIT", commitDeadline: { lt: now } },
        { status: "REVEAL", revealDeadline: { lt: now } },
      ],
    },
    select: { id: true, status: true },
  });
  if (lapsed.length === 0) return res;
  const settings = await getPlatformSettings();
  for (const c of lapsed) {
    try {
      if (c.status === "COMMIT") await lapseCommit(c.id, now, settings, res);
      else await lapseReveal(c.id, now, settings, res);
    } catch (e) {
      res.errors.push(`case ${c.id}: ${(e as Error).message.slice(0, 160)}`);
    }
  }
  return res;
}

/** Commit deadline passed: drop non-committers, top the panel back up, or move on to reveal. */
async function lapseCommit(caseId: string, now: Date, s: PlatformSettings, res: JuryTickResult): Promise<void> {
  const head = await adminDb.disputeCase.findUnique({ where: { id: caseId } });
  if (!head) return;
  const parties = await bridgeHireParties(head.subjectHireId);

  const out = await adminDb.$transaction(async (tx) => {
    // Claim: push the commit deadline. A concurrent tick no longer matches `lt: now`.
    const commitDeadline = new Date(now.getTime() + s.juryCommitHours * HOUR);
    const claim = await tx.disputeCase.updateMany({
      where: { id: caseId, status: "COMMIT", commitDeadline: { lt: now } },
      data: { commitDeadline },
    });
    if (claim.count === 0) return null;

    const c = await tx.disputeCase.findUniqueOrThrow({ where: { id: caseId }, include: { votes: true, assignments: true } });
    const missing = c.votes.filter((v) => !v.commitHash).map((v) => v.jurorId);
    const committed = c.votes.length - missing.length;
    if (missing.length) {
      await tx.juryAssignment.updateMany({ where: { caseId, jurorId: { in: missing } }, data: { removedAt: now } });
      await tx.juryVote.deleteMany({ where: { caseId, jurorId: { in: missing }, commitHash: null } });
    }
    const need = Math.max(0, targetPanel(c, s) - committed);
    const draw = parties && need > 0
      ? await drawJurors(tx, need, [parties.clientUserId, parties.workerUserId], c.assignments.map((a) => a.jurorId))
      : null;
    const drawn = draw?.drawn ?? [];
    await seatPanel(tx, caseId, drawn);

    if (drawn.length === 0 && committed > 0) {
      // Nobody left to draw: the jurors who did commit decide the case.
      await tx.disputeCase.update({
        where: { id: caseId },
        data: { status: "REVEAL", panelSize: committed, revealDeadline: new Date(now.getTime() + s.juryRevealHours * HOUR) },
      });
      return { missing, draw, movedToReveal: true };
    }
    // New jurors get a full commit window; with nobody at all, try again next window.
    await tx.disputeCase.update({
      where: { id: caseId },
      data: { panelSize: committed + drawn.length, revealDeadline: new Date(commitDeadline.getTime() + s.juryRevealHours * HOUR) },
    });
    return { missing, draw, movedToReveal: false };
  });
  if (!out) return;

  res.removedNonCommitters += out.missing.length;
  res.seated += out.draw?.drawn.length ?? 0;
  if (out.movedToReveal) res.movedToReveal++;
  await writeAudit({
    actorLabel: TIMER, action: "JURY_COMMIT_LAPSED", targetType: "DisputeCase", targetId: caseId,
    after: { removedJurors: out.missing, ...(out.draw ? { drawSeed: out.draw.seed, eligible: out.draw.eligible, drawn: out.draw.drawn } : {}), movedToReveal: out.movedToReveal },
  });
}

/** Reveal deadline passed: finalize if there's quorum, otherwise slash non-revealers and redraw. */
async function lapseReveal(caseId: string, now: Date, s: PlatformSettings, res: JuryTickResult): Promise<void> {
  const c = await adminDb.disputeCase.findUnique({ where: { id: caseId }, include: { votes: true } });
  if (!c) return;
  const revealed = c.votes.filter((v) => v.revealedChoice != null).length;

  if (hasQuorum(revealed, c.votes.length)) {
    const r = await tallyAndFinalize(caseId, now);
    if (!r.ok) return; // someone finalized it first
    res.finalized++;
    await writeAudit({
      actorLabel: TIMER, action: "JURY_VERDICT", targetType: "DisputeCase", targetId: caseId,
      after: { verdict: r.verdict, splitPct: r.splitPct, slashedNonRevealers: r.slashedNonRevealers, reason: "reveal deadline passed" },
    });
    return;
  }

  // No quorum: the round fails. Non-revealers lose a slash; a fresh panel votes again.
  const parties = await bridgeHireParties(c.subjectHireId);
  const out = await adminDb.$transaction(async (tx) => {
    const commitDeadline = new Date(now.getTime() + s.juryCommitHours * HOUR);
    const claim = await tx.disputeCase.updateMany({
      where: { id: caseId, status: "REVEAL", revealDeadline: { lt: now } },
      data: { status: "COMMIT", commitDeadline, revealDeadline: new Date(commitDeadline.getTime() + s.juryRevealHours * HOUR) },
    });
    if (claim.count === 0) return null;
    const cur = await tx.disputeCase.findUniqueOrThrow({ where: { id: caseId }, include: { votes: true, assignments: true } });
    const nonRevealers = cur.votes.filter((v) => v.commitHash && v.revealedChoice == null).map((v) => v.jurorId);
    for (const jurorId of nonRevealers) {
      const j = await tx.jurorProfile.findUnique({ where: { id: jurorId } });
      if (j) await tx.jurorProfile.update({ where: { id: jurorId }, data: { stakeBalance: { decrement: slashFor(Number(j.stakeBalance)) } } });
    }
    const failedRound = cur.votes.map((v) => ({ jurorId: v.jurorId, committed: !!v.commitHash, revealed: v.revealedChoice }));
    await tx.juryAssignment.updateMany({ where: { caseId, removedAt: null }, data: { removedAt: now } });
    await tx.juryVote.deleteMany({ where: { caseId } });
    const draw = parties
      ? await drawJurors(tx, targetPanel(cur, s), [parties.clientUserId, parties.workerUserId], cur.assignments.map((a) => a.jurorId))
      : null;
    await seatPanel(tx, caseId, draw?.drawn ?? []);
    await tx.disputeCase.update({ where: { id: caseId }, data: { panelSize: draw?.drawn.length ?? 0 } });
    return { nonRevealers, failedRound, draw };
  });
  if (!out) return;

  res.redrawn++;
  res.seated += out.draw?.drawn.length ?? 0;
  await writeAudit({
    actorLabel: TIMER, action: "JURY_REDRAW", targetType: "DisputeCase", targetId: caseId,
    before: { round: out.failedRound },
    after: { slashedNonRevealers: out.nonRevealers, ...(out.draw ? { drawSeed: out.draw.seed, eligible: out.draw.eligible, drawn: out.draw.drawn } : {}) },
  });
}
