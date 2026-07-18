import "server-only";
import { platformDb } from "@/lib/platformDb";
import { getPendingConfirmations } from "@/lib/escrow/pendingConfirmations";

/** ADM-09 pending confirmations (the Phase 8 auto-release countdown data). */
export async function bridgePendingConfirmations() {
  return getPendingConfirmations();
}

/*
  THE BRIDGE SERVICE (spec 10, ADM boundary rule). This module is the ONLY place
  admin-side code touches the Platform DB. Admin screens call these functions by
  primary-key id and get back a SANITIZED result — never the raw record, never a
  cross-database join. If you find `platformDb` imported anywhere under the admin
  surface OTHER than here, that's a boundary violation.

  It exposes reads plus a small set of sanctioned writes (KYC approval, job/blog
  moderation, complaint triage) so every platform mutation from the admin side is
  funneled through here too.
*/

function maskEmail(email: string): string {
  const [n, d] = email.split("@");
  return `${n.slice(0, 2)}•••@${d ?? ""}`;
}
function maskPhone(phone: string | null): string {
  return phone ? `•••••${phone.slice(-3)}` : "—";
}

// ---- platform-wide counts for the dashboard (ADM-02) ----
export async function bridgePlatformStats() {
  const [workers, clients, jobs, hires, released, fundedPhases] = await Promise.all([
    platformDb.user.count({ where: { role: "WORKER" } }),
    platformDb.user.count({ where: { role: "CLIENT" } }),
    platformDb.job.count(),
    platformDb.hire.count(),
    platformDb.phase.findMany({ where: { status: "RELEASED" }, select: { amount: true } }),
    platformDb.phase.findMany({ where: { status: { in: ["FUNDED", "IN_PROGRESS", "DELIVERED", "VERIFICATION_WINDOW_OPEN", "DISPUTED"] } }, select: { amount: true } }),
  ]);
  return {
    workers, clients, jobs, hires,
    releasedTotal: released.reduce((s, p) => s + Number(p.amount), 0),
    escrowLocked: fundedPhases.reduce((s, p) => s + Number(p.amount), 0),
  };
}

// ---- KYC queue + user detail (ADM-03/04) ----
export async function bridgeKycQueue() {
  const users = await platformDb.user.findMany({
    where: { kycTier: { in: ["UNVERIFIED", "BASIC"] } },
    include: { workerProfile: true, clientProfile: true },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    role: u.role,
    kycTier: u.kycTier,
    emailVerified: u.emailVerified,
    phoneVerified: u.phoneVerified,
    accountType: u.clientProfile ? (u.clientProfile.clientType === "BUSINESS" ? "Business" : "Individual") : "Worker",
    createdAt: u.createdAt,
  }));
}

export async function bridgeGetUser(userId: string) {
  const u = await platformDb.user.findUnique({
    where: { id: userId },
    include: { workerProfile: { include: { skills: { include: { skill: true } } } }, clientProfile: true },
  });
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    role: u.role,
    email: maskEmail(u.email),
    phone: maskPhone(u.phone),
    kycTier: u.kycTier,
    emailVerified: u.emailVerified,
    phoneVerified: u.phoneVerified,
    strikes: u.strikes,
    suspended: u.suspended,
    createdAt: u.createdAt,
    worker: u.workerProfile
      ? { headline: u.workerProfile.headline, rating: u.workerProfile.ratingAvg, completedJobs: u.workerProfile.completedJobsCount, skills: u.workerProfile.skills.map((s) => s.skill.name) }
      : null,
    client: u.clientProfile
      ? { type: u.clientProfile.clientType, company: u.clientProfile.companyName, reliability: u.clientProfile.escrowReliabilityScore }
      : null,
  };
}

export async function bridgeSetKycTier(userId: string, tier: "BASIC" | "VERIFIED" | "TRUSTED") {
  await platformDb.user.update({ where: { id: userId }, data: { kycTier: tier } });
}

// ---- job moderation (ADM-05) ----
export async function bridgeJobs() {
  const jobs = await platformDb.job.findMany({
    where: { status: { in: ["PUBLISHED", "DRAFT"] } },
    include: { client: true, _count: { select: { applications: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return jobs.map((j) => ({ id: j.id, title: j.title, client: j.client.name, status: j.status, applicants: j._count.applications, urgent: j.urgent, createdAt: j.createdAt }));
}
export async function bridgeModerateJob(jobId: string, action: "HOLD" | "PUBLISH") {
  await platformDb.job.update({ where: { id: jobId }, data: { status: action === "HOLD" ? "CANCELLED" : "PUBLISHED" } });
}

// ---- blog moderation (ADM-15) ----
export async function bridgeBlogQueue() {
  const posts = await platformDb.blogPost.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  return posts.map((p) => ({ id: p.id, title: p.title, author: p.authorName, tag: p.tag, status: p.status, createdAt: p.createdAt }));
}
export async function bridgeModerateBlog(postId: string, action: "PUBLISH" | "ARCHIVE") {
  await platformDb.blogPost.update({ where: { id: postId }, data: { status: action === "PUBLISH" ? "PUBLISHED" : "ARCHIVED" } });
}

// ---- complaints (ADM-06) ----
export async function bridgeComplaints() {
  const complaints = await platformDb.complaint.findMany({
    where: { status: { in: ["OPEN", "TRIAGED"] } },
    include: { hire: { include: { job: true, worker: true, client: true } }, filedBy: true },
    orderBy: { createdAt: "desc" },
  });
  return complaints.map((c) => ({
    id: c.id,
    category: c.category,
    lane: c.triageLane,
    status: c.status,
    description: c.description,
    filedBy: c.filedBy.name,
    hireTitle: c.hire.job.title,
    parties: `${c.hire.client.name} vs ${c.hire.worker.name}`,
    phaseId: c.phaseId,
    createdAt: c.createdAt,
  }));
}
export async function bridgeTriageComplaint(complaintId: string, lane: "TRIVIAL" | "POLICY" | "FINANCIAL" | "FRAUD") {
  await platformDb.complaint.update({
    where: { id: complaintId },
    data: { triageLane: lane, status: lane === "FINANCIAL" ? "ESCALATED" : "TRIAGED" },
  });
}

/** Everything the jury escalation needs about a complaint — resolved by id. */
export async function bridgeComplaintForEscalation(complaintId: string) {
  const c = await platformDb.complaint.findUnique({
    where: { id: complaintId },
    include: { hire: { include: { phases: { orderBy: { index: "asc" } } } } },
  });
  if (!c) return null;
  // The disputed phase: the one referenced by the complaint, else the current active phase.
  const phase = (c.phaseId && c.hire.phases.find((p) => p.id === c.phaseId)) ||
    c.hire.phases.find((p) => ["FUNDED", "IN_PROGRESS", "DELIVERED", "VERIFICATION_WINDOW_OPEN", "DISPUTED"].includes(p.status)) ||
    c.hire.phases[0];
  if (!phase) return null;
  return {
    complaintId: c.id,
    subjectHireId: c.hireId,
    subjectPhaseId: phase.id,
    clientUserId: c.hire.clientId,
    workerUserId: c.hire.workerId,
    escrowAmountInr: Number(phase.amount),
    reason: `${c.category}: ${c.description}`.slice(0, 200),
  };
}

/** Freeze the phase in the Platform DB when a dispute opens (mirrors the on-chain freeze). */
export async function bridgeMarkPhaseDisputed(phaseId: string) {
  await platformDb.phase.updateMany({ where: { id: phaseId }, data: { status: "DISPUTED" } });
}

// ---- ongoing work (ADM-07) ----
export async function bridgeOngoing() {
  const hires = await platformDb.hire.findMany({
    where: { status: "ACTIVE" },
    include: { job: true, worker: true, client: true, phases: { orderBy: { index: "asc" } } },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
  return hires.map((h) => ({
    id: h.id,
    title: h.job.title,
    worker: h.worker.name,
    client: h.client.name,
    value: Number(h.totalValue),
    phaseStates: h.phases.map((p) => p.status),
  }));
}

// ---- released phases awaiting payout (ADM-10) ----
export async function bridgeReleasedPhases() {
  const phases = await platformDb.phase.findMany({
    where: { status: "RELEASED" },
    include: { hire: { include: { job: true, worker: true } }, escrowTransactions: true },
    orderBy: { releasedAt: "desc" },
    take: 50,
  });
  return phases.map((p) => ({
    phaseId: p.id,
    title: `${p.hire.job.title} — ${p.name}`,
    worker: p.hire.worker.name,
    amount: Number(p.amount),
    txHash: p.escrowTransactions.find((t) => t.type === "RELEASE")?.onChainTxHash ?? null,
  }));
}

// ---- single phase / hire resolution (used by settlements + dispute detail) ----
export async function bridgePhaseSummary(phaseId: string) {
  const p = await platformDb.phase.findUnique({ where: { id: phaseId }, include: { hire: { include: { job: true, worker: true, client: true } } } });
  if (!p) return null;
  return { id: p.id, name: p.name, status: p.status, amount: Number(p.amount), title: p.hire.job.title, worker: p.hire.worker.name, client: p.hire.client.name };
}
