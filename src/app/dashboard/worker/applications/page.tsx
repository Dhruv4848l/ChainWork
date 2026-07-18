import Link from "next/link";
import { Card, StatusBadge } from "@/components/ui";
import { PageTitle, EmptyState } from "@/features/shared/dashboard-ui";
import { applicationStatusDisplay } from "@/features/shared/status";
import { requireRole } from "@/lib/auth/guards";
import { getWorkerApplications } from "@/features/worker/queries";
import { formatInr, shortDate } from "@/lib/format";

export default async function ApplicationsPage() {
  const user = await requireRole("WORKER");
  const apps = await getWorkerApplications(user.id);

  if (apps.length === 0) {
    return (
      <div>
        <PageTitle>My Applications</PageTitle>
        <EmptyState
          title="No applications yet"
          hint="Find a job and apply — your applications will show up here."
          action={
            <Link href="/dashboard/worker/find-jobs" className="text-sm font-semibold text-bronze hover:underline">
              Find jobs →
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div>
      <PageTitle>My Applications</PageTitle>
      <Card className="overflow-hidden p-0">
        <div className="grid grid-cols-[2.2fr_1fr_1fr_1.1fr] gap-3 border-b border-line px-6 py-3.5 text-[10.5px] font-semibold uppercase tracking-wider text-ink3">
          <span>Job</span><span>Applied</span><span>Expected rate</span><span>Status</span>
        </div>
        {apps.map((a) => {
          const d = applicationStatusDisplay(a.status);
          return (
            <Link
              key={a.id}
              href={`/dashboard/worker/jobs/${a.jobId}`}
              className="grid grid-cols-[2.2fr_1fr_1fr_1.1fr] items-center gap-3 border-b border-hair px-6 py-3.5 last:border-b-0 hover:bg-bronze/[0.04]"
            >
              <span>
                <span className="block text-[13.5px] font-medium text-ink">{a.job.title}</span>
                <span className="block text-[11.5px] text-ink3">{a.job.client.name} · {a.roleLineItem.roleName}</span>
              </span>
              <span className="text-[12.5px] text-ink2">{shortDate(a.createdAt)}</span>
              <span className="text-[12.5px] text-ink2">{a.proposedRate ? formatInr(Number(a.proposedRate)) : "—"}</span>
              <span><StatusBadge tone={d.tone}>{d.label}</StatusBadge></span>
            </Link>
          );
        })}
      </Card>
    </div>
  );
}
