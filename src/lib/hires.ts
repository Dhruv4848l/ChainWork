import "server-only";
import { platformDb } from "@/lib/platformDb";
import { notify } from "@/lib/notify";
import { isPhaseSettled } from "@/lib/escrow/phaseMachine";

/*
  Hire completion. A hire is COMPLETED once every one of its phases is settled —
  RELEASED, or RESOLVED by a dispute verdict (the last payment cleared). Completion
  bumps the worker's completed-jobs count and invites both parties to review each
  other (WK-14 / CL-10). Idempotent: the ACTIVE → COMPLETED write is guarded, so two
  concurrent calls (e.g. an approval and the cron tick) can't both count the job.
*/
export async function maybeCompleteHire(hireId: string): Promise<boolean> {
  const hire = await platformDb.hire.findUnique({
    where: { id: hireId },
    include: { phases: true, job: true },
  });
  if (!hire || hire.status !== "ACTIVE") return false;
  if (hire.phases.length === 0 || !hire.phases.every((p) => isPhaseSettled(p.status))) return false;

  const completed = await platformDb.$transaction(async (tx) => {
    const res = await tx.hire.updateMany({ where: { id: hireId, status: "ACTIVE" }, data: { status: "COMPLETED" } });
    if (res.count !== 1) return false; // someone else completed it first
    await tx.workerProfile.updateMany({
      where: { userId: hire.workerId },
      data: { completedJobsCount: { increment: 1 } },
    });
    return true;
  });
  if (!completed) return false;

  await Promise.all([
    notify({
      userId: hire.workerId,
      type: "SYSTEM",
      title: "Hire completed 🎉",
      body: `"${hire.job.title}" is complete. Leave the client a review.`,
      linkUrl: "/dashboard/worker/reviews",
    }),
    notify({
      userId: hire.clientId,
      type: "SYSTEM",
      title: "Hire completed 🎉",
      body: `"${hire.job.title}" is complete. Rate your worker.`,
      linkUrl: "/dashboard/client/reviews",
    }),
  ]);
  return true;
}
