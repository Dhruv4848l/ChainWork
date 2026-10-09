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
import * as jury from "@/lib/admin/jury";
import { adminDb as adb } from "@/lib/adminDb";
import type { AdminUser, VerdictChoice } from "@/generated/admin";

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

  // No bypass code and, in production, no shared fallback secret: an admin without an
  // enrolled authenticator can't log in (scripts/rotate-admin-credentials.mts enrols them).
  const secret = totpSecretFor(admin.totpSecret);
  // Dev aid: log the current valid code so 2FA is testable without an app.
  if (secret && process.env.NODE_ENV !== "production") {
    console.log(`\n[MOCK 2FA] Current code for ${email}: ${currentTotp(secret)}\n`);
  }
  if (!secret || !code || !verifyTotp(secret, code)) {
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
      const { caseId, panel, target, frozen, draw } = await jury.escalateToJury(details);
      await bridge.bridgeMarkPhaseDisputed(details.subjectPhaseId);
      // The seed + eligible list let anyone recompute the draw (voting.drawPanel).
      await writeAudit({ actorAdminId: admin.id, action: "DISPUTE_OPEN", targetType: "DisputeCase", targetId: caseId, after: { panel, target, frozen, drawSeed: draw.seed, eligible: draw.eligible, drawn: draw.drawn } });
      extra = ` A ${panel}-juror case opened${frozen ? " and the phase escrow was frozen on-chain" : ""}.`;
      if (panel < target) extra += ` Only ${panel} of ${target} jurors were available; the jury timer adds more as they become eligible.`;
    }
  }
  revalidatePath("/admin/complaints");
  revalidatePath("/admin/disputes");
  return { ok: true, message: (lane === "FINANCIAL" ? "Escalated to the jury." : `Routed to the ${lane.toLowerCase()} lane.`) + extra };
}

// ---------------------------------------------------------------------------
// Jury commit-reveal voting + verdict (ADM-12)
//
// A juror votes only as THEMSELVES: the juror is the JurorProfile linked to the
// logged-in console user (JurorProfile.adminUserId). The browser never names a juror.
// ---------------------------------------------------------------------------
async function currentJuror(): Promise<{ admin: AdminUser; jurorId: string } | { error: string }> {
  const admin = await requireAdminAccess("disputes");
  const juror = await jury.jurorForAdmin(admin.id);
  if (!juror) return { error: "Your console login isn't linked to a juror profile, so you can't vote." };
  return { admin, jurorId: juror.id };
}

export async function commitVoteAction(caseId: string, commitHash: string): Promise<AdminActionState> {
  const who = await currentJuror();
  if ("error" in who) return { error: who.error };
  const res = await jury.commitVote(caseId, who.jurorId, commitHash);
  if (!res.ok) return { error: res.error };
  await writeAudit({ actorAdminId: who.admin.id, action: "JURY_COMMIT", targetType: "DisputeCase", targetId: caseId, after: { jurorId: who.jurorId } });
  revalidatePath(`/admin/disputes/${caseId}`);
  return { ok: true, message: "Vote committed. Keep your vote receipt — you need it to reveal." };
}

export async function revealVoteAction(caseId: string, choice: VerdictChoice, splitPct: number, salt: string): Promise<AdminActionState> {
  const who = await currentJuror();
  if ("error" in who) return { error: who.error };
  const res = await jury.revealVote(caseId, who.jurorId, choice, splitPct, salt);
  if (!res.ok) return { error: res.error };
  await writeAudit({ actorAdminId: who.admin.id, action: "JURY_REVEAL", targetType: "DisputeCase", targetId: caseId, after: { jurorId: who.jurorId, choice } });
  revalidatePath(`/admin/disputes/${caseId}`);
  return { ok: true, message: "Vote revealed." };
}

/** Root, or a juror on this case's panel, may finalize once the rules allow it. */
export async function finalizeVerdictAction(caseId: string): Promise<AdminActionState> {
  const admin = await requireAdminAccess("disputes");
  if (admin.role === "JURY") {
    const juror = await jury.jurorForAdmin(admin.id);
    const seated = juror && (await adb.juryAssignment.findFirst({ where: { caseId, jurorId: juror.id, removedAt: null } }));
    if (!seated) return { error: "Only a juror on this panel can finalize it." };
  }
  const res = await jury.tallyAndFinalize(caseId);
  if (!res.ok) return { error: res.error };
  await writeAudit({ actorAdminId: admin.id, action: "JURY_VERDICT", targetType: "DisputeCase", targetId: caseId, after: { verdict: res.verdict, splitPct: res.splitPct, slashedNonRevealers: res.slashedNonRevealers } });
  revalidatePath(`/admin/disputes/${caseId}`);
  revalidatePath("/admin/settlements");
  return { ok: true, message: `Verdict: ${res.verdict}${res.splitPct != null ? ` (${res.splitPct}% to worker)` : ""}. Ready to settle.` };
}

export async function appealCaseAction(caseId: string): Promise<AdminActionState> {
  const admin = await requireAdminAccess("disputes");
  // Jurors decide cases; they don't send their own verdicts to appeal.
  if (admin.role === "JURY") return { error: "Jurors can't open an appeal." };
  const res = await jury.appealCase(caseId);
  if (!res.ok) return { error: res.error };
  await writeAudit({ actorAdminId: admin.id, action: "JURY_APPEAL", targetType: "DisputeCase", targetId: caseId, after: { appealId: res.appealId, panel: res.panel, target: res.target, drawSeed: res.draw.seed, eligible: res.draw.eligible, drawn: res.draw.drawn } });
  revalidatePath("/admin/disputes");
  revalidatePath(`/admin/disputes/${caseId}`);
  revalidatePath("/admin/settlements");
  const short = res.panel < res.target ? ` Only ${res.panel} of ${res.target} jurors were available.` : "";
  return { ok: true, message: `Appeal opened to a ${res.panel}-juror panel.${short}` };
}

// ---------------------------------------------------------------------------
// Pending settlement (ADM-08) — execute the verdict on-chain (Finance/Root)
// ---------------------------------------------------------------------------
export async function settleDisputeAction(caseId: string): Promise<AdminActionState> {
  const admin = await requireAdminAccess("settlements");
  // Claim VERDICT → EXECUTED first: a second click (or a second admin) is refused here,
  // and an APPEALED case never gets this far.
  const claim = await jury.claimSettlement(caseId);
  if (!claim.ok) return { error: claim.error };
  const dispute = claim.dispute;

  // Map the verdict to a worker basis-points split and execute it through the payment
  // service (via the bridge — the admin surface never touches the platform DB itself).
  const workerBps = dispute.verdictChoice === "RELEASE_WORKER" ? 10000 : dispute.verdictChoice === "REFUND_CLIENT" ? 0 : (dispute.verdictSplitPct ?? 50) * 100;
  let res: Awaited<ReturnType<typeof bridge.bridgeExecuteVerdictSplit>>;
  try {
    res = await bridge.bridgeExecuteVerdictSplit(dispute.subjectPhaseId, workerBps);
  } catch (e) {
    await jury.releaseSettlementClaim(caseId);
    throw e;
  }
  if (!res.ok) {
    await jury.releaseSettlementClaim(caseId);
    await writeAudit({ actorAdminId: admin.id, action: "SETTLEMENT_FAILED", targetType: "DisputeCase", targetId: caseId, after: { workerBps, paymentId: res.paymentId, code: res.code } });
    return { error: `The settlement failed: ${res.reason}` };
  }
  await writeAudit({ actorAdminId: admin.id, action: "SETTLEMENT_EXECUTE", targetType: "DisputeCase", targetId: caseId, after: { workerBps, txHash: res.txHash, paymentId: res.paymentId } });
  revalidatePath("/admin/settlements");
  return { ok: true, message: `Settled (${workerBps / 100}% to worker).` };
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

// ---------------------------------------------------------------------------
// ADM-10 flagged wallet payments — an admin records how a refused funding was handled
// ---------------------------------------------------------------------------
export async function reviewFlagAction(flagId: string, note: string): Promise<AdminActionState> {
  const admin = await requireAdminAccess("payments");
  const text = note.trim();
  if (text.length < 5) return { error: "Write a short note on what was done (at least 5 characters)." };
  if (text.length > 1000) return { error: "Keep the note under 1,000 characters." };
  const closed = await bridge.bridgeReviewFlag(flagId, text, `${admin.name} (${admin.role})`);
  if (!closed) return { error: "This flag was already reviewed." };
  await writeAudit({ actorAdminId: admin.id, action: "FLAG_REVIEWED", targetType: "FlaggedEscrow", targetId: flagId, after: { note: text } });
  revalidatePath("/admin/payments");
  return { ok: true, message: "Marked reviewed." };
}

export async function refundFlagAction(flagId: string): Promise<AdminActionState> {
  const admin = await requireAdminAccess("payments");
  const r = await bridge.bridgeRefundFlag(flagId, `${admin.name} (${admin.role})`);
  if (!r.ok) return { error: r.error };
  await writeAudit({ actorAdminId: admin.id, action: "FLAG_REFUNDED", targetType: "FlaggedEscrow", targetId: flagId, after: { receiptNo: r.receiptNo } });
  revalidatePath("/admin/payments");
  return { ok: true, message: `${r.message} Receipt ${r.receiptNo ?? "—"}.` };
}

