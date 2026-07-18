import Link from "next/link";
import { Button, Card, StatusBadge } from "@/components/ui";
import { PageTitle, StatCard } from "@/features/shared/dashboard-ui";
import { hireStatusDisplay } from "@/features/shared/status";
import { requireRole } from "@/lib/auth/guards";
import { getWorkerDashboard } from "@/features/worker/queries";
import { formatInr } from "@/lib/format";

export default async function WorkerDashboardPage() {
  const user = await requireRole("WORKER", "/dashboard/worker");
  const data = await getWorkerDashboard(user.id);
  const firstName = user.name.split(" ")[0];
  const profilePct = profileCompletion(user, data.profile);

  return (
    <div>
      <PageTitle
        sub={new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
        action={
          <Link href="/dashboard/worker/find-jobs">
            <Button variant="primary" size="sm">Find Jobs</Button>
          </Link>
        }
      >
        Good day, {firstName}
      </PageTitle>

      {/* Stat cards */}
      <div className="mb-6 grid grid-cols-2 gap-3.5 md:grid-cols-4">
        <StatCard label="Active hires" value={String(data.hires.length)} accent="bronze" />
        <StatCard label="Pending escrow" value={formatInr(data.pendingEscrow)} accent="info" sub="held for you" />
        <StatCard label="Completed jobs" value={String(data.profile?.completedJobsCount ?? 0)} />
        <StatCard label="Rating" value={`★ ${(data.profile?.ratingAvg ?? 0).toFixed(1)}`} accent="bronze" />
      </div>

      {/* Profile completion */}
      <Card className="mb-6 flex items-center gap-4 p-5">
        <div className="flex-1">
          <div className="mb-2 text-[13.5px] font-medium text-ink">
            Profile {profilePct}% complete — a fuller profile reaches more clients
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-bg">
            <div className="h-full bg-bronze" style={{ width: `${profilePct}%` }} />
          </div>
        </div>
        <Link href="/dashboard/worker/profile/edit">
          <Button variant="secondary" size="sm">Complete Profile</Button>
        </Link>
      </Card>

      <div className="grid gap-3.5 lg:grid-cols-[1.5fr_1fr]">
        {/* Recommended jobs */}
        <Card className="p-6">
          <div className="mb-3.5 flex items-center justify-between">
            <h3 className="text-base font-semibold text-ink">Recommended for you</h3>
            <Link href="/dashboard/worker/find-jobs" className="text-xs text-bronze hover:underline">
              See all →
            </Link>
          </div>
          <div className="flex flex-col gap-2.5">
            {data.recommended.length === 0 && (
              <p className="py-4 text-sm text-ink3">No new jobs right now — check back soon.</p>
            )}
            {data.recommended.map((j) => {
              const rate = j.roleLineItems[0]?.perPersonRate;
              return (
                <Link
                  key={j.id}
                  href={`/dashboard/worker/jobs/${j.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-hair bg-bg px-4 py-3.5 transition-colors hover:border-bronze/40"
                >
                  <span>
                    <span className="block text-sm font-semibold text-ink">{j.title}</span>
                    <span className="mt-0.5 block text-xs text-ink3">
                      {j.category.name} · {j.location ?? "Nearby"}
                    </span>
                  </span>
                  <span className="text-right text-[13.5px] font-semibold text-bronze">
                    {rate ? formatInr(Number(rate)) : "—"}
                  </span>
                </Link>
              );
            })}
          </div>
        </Card>

        <div className="flex flex-col gap-3.5">
          {/* Active hires */}
          <Card className="p-6">
            <h3 className="mb-3.5 text-base font-semibold text-ink">Active hires</h3>
            {data.hires.length === 0 && <p className="text-sm text-ink3">No active hires yet.</p>}
            {data.hires.map((h) => {
              const d = hireStatusDisplay(h.status);
              return (
                <Link
                  key={h.id}
                  href={`/dashboard/worker/hires/${h.id}`}
                  className="flex items-center justify-between gap-2 border-b border-hair py-2.5 last:border-b-0"
                >
                  <span>
                    <span className="block text-[13.5px] font-medium text-ink">{h.job.title}</span>
                    <span className="block text-[11.5px] text-ink3">{h.client.name}</span>
                  </span>
                  <StatusBadge tone={d.tone}>{d.label}</StatusBadge>
                </Link>
              );
            })}
          </Card>

          {/* Latest activity */}
          <Card className="p-6">
            <h3 className="mb-3 text-base font-semibold text-ink">Latest activity</h3>
            {data.notifications.length === 0 && <p className="text-sm text-ink3">Nothing yet.</p>}
            {data.notifications.map((n) => (
              <div key={n.id} className="border-b border-hair py-1.5 text-[12.5px] text-ink2 last:border-b-0">
                <span className="text-bronze">●</span> {n.title}
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}

function profileCompletion(
  user: { emailVerified: boolean; phoneVerified: boolean; kycTier: string },
  profile: { headline: string | null; bio: string | null; location: string | null } | null
): number {
  let score = 20; // account exists
  if (user.phoneVerified) score += 15;
  if (user.emailVerified) score += 10;
  if (user.kycTier !== "UNVERIFIED") score += 20;
  if (profile?.headline) score += 12;
  if (profile?.bio) score += 11;
  if (profile?.location) score += 12;
  return Math.min(100, score);
}
