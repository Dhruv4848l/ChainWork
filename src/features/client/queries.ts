import "server-only";
import { platformDb } from "@/lib/platformDb";

/*
  Reads for the Client dashboard, scoped to the logged-in client's own records.
  (Escrow funding / releases are stubbed in actions.ts until Phase 7.)
*/

const FUNDED_STATES = ["FUNDED", "IN_PROGRESS", "DELIVERED", "VERIFICATION_WINDOW_OPEN", "DISPUTED"];

export async function getEscrowTotal(userId: string) {
  const hires = await platformDb.hire.findMany({
    where: { clientId: userId },
    include: { phases: true },
  });
  return hires
    .flatMap((h) => h.phases)
    .filter((p) => FUNDED_STATES.includes(p.status))
    .reduce((s, p) => s + Number(p.amount), 0);
}

export async function getClientDashboard(userId: string) {
  const [jobs, hires, applicantCount, notifications] = await Promise.all([
    platformDb.job.findMany({
      where: { clientId: userId },
      include: { _count: { select: { applications: true } }, roleLineItems: true },
    }),
    platformDb.hire.findMany({
      where: { clientId: userId, status: { in: ["ACTIVE", "NO_SHOW_FLAGGED"] } },
      include: { worker: true, job: true, phases: true, roleLineItem: true },
    }),
    platformDb.jobApplication.count({
      where: { job: { clientId: userId }, status: { in: ["APPLIED", "UNDER_REVIEW"] } },
    }),
    platformDb.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 4 }),
  ]);

  const activeJobs = jobs.filter((j) => j.status === "PUBLISHED").length;
  const escrow = hires
    .flatMap((h) => h.phases)
    .filter((p) => FUNDED_STATES.includes(p.status))
    .reduce((s, p) => s + Number(p.amount), 0);
  const released = (
    await platformDb.phase.findMany({
      where: { hire: { clientId: userId }, status: "RELEASED" },
    })
  ).reduce((s, p) => s + Number(p.amount), 0);

  return { jobs, hires, applicantCount, activeJobs, escrow, released, notifications };
}

export async function getClientProfile(userId: string) {
  return platformDb.user.findUnique({
    where: { id: userId },
    include: { clientProfile: true },
  });
}

export async function getClientJobs(userId: string) {
  return platformDb.job.findMany({
    where: { clientId: userId },
    include: {
      roleLineItems: true,
      _count: { select: { applications: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getJobApplicants(jobId: string, userId: string) {
  return platformDb.job.findFirst({
    where: { id: jobId, clientId: userId },
    include: {
      roleLineItems: {
        include: {
          applications: {
            include: { worker: { include: { workerProfile: { include: { skills: { include: { skill: true } } } } } } },
            orderBy: { createdAt: "desc" },
          },
        },
      },
    },
  });
}

export async function getApplicantsHub(userId: string) {
  return platformDb.job.findMany({
    where: { clientId: userId, status: "PUBLISHED" },
    include: {
      roleLineItems: true,
      _count: { select: { applications: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getClientHires(userId: string) {
  return platformDb.hire.findMany({
    where: { clientId: userId },
    include: { worker: true, job: true, roleLineItem: true, phases: { orderBy: { index: "asc" } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getClientHireDetail(hireId: string, userId: string) {
  return platformDb.hire.findFirst({
    where: { id: hireId, clientId: userId },
    include: {
      job: true,
      client: true,
      worker: true,
      roleLineItem: true,
      contract: true,
      deliveryStake: true,
      phases: { orderBy: { index: "asc" }, include: { escrowTransactions: true } },
    },
  });
}

export async function getClientPayments(userId: string) {
  const hires = await platformDb.hire.findMany({
    where: { clientId: userId },
    include: { job: true, phases: { include: { escrowTransactions: true }, orderBy: { index: "asc" } } },
  });
  const phases = hires.flatMap((h) => h.phases.map((p) => ({ ...p, hireTitle: h.job.title })));
  const dueToFund = phases.filter((p) => p.status === "PENDING_FUNDING");
  const funded = phases.filter((p) => FUNDED_STATES.includes(p.status));
  const released = phases.filter((p) => p.status === "RELEASED");
  const escrowTotal = funded.reduce((s, p) => s + Number(p.amount), 0);
  const releasedTotal = released.reduce((s, p) => s + Number(p.amount), 0);
  return { phases, dueToFund, escrowTotal, releasedTotal };
}

export async function getClientMessageThreads(userId: string) {
  const hires = await platformDb.hire.findMany({
    where: { clientId: userId },
    include: { worker: true, job: true, messages: { orderBy: { sentAt: "desc" }, take: 1 } },
  });
  return hires
    .filter((h) => h.messages.length > 0)
    .map((h) => ({
      hireId: h.id,
      who: h.worker.name,
      hire: h.job.title,
      last: h.messages[0]?.body ?? "",
      when: h.messages[0]?.sentAt ?? h.createdAt,
    }));
}

export async function getClientThread(hireId: string, userId: string) {
  return platformDb.hire.findFirst({
    where: { id: hireId, clientId: userId },
    include: { worker: true, job: true, messages: { orderBy: { sentAt: "asc" }, include: { sender: true } } },
  });
}

export async function getClientReviews(userId: string) {
  return platformDb.review.findMany({
    where: { subjectId: userId, direction: "WORKER_TO_CLIENT" },
    include: { author: true, hire: { include: { job: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getNotifications(userId: string) {
  return platformDb.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
}

export async function getClientComplaints(userId: string) {
  return platformDb.complaint.findMany({
    where: { filedById: userId },
    include: { hire: { include: { job: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getClientHireOptions(userId: string) {
  return platformDb.hire.findMany({
    where: { clientId: userId },
    include: { job: true, worker: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getCategoriesWithSkills() {
  return platformDb.category.findMany({
    include: { skills: { orderBy: { name: "asc" } } },
    orderBy: { name: "asc" },
  });
}
