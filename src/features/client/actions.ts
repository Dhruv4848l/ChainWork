"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { platformDb } from "@/lib/platformDb";
import { requireRole, assertKycVerified } from "@/lib/auth/guards";
import * as chain from "@/lib/chain/escrow";
import { ESCROW_ADDRESS } from "@/lib/chain/config";

export interface ActionState {
  ok?: boolean;
  error?: string;
  message?: string;
  released?: boolean; // triggers the Forge Complete animation
  txHash?: string;
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
// REAL: Accept an applicant (CL-05) — creates Hire + Contract + Phase records
// (partial hiring allowed: other slots stay open). Escrow stays UNFUNDED (Phase 7).
// The hire becomes visible on both the client and worker dashboards.
// ---------------------------------------------------------------------------
export async function acceptApplicantAction(applicationId: string): Promise<ActionState> {
  const user = await requireRole("CLIENT");

  const app = await platformDb.jobApplication.findUnique({
    where: { id: applicationId },
    include: { job: true, roleLineItem: true },
  });
  if (!app || app.job.clientId !== user.id) return { error: "Application not found." };
  if (app.status === "HIRED") return { error: "This applicant is already hired." };

  const value = Number(app.proposedRate ?? app.roleLineItem.perPersonRate);

  const hire = await platformDb.hire.create({
    data: {
      jobId: app.jobId,
      roleLineItemId: app.roleLineItemId,
      clientId: user.id,
      workerId: app.workerId,
      status: "ACTIVE",
      totalValue: value,
      contract: {
        create: {
          totalValue: value,
          startDate: app.job.startDate,
          endDate: app.job.endDate,
          scope: app.job.description,
          cancellationTerms: "10% penalty on pre-work cancellation, per platform policy.",
          acceptedByClient: true,
          acceptedByWorker: true,
          acceptedAt: new Date(),
        },
      },
      phases: {
        create: [{ index: 1, name: "Full job", amount: value, dueDate: app.job.endDate, status: "PENDING_FUNDING" }],
      },
    },
  });

  await platformDb.$transaction([
    platformDb.jobApplication.update({ where: { id: applicationId }, data: { status: "HIRED" } }),
    platformDb.jobRoleLineItem.update({
      where: { id: app.roleLineItemId },
      data: { hiredCount: { increment: 1 } },
    }),
    platformDb.notification.create({
      data: {
        userId: app.workerId,
        type: "APPLICATION",
        title: "You've been hired!",
        body: `${user.name} hired you for "${app.job.title}". Fund the first phase to begin.`,
      },
    }),
  ]);

  redirect(`/dashboard/client/hires/${hire.id}`);
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
    include: { hire: { include: { client: true, worker: true } } },
  });
  if (!phase || phase.hire.clientId !== userId) return null;
  return phase;
}

/** Fund a phase's escrow on-chain. KYC-gated; enforces sequential funding. */
export async function fundPhaseAction(phaseId: string): Promise<ActionState> {
  const user = await requireRole("CLIENT");
  const phase = await loadOwnedPhase(user.id, phaseId);
  if (!phase) return { error: "Phase not found." };
  if (phase.status !== "PENDING_FUNDING") return { error: "This phase isn't awaiting funding." };

  // KYC gate — blocks money movement until VERIFIED (redirects to soft-block).
  await assertKycVerified(user, `/dashboard/client/hires/${phase.hireId}`);

  // Sequential funding: a phase can only be funded once the previous one released.
  if (phase.index > 1) {
    const prev = await platformDb.phase.findFirst({
      where: { hireId: phase.hireId, index: phase.index - 1 },
    });
    if (prev && prev.status !== "RELEASED") {
      return { error: `Fund Phase ${phase.index} unlocks once Phase ${phase.index - 1} closes.` };
    }
  }

  try {
    const txHash = await chain.fundPhase(
      phase.id,
      phase.hire.clientId,
      phase.hire.workerId,
      Number(phase.amount)
    );
    await platformDb.$transaction([
      platformDb.phase.update({
        where: { id: phase.id },
        data: { status: "FUNDED", onChainEscrowAddress: ESCROW_ADDRESS },
      }),
      platformDb.contract.updateMany({
        where: { hireId: phase.hireId, onChainEscrowAddress: null },
        data: { onChainEscrowAddress: ESCROW_ADDRESS },
      }),
      platformDb.escrowTransaction.create({
        data: { phaseId: phase.id, type: "FUND", status: "CONFIRMED", amount: phase.amount, onChainTxHash: txHash },
      }),
      platformDb.notification.create({
        data: { userId: phase.hire.workerId, type: "ESCROW", title: "Escrow funded", body: `${user.name} funded "${phase.name}". You can start work.` },
      }),
    ]);
    revalidatePath(`/dashboard/client/hires/${phase.hireId}`);
    return { ok: true, message: "Escrow funded on-chain — funds are locked.", txHash };
  } catch (e) {
    console.error("fundPhase failed:", e);
    return { error: "The funding transaction failed. Please try again." };
  }
}

/** Approve a delivered phase → the contract releases the escrow to the worker. */
export async function approvePhaseAction(phaseId: string): Promise<ActionState> {
  const user = await requireRole("CLIENT");
  const phase = await loadOwnedPhase(user.id, phaseId);
  if (!phase) return { error: "Phase not found." };
  if (phase.status !== "DELIVERED" && phase.status !== "VERIFICATION_WINDOW_OPEN" && phase.status !== "FUNDED") {
    return { error: "This phase isn't ready to approve." };
  }

  try {
    const txHash = await chain.approveRelease(phase.id);
    const bal = await chain.balanceOfInr((await chain.readEscrow(phase.id)).worker);
    await platformDb.$transaction([
      platformDb.phase.update({ where: { id: phase.id }, data: { status: "RELEASED", releasedAt: new Date() } }),
      platformDb.escrowTransaction.create({
        data: { phaseId: phase.id, type: "RELEASE", status: "CONFIRMED", amount: phase.amount, onChainTxHash: txHash },
      }),
      platformDb.wallet.updateMany({ where: { userId: phase.hire.workerId }, data: { balanceCache: bal } }),
      platformDb.notification.create({
        data: { userId: phase.hire.workerId, type: "PAYMENT", title: "Payment released", body: `${phase.name} was approved — funds released to your wallet.` },
      }),
    ]);
    revalidatePath(`/dashboard/client/hires/${phase.hireId}`);
    return { ok: true, message: "Approved — funds released to the worker.", released: true, txHash };
  } catch (e) {
    console.error("approveRelease failed:", e);
    return { error: "The release transaction failed. Please try again." };
  }
}

/** Request changes: resets the verification window and bumps the revision counter. */
export async function requestChangesAction(phaseId: string): Promise<ActionState> {
  const user = await requireRole("CLIENT");
  const phase = await loadOwnedPhase(user.id, phaseId);
  if (!phase) return { error: "Phase not found." };
  if (phase.revisionCount >= 2) {
    return { error: "Revision limit reached — please file a complaint instead of requesting more changes." };
  }
  await platformDb.phase.update({
    where: { id: phase.id },
    data: { status: "IN_PROGRESS", revisionCount: { increment: 1 }, verificationDeadline: null },
  });
  revalidatePath(`/dashboard/client/hires/${phase.hireId}`);
  return { ok: true, message: `Changes requested (revision ${phase.revisionCount + 1} of 2). The window resets on redelivery.` };
}

/** Mark no-show: roll the funded phase's escrow back to the client on-chain. */
export async function markNoShowAction(hireId: string): Promise<ActionState> {
  const user = await requireRole("CLIENT");
  const hire = await platformDb.hire.findFirst({
    where: { id: hireId, clientId: user.id },
    include: { phases: { orderBy: { index: "asc" } }, deliveryStake: true },
  });
  if (!hire) return { error: "Hire not found." };
  const funded = hire.phases.find((p) => ["FUNDED", "IN_PROGRESS", "DELIVERED"].includes(p.status));
  if (!funded) return { error: "No funded phase to roll back." };

  try {
    const txHash = await chain.refundToClient(funded.id);
    await platformDb.$transaction([
      platformDb.phase.update({ where: { id: funded.id }, data: { status: "AUTO_CANCELLED" } }),
      platformDb.hire.update({ where: { id: hire.id }, data: { status: "NO_SHOW_FLAGGED" } }),
      platformDb.escrowTransaction.create({
        data: { phaseId: funded.id, type: "REFUND", status: "CONFIRMED", amount: funded.amount, onChainTxHash: txHash },
      }),
      platformDb.user.update({ where: { id: hire.workerId }, data: { strikes: { increment: 1 } } }),
    ]);
    revalidatePath(`/dashboard/client/hires/${hireId}`);
    return { ok: true, message: "Escrow rolled back to you; a strike was applied to the worker.", txHash };
  } catch (e) {
    console.error("markNoShow failed:", e);
    return { error: "The rollback transaction failed. Please try again." };
  }
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

export async function sendMessageAction(): Promise<ActionState> {
  await requireRole("CLIENT");
  console.log("TODO Phase 12: persist + deliver hire-scoped message.");
  return { message: "Messaging is fully wired in Phase 12." };
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
