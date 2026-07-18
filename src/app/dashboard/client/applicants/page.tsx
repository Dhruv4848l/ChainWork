import Link from "next/link";
import { Card } from "@/components/ui";
import { PageTitle, EmptyState } from "@/features/shared/dashboard-ui";
import { requireRole } from "@/lib/auth/guards";
import { getApplicantsHub } from "@/features/client/queries";

/*
  CL-05 hub — the client's published jobs with applicant counts, each linking to
  that job's applicant review.
*/
export default async function ApplicantsHubPage() {
  const user = await requireRole("CLIENT");
  const jobs = await getApplicantsHub(user.id);

  if (jobs.length === 0) {
    return (
      <div>
        <PageTitle>Applicants</PageTitle>
        <EmptyState
          title="No open jobs"
          hint="Publish a job and applicants will show up here to review."
          action={<Link href="/dashboard/client/post-job" className="text-sm font-semibold text-bronze hover:underline">Post a job →</Link>}
        />
      </div>
    );
  }

  return (
    <div>
      <PageTitle>Applicants</PageTitle>
      <div className="flex flex-col gap-3">
        {jobs.map((j) => (
          <Link
            key={j.id}
            href={`/dashboard/client/jobs/${j.id}/applicants`}
            className="flex items-center justify-between rounded-2xl border border-line bg-card px-6 py-5 hover:border-bronze/40"
          >
            <div>
              <div className="text-base font-semibold text-ink">{j.title}</div>
              <div className="mt-0.5 text-[12.5px] text-ink3">{j.roleLineItems.length} role(s)</div>
            </div>
            <div className="text-right">
              <div className="text-lg font-semibold text-bronze">{j._count.applications}</div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-ink3">applicants</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
