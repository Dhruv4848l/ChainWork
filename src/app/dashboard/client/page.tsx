import Link from "next/link";
import { Card, StatusBadge } from "@/components/ui";
import { PageTitle, StatCard } from "@/features/shared/dashboard-ui";
import { hireStatusDisplay } from "@/features/shared/status";
import { requireRole } from "@/lib/auth/guards";
import { getClientDashboard } from "@/features/client/queries";
import { formatInr } from "@/lib/format";

export default async function ClientDashboardPage() {
  const user = await requireRole("CLIENT", "/dashboard/client");
  const data = await getClientDashboard(user.id);
  const firstName = user.name.split(" ")[0];

  // Jobs that have applicants waiting for review
  const attention = data.jobs
    .filter((j) => j.status === "PUBLISHED" && j._count.applications > 0)
    .slice(0, 4);

  return (
    <div>
      <PageTitle sub={new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}>
        Welcome back, {firstName}
      </PageTitle>

      <div className="mb-6 grid grid-cols-2 gap-3.5 md:grid-cols-4">
        <StatCard label="Active jobs" value={String(data.activeJobs)} accent="bronze" />
        <StatCard label="New applicants" value={String(data.applicantCount)} accent="amber" sub="to review" />
        <StatCard label="Active hires" value={String(data.hires.length)} />
        <StatCard label="Escrow locked" value={formatInr(data.escrow)} accent="info" />
      </div>

      <div className="grid gap-3.5 lg:grid-cols-[1.5fr_1fr]">
        <Card className="p-6">
          <div className="mb-3.5 flex items-center justify-between">
            <h3 className="text-base font-semibold text-ink">Needs your attention</h3>
            <Link href="/dashboard/client/jobs" className="text-xs text-bronze hover:underline">My jobs →</Link>
          </div>
          <div className="flex flex-col gap-2.5">
            {attention.length === 0 && (
              <p className="py-4 text-sm text-ink3">Nothing needs action right now.</p>
            )}
            {attention.map((j) => (
              <Link
                key={j.id}
                href={`/dashboard/client/jobs/${j.id}/applicants`}
                className="flex items-center justify-between gap-3 rounded-xl border border-hair bg-bg px-4 py-3.5 hover:border-bronze/40"
              >
                <span>
                  <span className="block text-sm font-semibold text-ink">{j.title}</span>
                  <span className="mt-0.5 block text-xs text-ink3">{j._count.applications} applicant(s) to review</span>
                </span>
                <StatusBadge tone="warning">Review</StatusBadge>
              </Link>
            ))}
          </div>
        </Card>

        <div className="flex flex-col gap-3.5">
          <Card className="p-6">
            <h3 className="mb-3.5 text-base font-semibold text-ink">Current workers</h3>
            {data.hires.length === 0 && <p className="text-sm text-ink3">No active hires yet.</p>}
            {data.hires.map((h) => {
              const d = hireStatusDisplay(h.status);
              return (
                <Link
                  key={h.id}
                  href={`/dashboard/client/hires/${h.id}`}
                  className="flex items-center justify-between gap-2 border-b border-hair py-2.5 last:border-b-0"
                >
                  <span>
                    <span className="block text-[13.5px] font-medium text-ink">{h.worker.name}</span>
                    <span className="block text-[11px] text-ink3">{h.roleLineItem.roleName} · {h.job.title}</span>
                  </span>
                  <StatusBadge tone={d.tone}>{d.label}</StatusBadge>
                </Link>
              );
            })}
          </Card>

          <Card className="p-6">
            <h3 className="mb-3 text-base font-semibold text-ink">Payment summary</h3>
            {[
              ["In escrow", formatInr(data.escrow), "text-[#8FC7E8]"],
              ["Released to workers", formatInr(data.released), "text-emerald"],
            ].map(([k, v, c]) => (
              <div key={k} className="flex justify-between border-b border-hair py-1.5 text-[13px] last:border-b-0">
                <span className="text-ink3">{k}</span>
                <span className={`font-semibold ${c}`}>{v}</span>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}
