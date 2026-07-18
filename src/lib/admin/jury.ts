import "server-only";
import { keccak256, toHex } from "viem";
import { adminDb } from "@/lib/adminDb";
import { getPlatformSettings } from "@/lib/config/platformConfig";
import * as chain from "@/lib/chain/escrow";
import type { VerdictChoice } from "@/generated/admin";

/*
  The peer-jury dispute engine (spec Section 12). Escalation freezes a phase's escrow
  and opens an anonymized case with a staked panel; jurors vote commit-then-reveal;
  the tally (median % for split verdicts) becomes the verdict; stakes settle
  (majority refunded + fee, minority slashed) and reputations update.
*/

// ---- commit-reveal hash: keccak256 over a canonical (choice|split|salt) string ----
export function voteCommitHash(choice: VerdictChoice, splitPct: number, salt: string): string {
  return keccak256(toHex(`${choice}|${splitPct}|${salt}`));
}

/** A stable, non-identifying 4-digit label from a platform user id. */
function anonLabel(prefix: string, userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) % 10000;
  return `${prefix} #${String(h).padStart(4, "0")}`;
}

function tierFor(amountInr: number): { tier: "SMALL" | "STANDARD" | "LARGE"; panel: number } {
  if (amountInr < 5000) return { tier: "SMALL", panel: 3 };
  if (amountInr < 20000) return { tier: "STANDARD", panel: 5 };
  return { tier: "LARGE", panel: 7 };
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
}): Promise<{ caseId: string; panel: number; frozen: boolean }> {
  const settings = await getPlatformSettings();
  const { tier, panel } = tierFor(input.escrowAmountInr);

  // Freeze the phase's escrow on-chain (best-effort — a seed phase may not be funded).
  let frozen = false;
  try {
    await chain.raiseDispute(input.subjectPhaseId);
    frozen = true;
  } catch (e) {
    console.warn("raiseDispute skipped (phase not funded on-chain?):", (e as Error).message.slice(0, 80));
  }

  const now = Date.now();
  const dispute = await adminDb.disputeCase.create({
    data: {
      complaintId: input.complaintId,
      subjectHireId: input.subjectHireId,
      subjectPhaseId: input.subjectPhaseId,
      clientLabel: anonLabel("Client", input.clientUserId),
      workerLabel: anonLabel("Worker", input.workerUserId),
      reason: input.reason,
      valueTier: tier,
      panelSize: panel,
      escrowAmount: input.escrowAmountInr,
      status: "COMMIT",
      commitDeadline: new Date(now + 48 * 3600 * 1000),
      revealDeadline: new Date(now + 72 * 3600 * 1000),
    },
  });

  // Assign a random eligible panel, EXCLUDING any juror who is a party (conflict).
  const eligible = await adminDb.jurorProfile.findMany({
    where: { status: "ACTIVE", platformUserId: { notIn: [input.clientUserId, input.workerUserId] } },
  });
  const shuffled = [...eligible].sort(() => Math.random() - 0.5).slice(0, panel);
  for (const juror of shuffled) {
    await adminDb.juryAssignment.create({ data: { caseId: dispute.id, jurorId: juror.id } });
    await adminDb.juryVote.create({ data: { caseId: dispute.id, jurorId: juror.id } });
  }
  return { caseId: dispute.id, panel, frozen };
}

// ---------------------------------------------------------------------------
// Commit / reveal
// ---------------------------------------------------------------------------
export async function commitVote(caseId: string, jurorId: string, commitHash: string): Promise<{ ok: boolean; error?: string }> {
  const vote = await adminDb.juryVote.findFirst({ where: { caseId, jurorId } });
  if (!vote) return { ok: false, error: "You're not on this panel." };
  if (vote.commitHash) return { ok: false, error: "You've already committed — a commit can't be changed." };
  await adminDb.juryVote.update({ where: { id: vote.id }, data: { commitHash, committedAt: new Date() } });
  // Once every panellist has committed, open the reveal phase.
  const [total, committed] = await Promise.all([
    adminDb.juryVote.count({ where: { caseId } }),
    adminDb.juryVote.count({ where: { caseId, commitHash: { not: null } } }),
  ]);
  if (committed >= total) await adminDb.disputeCase.update({ where: { id: caseId }, data: { status: "REVEAL" } });
  return { ok: true };
}

export async function revealVote(
  caseId: string,
  jurorId: string,
  choice: VerdictChoice,
  splitPct: number,
  salt: string
): Promise<{ ok: boolean; error?: string }> {
  const vote = await adminDb.juryVote.findFirst({ where: { caseId, jurorId } });
  if (!vote || !vote.commitHash) return { ok: false, error: "Nothing committed to reveal." };
  if (vote.revealedChoice) return { ok: false, error: "Already revealed." };
  // Verify the reveal matches the commitment — a mismatch is rejected.
  if (voteCommitHash(choice, splitPct, salt) !== vote.commitHash) {
    return { ok: false, error: "Reveal doesn't match your committed vote." };
  }
  await adminDb.juryVote.update({
    where: { id: vote.id },
    data: { revealedChoice: choice, revealedSplitPct: choice === "SPLIT" ? splitPct : null, salt, revealedAt: new Date() },
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Tally + finalize (median for split) + juror stake settlement
// ---------------------------------------------------------------------------
function median(nums: number[]): number {
  if (nums.length === 0) return 50;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

export async function tallyAndFinalize(caseId: string): Promise<{ ok: boolean; error?: string; verdict?: VerdictChoice; splitPct?: number }> {
  const dispute = await adminDb.disputeCase.findUnique({ where: { id: caseId }, include: { votes: true } });
  if (!dispute) return { ok: false, error: "Case not found." };
  const revealed = dispute.votes.filter((v) => v.revealedChoice != null);
  // Quorum: a strict majority of the panel must have revealed.
  if (revealed.length * 2 <= dispute.panelSize) {
    return { ok: false, error: "Quorum not reached — need more revealed votes." };
  }

  const counts: Record<string, number> = { RELEASE_WORKER: 0, REFUND_CLIENT: 0, SPLIT: 0 };
  for (const v of revealed) counts[v.revealedChoice as string]++;
  const verdict = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]) as VerdictChoice;
  // Tied split proposals resolve to the MEDIAN proposed %, not the mean.
  const splitPct = verdict === "SPLIT"
    ? median(revealed.filter((v) => v.revealedChoice === "SPLIT").map((v) => v.revealedSplitPct ?? 50))
    : null;

  // Settle juror stakes + reputations: majority side refunded + fee, minority slashed.
  const settings = await getPlatformSettings();
  const fee = Math.round(settings.deliveryStakeThresholdInr * 0); // placeholder; fee is a fixed reward below
  const FEE = 100; // reward from the platform dispute fee (not the parties' funds)
  const SLASH = 200;
  for (const v of revealed) {
    const isMajority = v.revealedChoice === verdict;
    const juror = await adminDb.jurorProfile.findUnique({ where: { id: v.jurorId } });
    if (!juror) continue;
    const newCases = juror.casesCount + 1;
    const newAgreement = (juror.agreementRate * juror.casesCount + (isMajority ? 100 : 0)) / newCases;
    await adminDb.jurorProfile.update({
      where: { id: v.jurorId },
      data: {
        casesCount: newCases,
        agreementRate: newAgreement,
        stakeBalance: { increment: isMajority ? FEE : -SLASH },
      },
    });
    await adminDb.juryVote.update({ where: { id: v.id }, data: { isMajority } });
  }
  void fee;

  await adminDb.disputeCase.update({
    where: { id: caseId },
    data: { status: "VERDICT", verdictChoice: verdict, verdictSplitPct: splitPct },
  });
  return { ok: true, verdict, splitPct: splitPct ?? undefined };
}

// ---------------------------------------------------------------------------
// Appeals — once per case, to a larger (7) panel
// ---------------------------------------------------------------------------
export async function appealCase(caseId: string): Promise<{ ok: boolean; error?: string; appealId?: string }> {
  const original = await adminDb.disputeCase.findUnique({ where: { id: caseId } });
  if (!original) return { ok: false, error: "Case not found." };
  const existing = await adminDb.disputeCase.findFirst({ where: { appealOfCaseId: caseId } });
  if (existing) return { ok: false, error: "This case has already been appealed once." };

  const now = Date.now();
  const appeal = await adminDb.disputeCase.create({
    data: {
      complaintId: original.complaintId,
      subjectHireId: original.subjectHireId,
      subjectPhaseId: original.subjectPhaseId,
      clientLabel: original.clientLabel,
      workerLabel: original.workerLabel,
      reason: `Appeal of case ${caseId.slice(-6)}: ${original.reason}`,
      valueTier: "LARGE",
      panelSize: 7,
      escrowAmount: original.escrowAmount,
      status: "COMMIT",
      appealOfCaseId: caseId,
      commitDeadline: new Date(now + 48 * 3600 * 1000),
      revealDeadline: new Date(now + 72 * 3600 * 1000),
    },
  });
  await adminDb.disputeCase.update({ where: { id: caseId }, data: { status: "APPEALED" } });
  return { ok: true, appealId: appeal.id };
}
