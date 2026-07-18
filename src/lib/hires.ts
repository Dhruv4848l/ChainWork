import "server-only";
import { platformDb } from "@/lib/platformDb";
import { notify } from "@/lib/notify";

/*
  Hire completion. A hire is COMPLETED once every one of its phases has RELEASED
  (the last payment cleared). Completion bumps the worker's completed-jobs count and
  invites both parties to review each other (WK-14 / CL-10). Idempotent: it only acts
  on the ACTIVE → COMPLETED transition, so calling it repeatedly is safe.
*/
export async function maybeCompleteHire(hireId: string): Promise<boolean> {
  const hire = await platformDb.hire.findUnique({
    where: { id: hireId },
    include: { phases: true, job: true },
  });
  if (!hire || hire.status !== "ACTIVE") return false;
  if (hire.phases.length === 0 || !hire.phases.every((p) => p.status === "RELEASED")) return false;

  await platformDb.$transaction([
    platformDb.hire.update({ where: { id: hireId }, data: { status: "COMPLETED" } }),
    platformDb.workerProfile.updateMany({
      where: { userId: hire.workerId },
      data: { completedJobsCount: { increment: 1 } },
    }),
  ]);

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
