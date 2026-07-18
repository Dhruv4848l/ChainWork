"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { platformDb } from "@/lib/platformDb";
import { requireRole } from "@/lib/auth/guards";

export interface ActionState {
  ok?: boolean;
  error?: string;
  message?: string;
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
// STUBS — money / on-chain actions wired in Phase 7. Never fake success.
// ---------------------------------------------------------------------------
export async function fundPhaseAction(phaseId: string): Promise<ActionState> {
  await requireRole("CLIENT");
  console.log(`TODO Phase 7: fund phase ${phaseId} on-chain (lock escrow). KYC gate applies.`);
  return { message: "Escrow funding is wired to the contract in Phase 7 (behind the KYC gate)." };
}

export async function approvePhaseAction(phaseId: string): Promise<ActionState> {
  await requireRole("CLIENT");
  console.log(`TODO Phase 7: approve + release phase ${phaseId} to the worker on-chain.`);
  return { message: "Approve & Release is wired to the contract in Phase 7." };
}

export async function requestChangesAction(phaseId: string): Promise<ActionState> {
  await requireRole("CLIENT");
  console.log(`TODO Phase 7: request changes on phase ${phaseId} (reset verification window, Rev++).`);
  return { message: "Request Changes resets the verification window in Phase 7." };
}

export async function markNoShowAction(hireId: string): Promise<ActionState> {
  await requireRole("CLIENT");
  console.log(`TODO Phase 8: mark no-show for hire ${hireId} (opens contest window).`);
  return { message: "No-show handling arrives with the timing engine in Phase 8." };
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

export async function submitComplaintAction(): Promise<ActionState> {
  await requireRole("CLIENT");
  console.log("TODO Phase 11: file complaint -> triage -> jury pipeline.");
  return { message: "Complaint filing routes into the jury pipeline in Phase 11." };
}
