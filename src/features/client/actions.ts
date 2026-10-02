"use server";

import { revalidatePath } from "next/cache";
import { hireStake } from "@/lib/escrow/stake";
import { redirect } from "next/navigation";
import { platformDb } from "@/lib/platformDb";
import { requireRole, assertKycVerified } from "@/lib/auth/guards";
import * as chain from "@/lib/chain/escrow";
import { payoutAddressFor } from "@/lib/chain/wallet";
import { runPayment } from "@/lib/payments/service";
import { custodialAddressOf, escrowAddressLabel, refreshBalanceCache } from "@/lib/payments/parties";
import { canTransitionPhase, phaseTransition, PhaseTransitionError, isPhaseSettled } from "@/lib/escrow/phaseMachine";
import { notify } from "@/lib/notify";
import { submitReview, type ReviewInput } from "@/lib/reviews";
import { maybeCompleteHire } from "@/lib/hires";

export interface ActionState {
  ok?: boolean;
  error?: string;
  message?: string;
  released?: boolean; // triggers the Forge Complete animation
  txHash?: string;
  /** The PaymentTransaction recorded for a money action (success or failure). */
  paymentId?: string;
  /** Its receipt (P2) — failed attempts get one too. */
  receiptNo?: string | null;
  /** Failure code (src/lib/payments/errors.ts), e.g. INSUFFICIENT_BALANCE. */
  code?: string;
  /** INSUFFICIENT_BALANCE only: how much more the wallet needs (₹, rounded up). */
  shortfallInr?: number;
  /** Broadcast but not yet confirmed — the UI tracks paymentId live (P5.3). */
  pending?: boolean;
}

function str(fd: FormData, key: string) {
  return String(fd.get(key) ?? "").trim();
}

// ---------------------------------------------------------------------------
// REAL: Post a Job (CL-03) — creates Job + JobRoleLineItem records. Not money;
// escrow funding is a separate (stubbed) step. A published job immediately appears
// in the Worker's Find Jobs.
// ---------------------------------------------------------------------------
export async function postJobAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireRole("CLIENT");

  const title = str(formData, "title");
  const description = str(formData, "description");
  const categoryId = str(formData, "categoryId");
  const location = str(formData, "location");
  const startDate = str(formData, "startDate");
  const endDate = str(formData, "endDate");
  const fundingMode = str(formData, "fundingMode") === "FUND_NOW" ? "FUND_NOW" : "FUND_AT_HIRE";
  const publish = str(formData, "publish") === "true";

  let roles: { roleName: string; skillId?: string; headcount: number; rate: number }[] = [];
  try {
    roles = JSON.parse(str(formData, "roles") || "[]");
  } catch {
    return { error: "Could not read the role line items." };
  }

  if (!title) return { error: "Give the job a title." };
  if (!description) return { error: "Add a short description." };
  if (!categoryId) return { error: "Pick a category." };
  const validRoles = roles.filter((r) => r.roleName && r.headcount > 0 && r.rate > 0);
  if (validRoles.length === 0) return { error: "Add at least one role with a headcount and rate." };

  await platformDb.job.create({
    data: {
      clientId: user.id,
      title,
      description,
      categoryId,
      location: location || null,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      fundingMode,
      status: publish ? "PUBLISHED" : "DRAFT",
      publishedAt: publish ? new Date() : null,
      roleLineItems: {
        create: validRoles.map((r) => ({
          roleName: r.roleName,
          skillId: r.skillId || null,
          headcount: r.headcount,
          perPersonRate: r.rate,
        })),
      },
    },
  });

  revalidatePath("/dashboard/client/jobs");
  redirect("/dashboard/client/jobs");
}

// ---------------------------------------------------------------------------
// Accept an applicant (CL-05).
//
// This now only routes: the hire, its contract and its phases are created by
// `createHireWithMilestonesAction` (src/features/contracts/actions.ts) once the
// client has built the milestone payment plan, and escrow stays locked out until
// both parties have signed. Kept as a redirect so any older link still lands in
// the right place instead of quietly creating a one-phase hire.
// ---------------------------------------------------------------------------
export async function acceptApplicantAction(applicationId: string): Promise<ActionState> {
  await requireRole("CLIENT");
  redirect(`/dashboard/client/offer/${applicationId}`);
}

export async function rejectApplicantAction(applicationId: string): Promise<ActionState> {
  const user = await requireRole("CLIENT");
  const app = await platformDb.jobApplication.findUnique({
    where: { id: applicationId },
    include: { job: true },
  });
  if (!app || app.job.clientId !== user.id) return { error: "Application not found." };
  await platformDb.jobApplication.update({ where: { id: applicationId }, data: { status: "REJECTED" } });
  revalidatePath(`/dashboard/client/jobs/${app.jobId}/applicants`);
  return { ok: true, message: "Applicant rejected." };
}

// ---------------------------------------------------------------------------
// REAL on-chain money actions (Phase 7) — live against the PhaseEscrow contract.
// ---------------------------------------------------------------------------

/// Load a phase the client owns, or return null.
async function loadOwnedPhase(userId: string, phaseId: string) {
  const phase = await platformDb.phase.findUnique({
    where: { id: phaseId },
    include: { hire: { include: { client: true, worker: true, contract: true } } },
  });
  if (!phase || phase.hire.clientId !== userId) return null;
  return phase;
}

/** Fund a phase's escrow. KYC-gated; enforces sequential funding. */
export async function fundPhaseAction(phaseId: string): Promise<ActionState> {
  const user = await requireRole("CLIENT");
  const phase = await loadOwnedPhase(user.id, phaseId);
  if (!phase) return { error: "Phase not found." };
  if (!canTransitionPhase("fund", phase.status)) return { error: "This phase isn't awaiting funding." };

  // SIGNATURE GATE — no escrow moves before both parties have signed the contract.
  // Deliberately checked before KYC so the user is told the real blocker first.
  const contract = phase.hire.contract;
  if (!contract?.clientSignature || !contract?.workerSignature) {
    const who = !contract?.clientSignature ? "You haven't" : "The worker hasn't";
    return {
      error: `${who} signed the contract yet — escrow unlocks once both signatures are recorded.`,
    };
  }

  // STAKE GATE (P3.6) — above the threshold the worker's refundable delivery stake must be
  // in escrow before the client is asked to fund anything.
  const stake = await hireStake(phase.hire);
  if (stake.state === "AWAITING") {
    return { error: `The worker hasn't locked their ₹${stake.amountInr.toLocaleString("en-IN")} delivery stake yet — funding opens once it's in escrow.` };
  }

  // KYC gate — blocks money movement until VERIFIED (redirects to soft-block).
  await assertKycVerified(user, `/dashboard/client/hires/${phase.hireId}`);

  // Sequential funding: a phase can only be funded once the previous one has settled.
  if (phase.index > 1) {
    const prev = await platformDb.phase.findFirst({
      where: { hireId: phase.hireId, index: phase.index - 1 },
    });
    if (prev && !isPhaseSettled(prev.status)) {
      return { error: `Fund Phase ${phase.index} unlocks once Phase ${phase.index - 1} closes.` };
    }
  }

  const [from, to] = await Promise.all([custodialAddressOf(phase.hire.clientId), payoutAddressFor(phase.hire.workerId)]);
  const res = await runPayment(
    {
      kind: "FUND", operation: "fundPhase", signer: "CUSTODIAL", amountInr: Number(phase.amount),
      payerUserId: phase.hire.clientId, payeeUserId: phase.hire.workerId,
      fromAddress: from, toAddress: to, phaseId: phase.id, hireId: phase.hireId,
    },
    () => chain.fundPhase(phase.id, phase.hire.clientId, phase.hire.workerId, Number(phase.amount)),
    {
      onConfirmedTx: async (tx, _payment, receipt) => {
        await tx.notification.create({
          data: {
            userId: phase.hire.workerId, type: "ESCROW", title: "Escrow funded",
            body: `${user.name} funded "${phase.name}". You can start work. Receipt ${receipt.receiptNo}.`,
            linkUrl: `/dashboard/worker/hires/${phase.hireId}`,
          },
        });
      },
    },
  );
  revalidatePath(`/dashboard/client/hires/${phase.hireId}`);
  revalidatePath("/dashboard/client/payments");
  if (!res.ok) {
    // P3.1: funding spends the real balance only — tell the client exactly how much to add.
    let shortfallInr: number | undefined;
    if (res.code === "INSUFFICIENT_BALANCE") {
      const spendable = await chain.balanceOfInr(from).catch(() => 0);
      shortfallInr = Math.max(1, Math.ceil(Number(phase.amount) - spendable));
    }
    return { error: res.reason, code: res.code, shortfallInr, pending: res.pending, paymentId: res.paymentId, receiptNo: res.receiptNo };
  }
  return { ok: true, message: "Escrow funded — funds are locked.", txHash: res.txHash, paymentId: res.paymentId, receiptNo: res.receiptNo };
}

/** Approve a delivered phase → the escrow releases to the worker. */
export async function approvePhaseAction(phaseId: string): Promise<ActionState> {
  const user = await requireRole("CLIENT");
  const phase = await loadOwnedPhase(user.id, phaseId);
  if (!phase) return { error: "Phase not found." };
  if (!canTransitionPhase("approve", phase.status)) return { error: "This phase isn't ready to approve." };

  const res = await runPayment(
    {
      kind: "RELEASE", operation: "approveRelease", signer: "RELAYER", amountInr: Number(phase.amount),
      payerUserId: phase.hire.clientId, payeeUserId: phase.hire.workerId,
      fromAddress: escrowAddressLabel(), toAddress: await payoutAddressFor(phase.hire.workerId),
      phaseId: phase.id, hireId: phase.hireId,
    },
    () => chain.approveRelease(phase.id),
    {
      afterConfirmed: async (_payment, receipt) => {
        await refreshBalanceCache(phase.hire.workerId);
        await notify({
          userId: phase.hire.workerId,
          type: "PAYMENT",
          title: "Payment released",
          body: `${phase.name} was approved — funds released to your wallet. Receipt ${receipt.receiptNo}.`,
          linkUrl: "/dashboard/worker/earnings",
        });
        // If that was the last phase, the hire is complete → opens up reviews.
        await maybeCompleteHire(phase.hireId);
      },
    },
  );
  revalidatePath(`/dashboard/client/hires/${phase.hireId}`);
  revalidatePath("/dashboard/client/payments");
  if (!res.ok) return { error: res.reason, pending: res.pending, paymentId: res.paymentId, receiptNo: res.receiptNo };
  return { ok: true, message: "Approved — funds released to the worker.", released: true, txHash: res.txHash, paymentId: res.paymentId, receiptNo: res.receiptNo };
}

/** Request changes: resets the verification window and bumps the revision counter. */
export async function requestChangesAction(phaseId: string): Promise<ActionState> {
  const user = await requireRole("CLIENT");
  const phase = await loadOwnedPhase(user.id, phaseId);
  if (!phase) return { error: "Phase not found." };
  // F4: only a delivered phase can go back for changes — never a released, disputed
  // or unfunded one (that used to desync the DB from the chain).
  if (!canTransitionPhase("requestChanges", phase.status)) {
    return { error: new PhaseTransitionError("requestChanges", phase.status).message };
  }
  if (phase.revisionCount >= 2) {
    return { error: "Revision limit reached — please file a complaint instead of requesting more changes." };
  }
  const t = phaseTransition("requestChanges", phase.status);
  const res = await platformDb.phase.updateMany({
    where: { id: phase.id, status: { in: t.from }, revisionCount: phase.revisionCount },
    data: { status: t.to, revisionCount: { increment: 1 }, verificationDeadline: null },
  });
  if (res.count !== 1) return { error: "This phase just changed — refresh and try again." };
  revalidatePath(`/dashboard/client/hires/${phase.hireId}`);
  return { ok: true, message: `Changes requested (revision ${phase.revisionCount + 1} of 2). The window resets on redelivery.` };
}

/** Mark no-show: roll the funded phase's escrow back to the client. */
export async function markNoShowAction(hireId: string): Promise<ActionState> {
  const user = await requireRole("CLIENT");
  const hire = await platformDb.hire.findFirst({
    where: { id: hireId, clientId: user.id },
    include: { phases: { orderBy: { index: "asc" } }, deliveryStake: true },
  });
  if (!hire) return { error: "Hire not found." };
  // No-show = the worker never delivered: only a funded, undelivered phase qualifies.
  const funded = hire.phases.find((p) => p.status === "FUNDED" || p.status === "IN_PROGRESS");
  if (!funded) return { error: "No funded, undelivered phase to roll back." };

  const res = await runPayment(
    {
      kind: "REFUND", operation: "refundToClient", signer: "RELAYER", amountInr: Number(funded.amount),
      payerUserId: hire.clientId, payeeUserId: hire.clientId,
      fromAddress: escrowAddressLabel(), toAddress: await custodialAddressOf(hire.clientId),
      phaseId: funded.id, hireId: hire.id,
    },
    () => chain.refundToClient(funded.id),
    {
      onConfirmedTx: async (tx) => {
        await tx.hire.updateMany({ where: { id: hire.id, status: "ACTIVE" }, data: { status: "NO_SHOW_FLAGGED" } });
        await tx.user.update({ where: { id: hire.workerId }, data: { strikes: { increment: 1 } } });
      },
      afterConfirmed: () => refreshBalanceCache(hire.clientId),
    },
  );
  revalidatePath(`/dashboard/client/hires/${hireId}`);
  revalidatePath("/dashboard/client/payments");
  if (!res.ok) return { error: res.reason, pending: res.pending, paymentId: res.paymentId, receiptNo: res.receiptNo };
  return { ok: true, message: "Escrow rolled back to you; a strike was applied to the worker.", txHash: res.txHash, paymentId: res.paymentId, receiptNo: res.receiptNo };
}

export async function proposeSettlementAction(hireId: string): Promise<ActionState> {
  await requireRole("CLIENT");
  console.log(`TODO Phase 7: propose mutual settlement split for hire ${hireId}.`);
  return { message: "Mutual settlement calls the contract's settle function in Phase 7." };
}

export async function addFundsAction(): Promise<ActionState> {
  await requireRole("CLIENT");
  console.log("TODO Phase 9: add funds to custodial wallet (on-ramp).");
  return { message: "Adding funds is wired to the wallet layer in Phase 9." };
}

/** Send a hire-scoped message (CL-09). Threads only exist within a hire the client owns. */
export async function sendMessageAction(hireId: string, body: string): Promise<ActionState> {
  const user = await requireRole("CLIENT");
  const text = body.trim();
  if (!text) return { error: "Write something first." };
  const hire = await platformDb.hire.findFirst({
    where: { id: hireId, clientId: user.id },
    include: { job: true },
  });
  if (!hire) return { error: "Conversation not found." };

  await platformDb.message.create({ data: { hireId, senderId: user.id, body: text } });
  await notify({
    userId: hire.workerId,
    type: "MESSAGE",
    title: `New message from ${user.name}`,
    body: text.length > 80 ? text.slice(0, 77) + "…" : text,
    linkUrl: `/dashboard/worker/messages?thread=${hireId}`,
  });
  revalidatePath(`/dashboard/client/messages`);
  return { ok: true };
}

/** Leave a review on a completed hire (CL-10). Client → Worker. */
export async function submitReviewAction(input: Omit<ReviewInput, "direction" | "authorId">): Promise<ActionState> {
  const user = await requireRole("CLIENT");
  return submitReview({ ...input, direction: "CLIENT_TO_WORKER", authorId: user.id });
}

const CLIENT_CATEGORY: Record<string, "QUALITY" | "NO_SHOW" | "CONDUCT" | "OTHER"> = {
  "Work quality": "QUALITY", "No-show": "NO_SHOW", Behavior: "CONDUCT", Other: "OTHER",
};

/** File a complaint on a hire (CL-13). Lands in triage (ADM-06); may escalate to a jury. */
export async function submitComplaintAction(hireId: string, category: string, description: string): Promise<ActionState> {
  const user = await requireRole("CLIENT");
  const hire = await platformDb.hire.findFirst({
    where: { id: hireId, clientId: user.id },
    include: { phases: { where: { status: { in: ["FUNDED", "IN_PROGRESS", "DELIVERED", "VERIFICATION_WINDOW_OPEN"] } }, take: 1 } },
  });
  if (!hire) return { error: "Hire not found." };
  if (!description.trim()) return { error: "Describe what happened." };
  await platformDb.complaint.create({
    data: {
      hireId,
      phaseId: hire.phases[0]?.id ?? null,
      filedById: user.id,
      category: CLIENT_CATEGORY[category] ?? "OTHER",
      description: description.trim(),
      status: "OPEN",
    },
  });
  revalidatePath("/dashboard/client/complaint");
  return { ok: true, message: "Complaint filed — it's now in the platform's triage queue." };
}
