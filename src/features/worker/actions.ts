"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { platformDb } from "@/lib/platformDb";
import { requireRole } from "@/lib/auth/guards";
import * as chain from "@/lib/chain/escrow";
import { getPlatformSettings } from "@/lib/config/platformConfig";
import { addBusinessDays } from "@/lib/calendar/businessDays";

/** The verification deadline: N working days out, skipping weekends + holidays. */
async function verificationDeadline(): Promise<Date> {
  const settings = await getPlatformSettings();
  return addBusinessDays(new Date(), settings.verificationWindowWorkingDays, new Set(settings.holidays));
}

export interface ActionState {
  ok?: boolean;
  error?: string;
  message?: string;
}

function str(fd: FormData, key: string) {
  return String(fd.get(key) ?? "").trim();
}

// ---------------------------------------------------------------------------
// REAL: Edit profile (WK-03) — saves every field WK-02 displays.
// ---------------------------------------------------------------------------
export async function saveWorkerProfileAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireRole("WORKER");

  const name = str(formData, "name");
  const headline = str(formData, "headline");
  const bio = str(formData, "bio");
  const location = str(formData, "location");
  const experienceYears = parseInt(str(formData, "experienceYears") || "0", 10);
  const availability = str(formData, "availability");
  const languages = str(formData, "languages").split(",").map((s) => s.trim()).filter(Boolean);

  // Skills submitted as `skill:<skillId>:<proficiency>` repeated values.
  const skillEntries = formData
    .getAll("skill")
    .map(String)
    .map((v) => v.split(":"))
    .filter((parts) => parts.length === 2);

  await platformDb.$transaction([
    platformDb.user.update({ where: { id: user.id }, data: { name: name || user.name } }),
    platformDb.workerProfile.update({
      where: { userId: user.id },
      data: {
        headline: headline || null,
        bio: bio || null,
        location: location || null,
        experienceYears: Number.isFinite(experienceYears) ? experienceYears : 0,
        availability: availability || null,
        languages,
        skills: {
          deleteMany: {},
          create: skillEntries.map(([skillId, proficiency]) => ({
            skillId,
            proficiency: proficiency as never,
          })),
        },
      },
    }),
  ]);

  revalidatePath("/dashboard/worker/profile");
  redirect("/dashboard/worker/profile");
}

// ---------------------------------------------------------------------------
// REAL: Apply to a job (WK-05) — creates a JobApplication (not a money action).
// Enables the end-to-end loop verified in Phase 5.
// ---------------------------------------------------------------------------
export async function applyToJobAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireRole("WORKER");
  const jobId = str(formData, "jobId");
  const roleLineItemId = str(formData, "roleLineItemId");
  const coverNote = str(formData, "coverNote");
  const proposedRate = str(formData, "proposedRate");

  if (!jobId || !roleLineItemId) return { error: "Missing job details." };

  const existing = await platformDb.jobApplication.findFirst({
    where: { roleLineItemId, workerId: user.id },
  });
  if (existing) return { error: "You've already applied to this role." };

  const rateNum = Number(proposedRate.replace(/[^\d.]/g, ""));
  await platformDb.jobApplication.create({
    data: {
      jobId,
      roleLineItemId,
      workerId: user.id,
      status: "APPLIED",
      coverNote: coverNote || null,
      proposedRate: Number.isFinite(rateNum) && rateNum > 0 ? rateNum : null,
    },
  });

  revalidatePath("/dashboard/worker/applications");
  redirect("/dashboard/worker/applications");
}

// ---------------------------------------------------------------------------
// STUBS — money / on-chain / cross-cutting actions wired in later phases.
// These NEVER fake success; they record intent and tell the caller which phase
// will implement them.
// ---------------------------------------------------------------------------
export async function markPhaseDeliveredAction(phaseId: string): Promise<ActionState> {
  const user = await requireRole("WORKER");
  const phase = await platformDb.phase.findUnique({
    where: { id: phaseId },
    include: { hire: true },
  });
  if (!phase || phase.hire.workerId !== user.id) return { error: "Phase not found." };
  if (!["FUNDED", "IN_PROGRESS"].includes(phase.status)) {
    return { error: "This phase isn't ready to deliver." };
  }

  const deadline = await verificationDeadline();
  try {
    // On-chain: mark delivered only if the escrow is still FUNDED (first delivery).
    // After a Request Changes round the on-chain phase is already DELIVERED, so we
    // just reset the off-chain window on redelivery.
    const onchain = await chain.readEscrow(phase.id);
    if (onchain.status === "FUNDED") {
      await chain.markDelivered(phase.id, Math.floor(deadline.getTime() / 1000));
    }
    await platformDb.$transaction([
      platformDb.phase.update({
        where: { id: phase.id },
        // reminderCount resets so the verification-window reminders start fresh.
        data: { status: "VERIFICATION_WINDOW_OPEN", deliveredAt: new Date(), verificationDeadline: deadline, reminderCount: 0 },
      }),
      platformDb.notification.create({
        data: { userId: phase.hire.clientId, type: "ESCROW", title: "Phase delivered", body: `"${phase.name}" was delivered — approve or request changes before the window closes.` },
      }),
    ]);
    revalidatePath(`/dashboard/worker/hires/${phase.hireId}`);
    return { ok: true, message: "Marked delivered — the client's verification window is now open." };
  } catch (e) {
    console.error("markDelivered failed:", e);
    return { error: "The delivery transaction failed. Please try again." };
  }
}

export async function withdrawAction(): Promise<ActionState> {
  await requireRole("WORKER");
  console.log("TODO Phase 9: withdraw custodial balance to bank/UPI (off-ramp).");
  return { message: "Withdrawals are wired to the wallet layer in Phase 9." };
}

export async function checkInAction(hireId: string): Promise<ActionState> {
  await requireRole("WORKER");
  console.log(`TODO Phase 8: QR on-site check-in for hire ${hireId}.`);
  return { message: "On-site check-in arrives with the timing engine in Phase 8." };
}

export async function sendMessageAction(): Promise<ActionState> {
  await requireRole("WORKER");
  console.log("TODO Phase 12: persist + deliver hire-scoped message.");
  return { message: "Messaging is fully wired in Phase 12." };
}

export async function submitComplaintAction(): Promise<ActionState> {
  await requireRole("WORKER");
  console.log("TODO Phase 11: file complaint -> triage -> jury pipeline.");
  return { message: "Complaint filing routes into the jury pipeline in Phase 11." };
}
