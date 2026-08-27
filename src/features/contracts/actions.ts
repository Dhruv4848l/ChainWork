"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { platformDb } from "@/lib/platformDb";
import { requireRole, requireUser } from "@/lib/auth/guards";
import { notify } from "@/lib/notify";
import { getHireForContract, docInputFromHire } from "./queries";
import { contractHash } from "./contractText";

/*
  Hiring with a milestone plan, and the two-sided digital signature that has to
  happen before any money can be locked.

  Flow: client accepts an applicant → builds the milestone plan (the payment
  schedule) → a Hire + an UNSIGNED Contract + one Phase per milestone are created →
  both parties read the same generated document and sign it by typing their full
  legal name → only then does `fundPhaseAction` allow escrow to be funded.
*/

export interface ContractActionState {
  ok?: boolean;
  error?: string;
  message?: string;
  bothSigned?: boolean;
}

export interface MilestoneInput {
  name: string;
  amount: number;
  dueDate?: string | null;
}

const MIN_PHASES = 2;
const MAX_PHASES = 8;

/** Client's network address, for the signature record. Best-effort behind proxies. */
async function signerIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  return (fwd?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim();
}

function normalizeName(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Accept an applicant WITH a milestone plan (replaces the old single-phase hire).
// ---------------------------------------------------------------------------
export async function createHireWithMilestonesAction(
  applicationId: string,
  milestonesJson: string
): Promise<ContractActionState> {
  const user = await requireRole("CLIENT");

  const app = await platformDb.jobApplication.findUnique({
    where: { id: applicationId },
    include: { job: true, roleLineItem: true, worker: true },
  });
  if (!app || app.job.clientId !== user.id) return { error: "Application not found." };
  if (app.status === "HIRED") return { error: "This applicant is already hired." };

  const total = round2(Number(app.proposedRate ?? app.roleLineItem.perPersonRate));

  let milestones: MilestoneInput[];
  try {
    milestones = JSON.parse(milestonesJson) as MilestoneInput[];
  } catch {
    return { error: "Could not read the milestone plan." };
  }

  // ---- validate the plan -------------------------------------------------
  if (!Array.isArray(milestones) || milestones.length < MIN_PHASES)
    return { error: `A phase contract needs at least ${MIN_PHASES} phases.` };
  if (milestones.length > MAX_PHASES)
    return { error: `Keep it to ${MAX_PHASES} phases or fewer.` };
  if (milestones.some((m) => !m.name?.trim()))
    return { error: "Give every phase a name — the worker is signing up to these." };
  if (milestones.some((m) => !Number.isFinite(m.amount) || m.amount <= 0))
    return { error: "Every phase needs an amount above zero." };

  const sum = round2(milestones.reduce((s, m) => s + Number(m.amount), 0));
  if (sum !== total)
    return { error: `The phases add up to ₹${sum.toLocaleString("en-IN")} but the agreed total is ₹${total.toLocaleString("en-IN")}.` };

  // ---- create the hire, the unsigned contract, and one phase per milestone ----
  const hire = await platformDb.hire.create({
    data: {
      jobId: app.jobId,
      roleLineItemId: app.roleLineItemId,
      clientId: user.id,
      workerId: app.workerId,
      status: "ACTIVE",
      totalValue: total,
      contract: {
        create: {
          totalValue: total,
          startDate: app.job.startDate,
          endDate: app.job.endDate,
          scope: app.job.description,
          cancellationTerms:
            "Either party may cancel before the first phase is funded at no cost. After funding, an unstarted phase is cancelled by mutual settlement or by jury verdict; a 10% platform penalty applies to the cancelling party on pre-work cancellation.",
          // UNSIGNED on purpose — escrow stays locked out until both sign.
          acceptedByClient: false,
          acceptedByWorker: false,
        },
      },
      phases: {
        create: milestones.map((m, i) => ({
          index: i + 1,
          name: m.name.trim(),
          amount: round2(Number(m.amount)),
          dueDate: m.dueDate ? new Date(m.dueDate) : app.job.endDate,
          status: "PENDING_FUNDING" as const,
        })),
      },
    },
  });

  await platformDb.$transaction([
    platformDb.jobApplication.update({ where: { id: applicationId }, data: { status: "HIRED" } }),
    platformDb.jobRoleLineItem.update({
      where: { id: app.roleLineItemId },
      data: { hiredCount: { increment: 1 } },
    }),
  ]);

  await notify({
    userId: app.workerId,
    type: "APPLICATION",
    title: "You've been hired — contract ready to sign",
    body: `${user.name} hired you for "${app.job.title}" across ${milestones.length} phases. Read and sign the contract to start.`,
    linkUrl: `/dashboard/worker/hires/${hire.id}/contract`,
  });

  redirect(`/dashboard/client/hires/${hire.id}/contract`);
}

// ---------------------------------------------------------------------------
// Sign the contract (either side).
// ---------------------------------------------------------------------------
export async function signContractAction(
  hireId: string,
  typedName: string
): Promise<ContractActionState> {
  const user = await requireUser();
  const hire = await getHireForContract(hireId, user.id);
  if (!hire || !hire.contract) return { error: "Contract not found." };

  const side: "client" | "worker" | null =
    hire.clientId === user.id ? "client" : hire.workerId === user.id ? "worker" : null;
  if (!side) return { error: "You're not a party to this contract." };

  const already = side === "client" ? hire.contract.clientSignature : hire.contract.workerSignature;
  if (already) return { error: "You've already signed this contract." };

  // The signature IS the typed legal name — it has to match the account name.
  if (!typedName.trim()) return { error: "Type your full name to sign." };
  if (normalizeName(typedName) !== normalizeName(user.name)) {
    return { error: `Type your full name exactly as it appears on your account: "${user.name}".` };
  }

  // Bind the signature to the exact document. The first signer fixes the hash;
  // the second signer's hash must still match, or the terms moved underneath them.
  const hash = contractHash(docInputFromHire(hire));
  const storedHash = hire.contract.documentHash;
  if (storedHash && storedHash !== hash) {
    return {
      error:
        "The contract text changed after the first signature. Both parties must review and sign again.",
    };
  }

  const now = new Date();
  const ip = await signerIp();
  const otherSigned =
    side === "client" ? Boolean(hire.contract.workerSignature) : Boolean(hire.contract.clientSignature);

  await platformDb.contract.update({
    where: { id: hire.contract.id },
    data: {
      documentHash: hash,
      ...(side === "client"
        ? {
            clientSignature: typedName.trim(),
            clientSignedAt: now,
            clientSignedIp: ip,
            acceptedByClient: true,
          }
        : {
            workerSignature: typedName.trim(),
            workerSignedAt: now,
            workerSignedIp: ip,
            acceptedByWorker: true,
          }),
      ...(otherSigned ? { acceptedAt: now } : {}),
    },
  });

  const counterpartyId = side === "client" ? hire.workerId : hire.clientId;
  await notify({
    userId: counterpartyId,
    type: "SYSTEM",
    title: otherSigned ? "Contract fully signed" : "Contract signed — your signature is next",
    body: otherSigned
      ? `Both parties have signed "${hire.job.title}". Phase 1 escrow can now be funded.`
      : `${user.name} signed the contract for "${hire.job.title}". Review the terms and add your signature.`,
    linkUrl:
      side === "client"
        ? `/dashboard/worker/hires/${hire.id}/contract`
        : `/dashboard/client/hires/${hire.id}/contract`,
  });

  revalidatePath(`/dashboard/client/hires/${hire.id}`);
  revalidatePath(`/dashboard/client/hires/${hire.id}/contract`);
  revalidatePath(`/dashboard/worker/hires/${hire.id}`);
  revalidatePath(`/dashboard/worker/hires/${hire.id}/contract`);

  return {
    ok: true,
    bothSigned: otherSigned,
    message: otherSigned
      ? "Signed. Both parties are on the contract — Phase 1 escrow is now unlocked for funding."
      : "Signed. Waiting on the other party's signature before escrow can be funded.",
  };
}
