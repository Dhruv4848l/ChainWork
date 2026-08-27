import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/guards";
import { platformDb } from "@/lib/platformDb";
import { MilestonePlanBuilder } from "@/features/contracts/MilestonePlanBuilder";

/*
  CL-05a — the step between "Accept" and a live hire: the client turns the agreed
  total into a phase-by-phase payment schedule. Accepting an applicant no longer
  silently creates a one-phase hire; the payment plan is an explicit, reviewable
  decision because the worker signs it.
*/

/** Sensible starting phase names, by the shape of the work. The client rewrites them. */
function suggestPhases(jobTitle: string, roleName: string): string[] {
  const t = `${jobTitle} ${roleName}`.toLowerCase();
  const software =
    /app|android|ios|mobile|web|site|software|develop|api|backend|frontend|ui\/ux|design/.test(t);
  if (software) {
    return [
      "Requirements, wireframes & project setup",
      "Core screens & navigation",
      "Backend integration & data layer",
      "Payments, notifications & polish",
      "Testing, Play Store release & handover",
    ];
  }
  return ["Site prep & materials", "Main work — stage 1", "Main work — stage 2", "Finishing & handover"];
}

function iso(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

export default async function OfferPage({
  params,
}: {
  params: Promise<{ applicationId: string }>;
}) {
  const user = await requireRole("CLIENT");
  const { applicationId } = await params;

  const app = await platformDb.jobApplication.findUnique({
    where: { id: applicationId },
    include: { job: true, roleLineItem: true, worker: { include: { workerProfile: true } } },
  });
  if (!app || app.job.clientId !== user.id) notFound();

  const total = Number(app.proposedRate ?? app.roleLineItem.perPersonRate);

  return (
    <div>
      <Link
        href={`/dashboard/client/jobs/${app.jobId}/applicants`}
        className="mb-3.5 inline-block text-[12.5px] font-semibold uppercase tracking-wider text-bronze hover:underline"
      >
        ← Applicants
      </Link>
      <h1 className="mb-1 text-[26px] font-semibold text-ink">Build the payment schedule</h1>
      <p className="mb-5 text-[13px] text-ink3">
        Step 1 of 3 — schedule · contract · signatures. Escrow funding unlocks after both
        parties sign.
      </p>

      <MilestonePlanBuilder
        applicationId={app.id}
        workerName={app.worker.name}
        jobTitle={app.job.title}
        total={total}
        startDate={iso(app.job.startDate)}
        endDate={iso(app.job.endDate)}
        suggested={suggestPhases(app.job.title, app.roleLineItem.roleName)}
      />
    </div>
  );
}
