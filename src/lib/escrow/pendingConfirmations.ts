import "server-only";
import { platformDb } from "@/lib/platformDb";

/*
  The data behind ADM-09 "Pending Confirmations" (Phase 10 reads this through the
  bridge service): every phase mid verification-window, with who's waiting, the
  amount held, how many reminders have fired, and the auto-release countdown.
*/
export async function getPendingConfirmations(now: Date = new Date()) {
  const phases = await platformDb.phase.findMany({
    where: { status: "VERIFICATION_WINDOW_OPEN" },
    include: { hire: { include: { client: true, worker: true, job: true } } },
    orderBy: { verificationDeadline: "asc" },
  });

  return phases.map((p) => {
    const deadline = p.verificationDeadline;
    const msLeft = deadline ? deadline.getTime() - now.getTime() : null;
    return {
      phaseId: p.id,
      hireId: p.hireId,
      title: `${p.hire.job.title} — ${p.name}`,
      client: p.hire.client.name,
      worker: p.hire.worker.name,
      amount: Number(p.amount),
      remindersSent: p.reminderCount,
      deadline,
      hoursUntilAutoRelease: msLeft == null ? null : Math.max(0, Math.round(msLeft / 3_600_000)),
      overdue: msLeft != null && msLeft <= 0,
    };
  });
}
