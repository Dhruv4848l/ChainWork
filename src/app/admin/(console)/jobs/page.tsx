import { Card, StatusBadge } from "@/components/ui";
import { EmptyState } from "@/features/shared/dashboard-ui";
import { jobStatusDisplay } from "@/features/shared/status";
import { requireAdminAccess } from "@/lib/admin/guards";
import { bridgeJobs } from "@/lib/admin/bridge";
import { moderateJobAction } from "@/features/admin/actions";
import { AdminActionButton } from "@/features/admin/AdminActionButton";
import { formatDate } from "@/lib/format";

export default async function JobModerationPage() {
  await requireAdminAccess("jobs");
  const jobs = await bridgeJobs();

  return (
    <div>
      <h1 className="mb-1 text-[26px] font-semibold text-ink">Job Moderation</h1>
      <p className="mb-5 text-[13px] text-ink3">Keyword/category screening holds listings before they go live.</p>
      {jobs.length === 0 ? (
        <EmptyState title="Nothing to moderate" />
      ) : (
        <div className="flex flex-col gap-3">
          {jobs.map((j) => {
            const d = jobStatusDisplay(j.status);
            return (
              <Card key={j.id} className="flex flex-wrap items-center justify-between gap-3 p-5">
                <div>
                  <div className="flex items-center gap-2.5">
                    <span className="text-[15px] font-semibold text-ink">{j.title}</span>
                    {j.urgent && <StatusBadge tone="warning">Urgent</StatusBadge>}
                    <StatusBadge tone={d.tone}>{d.label}</StatusBadge>
                  </div>
                  <div className="mt-0.5 text-[12px] text-ink3">{j.client} · {j.applicants} applicant(s) · {formatDate(j.createdAt)}</div>
                </div>
                <div className="flex gap-2">
                  <AdminActionButton label="Hold" variant="danger" run={moderateJobAction.bind(null, j.id, "HOLD")} />
                  <AdminActionButton label="Approve" variant="success" run={moderateJobAction.bind(null, j.id, "PUBLISH")} />
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
