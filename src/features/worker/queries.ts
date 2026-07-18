import "server-only";
import { platformDb } from "@/lib/platformDb";

/*
  All reads for the Worker dashboard, scoped to the logged-in worker's own records.
  (Money/on-chain WRITES are stubbed in actions.ts until Phase 7.)
*/

export async function getWalletChip(userId: string) {
  const wallet = await platformDb.wallet.findUnique({ where: { userId } });
  return Number(wallet?.balanceCache ?? 0);
}

export async function getWorkerDashboard(userId: string) {
  const [hires, applications, profile, recommended, notifications] = await Promise.all([
    platformDb.hire.findMany({
      where: { workerId: userId, status: { in: ["ACTIVE", "NO_SHOW_FLAGGED"] } },
      include: { job: true, client: true, phases: true },
      orderBy: { createdAt: "desc" },
    }),
    platformDb.jobApplication.count({
      where: { workerId: userId, status: { in: ["APPLIED", "UNDER_REVIEW"] } },
    }),
    platformDb.workerProfile.findUnique({ where: { userId } }),
    platformDb.job.findMany({
      where: { status: "PUBLISHED", applications: { none: { workerId: userId } } },
      include: { category: true, roleLineItems: true, client: true },
      take: 3,
      orderBy: { publishedAt: "desc" },
    }),
    platformDb.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 4,
    }),
  ]);

  const pendingEscrow = hires
    .flatMap((h) => h.phases)
    .filter((p) => ["FUNDED", "IN_PROGRESS", "DELIVERED", "VERIFICATION_WINDOW_OPEN"].includes(p.status))
    .reduce((sum, p) => sum + Number(p.amount), 0);

  return { hires, openApplications: applications, profile, recommended, notifications, pendingEscrow };
}

export async function getWorkerProfile(userId: string) {
  return platformDb.user.findUnique({
    where: { id: userId },
    include: {
      workerProfile: { include: { skills: { include: { skill: true } } } },
      reviewsReceived: { include: { hire: { include: { job: true } } }, orderBy: { createdAt: "desc" } },
    },
  });
}

export async function getPublishedJobs() {
  return platformDb.job.findMany({
    where: { status: "PUBLISHED" },
    include: { category: true, roleLineItems: true, client: { include: { clientProfile: true } } },
    orderBy: { publishedAt: "desc" },
  });
}

export async function getJobDetail(jobId: string) {
  return platformDb.job.findUnique({
    where: { id: jobId },
    include: {
      category: true,
      roleLineItems: { include: { skill: true } },
      client: { include: { clientProfile: true } },
    },
  });
}

export async function getWorkerApplications(userId: string) {
  return platformDb.jobApplication.findMany({
    where: { workerId: userId },
    include: { job: { include: { client: true } }, roleLineItem: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getWorkerHires(userId: string) {
  return platformDb.hire.findMany({
    where: { workerId: userId },
    include: { job: true, client: true, phases: { orderBy: { index: "asc" } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getWorkerHireDetail(hireId: string, userId: string) {
  const hire = await platformDb.hire.findFirst({
    where: { id: hireId, workerId: userId },
    include: {
      job: true,
      client: true,
      worker: true,
      contract: true,
      deliveryStake: true,
      phases: { orderBy: { index: "asc" }, include: { escrowTransactions: true } },
      messages: { orderBy: { sentAt: "asc" }, include: { sender: true } },
    },
  });
  return hire;
}

export async function getWorkerEarnings(userId: string) {
  const [wallet, hires] = await Promise.all([
    platformDb.wallet.findUnique({ where: { userId } }),
    platformDb.hire.findMany({
      where: { workerId: userId },
      include: {
        job: true,
        phases: { include: { escrowTransactions: true }, orderBy: { index: "asc" } },
      },
    }),
  ]);

  const phases = hires.flatMap((h) => h.phases.map((p) => ({ ...p, hireTitle: h.job.title })));
  const pending = phases.filter((p) =>
    ["FUNDED", "IN_PROGRESS", "DELIVERED", "VERIFICATION_WINDOW_OPEN"].includes(p.status)
  );
  const txs = phases
    .flatMap((p) => p.escrowTransactions.map((t) => ({ ...t, phaseName: p.name })))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const released = phases
    .filter((p) => p.status === "RELEASED")
    .reduce((s, p) => s + Number(p.amount), 0);
  const pendingTotal = pending.reduce((s, p) => s + Number(p.amount), 0);

  return { wallet, pending, txs, released, pendingTotal };
}

export async function getWorkerMessageThreads(userId: string) {
  const hires = await platformDb.hire.findMany({
    where: { workerId: userId },
    include: {
      client: true,
      job: true,
      messages: { orderBy: { sentAt: "desc" }, take: 1 },
    },
  });
  // Every hire is a possible thread (so a conversation can be started), newest activity first.
  return hires
    .map((h) => ({
      hireId: h.id,
      who: h.client.name,
      hire: h.job.title,
      last: h.messages[0]?.body ?? "No messages yet — say hello.",
      when: h.messages[0]?.sentAt ?? h.createdAt,
    }))
    .sort((a, b) => b.when.getTime() - a.when.getTime());
}

export async function getWorkerThread(hireId: string, userId: string) {
  return platformDb.hire.findFirst({
    where: { id: hireId, workerId: userId },
    include: {
      client: true,
      job: true,
      messages: { orderBy: { sentAt: "asc" }, include: { sender: true } },
    },
  });
}

export async function getWorkerReviews(userId: string) {
  return platformDb.review.findMany({
    where: { subjectId: userId, direction: "CLIENT_TO_WORKER" },
    include: { author: true, hire: { include: { job: true } } },
    orderBy: { createdAt: "desc" },
  });
}

/** Completed hires the worker hasn't yet reviewed the client on (WK-14 nudge queue). */
export async function getWorkerReviewableHires(userId: string) {
  const hires = await platformDb.hire.findMany({
    where: { workerId: userId, status: "COMPLETED" },
    include: { client: true, job: true, reviews: true },
    orderBy: { updatedAt: "desc" },
  });
  return hires
    .filter((h) => !h.reviews.some((r) => r.direction === "WORKER_TO_CLIENT"))
    .map((h) => ({ hireId: h.id, who: h.client.name, job: h.job.title }));
}

export async function getNotifications(userId: string) {
  return platformDb.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getUnreadNotificationCount(userId: string) {
  return platformDb.notification.count({ where: { userId, read: false } });
}

export async function getWorkerComplaints(userId: string) {
  return platformDb.complaint.findMany({
    where: { filedById: userId },
    include: { hire: { include: { job: true } } },
    orderBy: { createdAt: "desc" },
  });
}

/** Hires the worker can file a complaint against (for the WK-17 select). */
export async function getWorkerHireOptions(userId: string) {
  return platformDb.hire.findMany({
    where: { workerId: userId },
    include: { job: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getAllSkills() {
  return platformDb.skill.findMany({ include: { category: true }, orderBy: { name: "asc" } });
}
