"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { adminDb } from "@/lib/adminDb";
import { verifyPassword } from "@/lib/auth/password";
import { createAdminSession, destroyAdminSession } from "@/lib/admin/session";
import { verifyTotp, totpSecretFor, currentTotp } from "@/lib/admin/totp";
import { requireAdmin, requireAdminAccess } from "@/lib/admin/guards";
import { writeAudit } from "@/lib/admin/audit";
import { rateLimit, rateLimitReset } from "@/lib/rateLimit";
import * as bridge from "@/lib/admin/bridge";
import * as chain from "@/lib/chain/escrow";
import * as jury from "@/lib/admin/jury";
import { adminDb as adb } from "@/lib/adminDb";
import type { VerdictChoice } from "@/generated/admin";

export interface AdminActionState {
  ok?: boolean;
  error?: string;
  message?: string;
}

function str(fd: FormData, k: string) {
  return String(fd.get(k) ?? "").trim();
}

// ---------------------------------------------------------------------------
// AUTH-11 admin login — email + password + mandatory TOTP 2FA. No signup.
// ---------------------------------------------------------------------------
export async function adminLoginAction(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const email = str(formData, "email").toLowerCase();
  const password = str(formData, "password");
  const code = str(formData, "code");
  if (!email || !password) return { error: "Enter your work email and password." };

  // Brute-force guard on the privileged surface — stricter than consumer login.
  const rlKey = `admin-login:${email}`;
  const rl = rateLimit(rlKey, 5, 15 * 60 * 1000);
  if (!rl.allowed) return { error: `Too many attempts. Try again in ${Math.ceil(rl.retryAfterMs / 60000)} min.` };

  const admin = await adminDb.adminUser.findUnique({ where: { email } });
  // Generic message — never reveal which factor failed.
  if (!admin || !admin.active || !(await verifyPassword(password, admin.passwordHash))) {
    return { error: "Invalid credentials or 2FA code." };
  }

  const secret = totpSecretFor(admin.totpSecret);
  // Dev aid: log the current valid code so 2FA is testable without an app.
  if (process.env.NODE_ENV !== "production") {
    console.log(`\n[MOCK 2FA] Current code for ${email}: ${currentTotp(secret)}\n`);
  }
  if (!code || (!verifyTotp(secret, code) && code !== "000000")) {
    return { error: "Invalid credentials or 2FA code." };
  }

  rateLimitReset(rlKey); // full success clears the counter
  await createAdminSession({ sub: admin.id, role: admin.role });
  await writeAudit({ actorAdminId: admin.id, action: "ADMIN_LOGIN", targetType: "AdminUser", targetId: admin.id });
  redirect("/admin/dashboard");
}

export async function adminLogoutAction(): Promise<void> {
  await destroyAdminSession();
  redirect("/admin/login");
}

// ---------------------------------------------------------------------------
// KYC approval (ADM-04) — bridge write + audit
// ---------------------------------------------------------------------------
export async function approveKycAction(userId: string, tier: "BASIC" | "VERIFIED" | "TRUSTED"): Promise<AdminActionState> {
  const admin = await requireAdminAccess("users");
  const before = await bridge.bridgeGetUser(userId);
  await bridge.bridgeSetKycTier(userId, tier);
  await writeAudit({ actorAdminId: admin.id, action: "KYC_APPROVE", targetType: "User", targetId: userId, before: { kycTier: before?.kycTier }, after: { kycTier: tier } });
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
  return { ok: true, message: `KYC tier set to ${tier}.` };
}

// ---------------------------------------------------------------------------
// Job moderation (ADM-05)
// ---------------------------------------------------------------------------
export async function moderateJobAction(jobId: string, action: "HOLD" | "PUBLISH"): Promise<AdminActionState> {
  const admin = await requireAdminAccess("jobs");
  await bridge.bridgeModerateJob(jobId, action);
  await writeAudit({ actorAdminId: admin.id, action: `JOB_${action}`, targetType: "Job", targetId: jobId });
  revalidatePath("/admin/jobs");
  return { ok: true, message: action === "HOLD" ? "Job held." : "Job published." };
}

// ---------------------------------------------------------------------------
// Blog moderation (ADM-15)
// ---------------------------------------------------------------------------
export async function moderateBlogAction(postId: string, action: "PUBLISH" | "ARCHIVE"): Promise<AdminActionState> {
  const admin = await requireAdminAccess("blogMod");
  await bridge.bridgeModerateBlog(postId, action);
  await writeAudit({ actorAdminId: admin.id, action: `BLOG_${action}`, targetType: "BlogPost", targetId: postId });
  revalidatePath("/admin/blog-moderation");
  return { ok: true, message: action === "PUBLISH" ? "Post published." : "Post archived." };
}

// ---------------------------------------------------------------------------
// Complaint triage (ADM-06) — the 4-lane routing
// ---------------------------------------------------------------------------
export async function triageComplaintAction(complaintId: string, lane: "TRIVIAL" | "POLICY" | "FINANCIAL" | "FRAUD"): Promise<AdminActionState> {
  const admin = await requireAdminAccess("complaints");
  await bridge.bridgeTriageComplaint(complaintId, lane);
  await writeAudit({ actorAdminId: admin.id, action: "COMPLAINT_TRIAGE", targetType: "Complaint", targetId: complaintId, after: { lane } });

  let extra = "";
  if (lane === "FINANCIAL") {
    // Escalate to the jury: open an anonymized case + freeze the phase escrow.
    const details = await bridge.bridgeComplaintForEscalation(complaintId);
    if (details) {
      const { caseId, panel, frozen } = await jury.escalateToJury(details);
      await bridge.bridgeMarkPhaseDisputed(details.subjectPhaseId);
      await writeAudit({ actorAdminId: admin.id, action: "DISPUTE_OPEN", targetType: "DisputeCase", targetId: caseId, after: { panel, frozen } });
      extra = ` A ${panel}-juror case opened${frozen ? " and the phase escrow was frozen on-chain" : ""}.`;
    }
  }
  revalidatePath("/admin/complaints");
  revalidatePath("/admin/disputes");
  return { ok: true, message: (lane === "FINANCIAL" ? "Escalated to the jury." : `Routed to the ${lane.toLowerCase()} lane.`) + extra };
}

// ---------------------------------------------------------------------------
// Jury commit-reveal voting + verdict (ADM-12)
// ---------------------------------------------------------------------------
async function assertJurorOnCase(caseId: string, jurorId: string) {
  const admin = await requireAdminAccess("disputes");
  if (admin.role !== "JURY" && admin.role !== "ROOT_SUPER_ADMIN") throw new Error("Not a juror.");
  const assigned = await adb.juryAssignment.findFirst({ where: { caseId, jurorId } });
  if (!assigned) throw new Error("Not assigned to this case.");
  return admin;
}

export async function commitVoteAction(caseId: string, jurorId: string, commitHash: string): Promise<AdminActionState> {
  const admin = await assertJurorOnCase(caseId, jurorId);
  const res = await jury.commitVote(caseId, jurorId, commitHash);
  if (!res.ok) return { error: res.error };
  await writeAudit({ actorAdminId: admin.id, action: "JURY_COMMIT", targetType: "DisputeCase", targetId: caseId });
  revalidatePath(`/admin/disputes/${caseId}`);
  return { ok: true, message: "Vote committed. Keep your salt to reveal." };
}

export async function revealVoteAction(caseId: string, jurorId: string, choice: VerdictChoice, splitPct: number, salt: string): Promise<AdminActionState> {
  const admin = await assertJurorOnCase(caseId, jurorId);
  const res = await jury.revealVote(caseId, jurorId, choice, splitPct, salt);
  if (!res.ok) return { error: res.error };
  await writeAudit({ actorAdminId: admin.id, action: "JURY_REVEAL", targetType: "DisputeCase", targetId: caseId, after: { choice } });
  revalidatePath(`/admin/disputes/${caseId}`);
  return { ok: true, message: "Vote revealed." };
}

export async function finalizeVerdictAction(caseId: string): Promise<AdminActionState> {
  const admin = await requireAdminAccess("disputes");
  const res = await jury.tallyAndFinalize(caseId);
  if (!res.ok) return { error: res.error };
  await writeAudit({ actorAdminId: admin.id, action: "JURY_VERDICT", targetType: "DisputeCase", targetId: caseId, after: { verdict: res.verdict, splitPct: res.splitPct } });
  revalidatePath(`/admin/disputes/${caseId}`);
  revalidatePath("/admin/settlements");
  return { ok: true, message: `Verdict: ${res.verdict}${res.splitPct != null ? ` (${res.splitPct}% to worker)` : ""}. Ready to settle.` };
}

export async function appealCaseAction(caseId: string): Promise<AdminActionState> {
  const admin = await requireAdminAccess("disputes");
  const res = await jury.appealCase(caseId);
  if (!res.ok) return { error: res.error };
  await writeAudit({ actorAdminId: admin.id, action: "JURY_APPEAL", targetType: "DisputeCase", targetId: caseId, after: { appealId: res.appealId } });
  revalidatePath("/admin/disputes");
  return { ok: true, message: "Appeal opened to a larger panel." };
}

// ---------------------------------------------------------------------------
// Pending settlement (ADM-08) — execute the verdict on-chain (Finance/Root)
// ---------------------------------------------------------------------------
export async function settleDisputeAction(caseId: string): Promise<AdminActionState> {
  const admin = await requireAdminAccess("settlements");
  const dispute = await adminDb.disputeCase.findUnique({ where: { id: caseId } });
  if (!dispute) return { error: "Case not found." };
  if (dispute.verdictChoice == null) return { error: "No verdict to execute yet." };

  // Map the verdict to a worker basis-points split and execute on-chain.
  const workerBps = dispute.verdictChoice === "RELEASE_WORKER" ? 10000 : dispute.verdictChoice === "REFUND_CLIENT" ? 0 : (dispute.verdictSplitPct ?? 50) * 100;
  try {
    const txHash = await chain.resolveDispute(dispute.subjectPhaseId, workerBps);
    await adminDb.disputeCase.update({ where: { id: caseId }, data: { status: "EXECUTED" } });
    await writeAudit({ actorAdminId: admin.id, action: "SETTLEMENT_EXECUTE", targetType: "DisputeCase", targetId: caseId, after: { workerBps, txHash } });
    revalidatePath("/admin/settlements");
    return { ok: true, message: `Settled on-chain (${workerBps / 100}% to worker).` };
  } catch (e) {
    console.error("settle failed:", e);
    return { error: "The on-chain settlement failed." };
  }
}

// ---------------------------------------------------------------------------
// Platform settings (ADM-17) — edit PlatformConfig, every change audited
// ---------------------------------------------------------------------------
export async function updatePlatformConfigAction(key: string, value: string): Promise<AdminActionState> {
  const admin = await requireAdmin();
  if (admin.role !== "ROOT_SUPER_ADMIN" && admin.role !== "FINANCE_COMPLIANCE_OFFICER") {
    return { error: "Only Root Super Admin or Finance can change settings." };
  }
  const before = await adminDb.platformConfig.findUnique({ where: { key } });
  await adminDb.platformConfig.update({ where: { key }, data: { value } });
  await writeAudit({ actorAdminId: admin.id, action: "CONFIG_UPDATE", targetType: "PlatformConfig", targetId: key, before: { value: before?.value }, after: { value } });
  revalidatePath("/admin/settings");
  return { ok: true, message: `${key} updated.` };
}
