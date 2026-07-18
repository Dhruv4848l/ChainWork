import { Card } from "@/components/ui";
import { StatCard } from "@/features/shared/dashboard-ui";
import { requireAdminAccess } from "@/lib/admin/guards";
import { bridgePlatformStats } from "@/lib/admin/bridge";
import { adminDb } from "@/lib/adminDb";
import { formatInr } from "@/lib/format";

/* ADM-16 Reports & Analytics (Analyst-accessible, read-only). */
export default async function ReportsPage() {
  await requireAdminAccess("reports");
  const [stats, disputes, executed, jurors, agree] = await Promise.all([
    bridgePlatformStats(),
    adminDb.disputeCase.count(),
    adminDb.disputeCase.count({ where: { status: "EXECUTED" } }),
    adminDb.jurorProfile.count(),
    adminDb.jurorProfile.aggregate({ _avg: { agreementRate: true } }),
  ]);

  return (
    <div>
      <h1 className="mb-1 text-[26px] font-semibold text-ink">Reports &amp; Analytics</h1>
      <p className="mb-5 text-[13px] text-ink3">Platform + jury health at a glance.</p>

      <div className="mb-4 grid grid-cols-2 gap-3.5 md:grid-cols-4">
        <StatCard label="Total users" value={(stats.workers + stats.clients).toLocaleString("en-IN")} />
        <StatCard label="Total jobs" value={stats.jobs.toLocaleString("en-IN")} />
        <StatCard label="Escrow released" value={formatInr(stats.releasedTotal)} accent="emerald" />
        <StatCard label="Escrow locked" value={formatInr(stats.escrowLocked)} accent="info" />
      </div>
      <Card className="p-6">
        <h3 className="mb-3 text-[15px] font-semibold text-ink">Jury health metrics</h3>
        <div className="grid grid-cols-2 gap-4 text-[13px] md:grid-cols-4">
          <div><div className="text-ink3">Total cases</div><div className="text-lg font-semibold text-ink">{disputes}</div></div>
          <div><div className="text-ink3">Executed</div><div className="text-lg font-semibold text-emerald">{executed}</div></div>
          <div><div className="text-ink3">Active jurors</div><div className="text-lg font-semibold text-bronze">{jurors}</div></div>
          <div><div className="text-ink3">Avg. agreement</div><div className="text-lg font-semibold text-emerald">{(agree._avg.agreementRate ?? 0).toFixed(0)}%</div></div>
        </div>
      </Card>
    </div>
  );
}
