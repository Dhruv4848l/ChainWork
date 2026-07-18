import Link from "next/link";
import { Card } from "@/components/ui";
import { PageTitle } from "@/features/shared/dashboard-ui";
import { requireRole } from "@/lib/auth/guards";
import { getPublishedJobs } from "@/features/worker/queries";
import { formatInr, shortDate } from "@/lib/format";

const FILTERS = ["Category", "Distance", "Budget", "Date"];

export default async function FindJobsPage() {
  await requireRole("WORKER");
  const jobs = await getPublishedJobs();

  return (
    <div>
      <PageTitle>Find Jobs</PageTitle>

      <Card className="mb-4 flex flex-wrap items-center gap-2.5 p-4">
        {FILTERS.map((f) => (
          <span key={f} className="cursor-pointer rounded-full border border-line-strong px-4 py-2 text-[12.5px] font-medium text-ink2 hover:border-bronze">
            {f} ▾
          </span>
        ))}
        <span className="cursor-pointer rounded-full border border-amber/40 bg-amber/[0.08] px-4 py-2 text-[12.5px] font-semibold text-amber">
          ⚡ Urgent only
        </span>
        <span className="ml-auto text-xs text-ink3">Radius: 10 km</span>
      </Card>

      <div className="flex flex-col gap-3">
        {jobs.map((j) => {
          const rate = j.roleLineItems[0]?.perPersonRate;
          const openSlots = j.roleLineItems.reduce((s, r) => s + (r.headcount - r.hiredCount), 0);
          return (
            <Link
              key={j.id}
              href={`/dashboard/worker/jobs/${j.id}`}
              className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-card px-6 py-5 transition-colors hover:border-bronze/40"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="text-base font-semibold text-ink">{j.title}</span>
                  {j.urgent && (
                    <span className="rounded-full border border-amber/35 px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-amber">
                      Urgent
                    </span>
                  )}
                </div>
                <div className="mt-1.5 text-[12.5px] text-ink3">
                  {j.category.name} · {j.location ?? "Nearby"} · from {shortDate(j.startDate)} · Client {j.client.name}
                </div>
              </div>
              <div className="flex-shrink-0 text-right">
                <div className="text-base font-semibold text-bronze">{rate ? formatInr(Number(rate)) : "—"}</div>
                <div className="mt-0.5 text-[11.5px] text-ink3">{openSlots} slot{openSlots === 1 ? "" : "s"} open</div>
              </div>
            </Link>
          );
        })}
        {jobs.length === 0 && <p className="text-sm text-ink3">No open jobs right now.</p>}
      </div>
    </div>
  );
}
