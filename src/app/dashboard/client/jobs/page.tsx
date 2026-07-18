import Link from "next/link";
import { Button, Card, StatusBadge } from "@/components/ui";
import { PageTitle, EmptyState } from "@/features/shared/dashboard-ui";
import { jobStatusDisplay } from "@/features/shared/status";
import { requireRole } from "@/lib/auth/guards";
import { getClientJobs } from "@/features/client/queries";
import { formatInr, shortDate } from "@/lib/format";

export default async function MyJobsPage() {
  const user = await requireRole("CLIENT");
  const jobs = await getClientJobs(user.id);

  const postBtn = (
    <Link href="/dashboard/client/post-job">
      <Button variant="primary" size="sm">Post a Job</Button>
    </Link>
  );

  if (jobs.length === 0) {
    return (
      <div>
        <PageTitle action={postBtn}>My Jobs</PageTitle>
        <EmptyState title="No jobs posted yet" hint="Post a job to start hiring — one post can hire a whole crew." action={postBtn} />
      </div>
    );
  }

  return (
    <div>
      <PageTitle action={postBtn}>My Jobs</PageTitle>
      <Card className="overflow-hidden p-0">
        <div className="grid grid-cols-[2.2fr_1fr_1fr_1.1fr] gap-3 border-b border-line px-6 py-3.5 text-[10.5px] font-semibold uppercase tracking-wider text-ink3">
          <span>Job</span><span>Applicants</span><span>Total budget</span><span>Status</span>
        </div>
        {jobs.map((j) => {
          const d = jobStatusDisplay(j.status);
          const budget = j.roleLineItems.reduce((s, r) => s + Number(r.perPersonRate) * r.headcount, 0);
          return (
            <Link
              key={j.id}
              href={`/dashboard/client/jobs/${j.id}/applicants`}
              className="grid grid-cols-[2.2fr_1fr_1fr_1.1fr] items-center gap-3 border-b border-hair px-6 py-3.5 last:border-b-0 hover:bg-bronze/[0.04]"
            >
              <span>
                <span className="block text-[13.5px] font-medium text-ink">{j.title}</span>
                <span className="block text-[11.5px] text-ink3">{j.roleLineItems.length} role(s) · posted {shortDate(j.publishedAt ?? j.createdAt)}</span>
              </span>
              <span className="text-[12.5px] text-ink2">{j._count.applications}</span>
              <span className="text-[12.5px] text-ink2">{formatInr(budget)}</span>
              <span><StatusBadge tone={d.tone}>{d.label}</StatusBadge></span>
            </Link>
          );
        })}
      </Card>
    </div>
  );
}
