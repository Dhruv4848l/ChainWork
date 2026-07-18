import { Card } from "@/components/ui";
import { StatCard } from "@/features/shared/dashboard-ui";
import { requireAdminAccess } from "@/lib/admin/guards";
import { ADMIN_ROLE_LABEL } from "@/lib/admin/roles";
import { bridgePlatformStats } from "@/lib/admin/bridge";
import { adminDb } from "@/lib/adminDb";
import { formatInr } from "@/lib/format";

/*
  ADM-02 Dashboard — role-scoped KPIs. Platform figures come through the bridge;
  dispute/jury figures come from the Admin DB directly (that's the admin's own DB).
*/
export default async function AdminDashboardPage() {
  const admin = await requireAdminAccess("dashboard");
  const [stats, openDisputes, jurors, avgAgreement] = await Promise.all([
    bridgePlatformStats(),
    adminDb.disputeCase.count({ where: { status: { notIn: ["EXECUTED", "CLOSED"] } } }),
    adminDb.jurorProfile.count({ where: { status: "ACTIVE" } }),
    adminDb.jurorProfile.aggregate({ _avg: { agreementRate: true } }),
  ]);

  return (
    <div>
      <h1 className="mb-1 text-[26px] font-semibold text-ink">Operations Dashboard</h1>
      <p className="mb-6 text-[13px] text-ink3">
        Signed in as {admin.name} · <span className="text-bronze">{ADMIN_ROLE_LABEL[admin.role]}</span>
      </p>

      <div className="grid grid-cols-2 gap-3.5 md:grid-cols-3">
        <StatCard label="Users" value={(stats.workers + stats.clients).toLocaleString("en-IN")} sub={`${stats.workers} workers · ${stats.clients} clients`} />
        <StatCard label="Jobs" value={stats.jobs.toLocaleString("en-IN")} />
        <StatCard label="Escrow locked" value={formatInr(stats.escrowLocked)} accent="info" sub={`${stats.hires} hires`} />
        <StatCard label="Released to date" value={formatInr(stats.releasedTotal)} accent="emerald" />
        <StatCard label="Open disputes" value={String(openDisputes)} accent="amber" />
        <StatCard label="Active jurors" value={String(jurors)} accent="bronze" />
      </div>

      <Card className="mt-4 p-6">
        <h3 className="mb-3 text-[15px] font-semibold text-ink">Jury health</h3>
        <div className="flex flex-wrap gap-8 text-[13px]">
          <span className="text-ink3">Avg. agreement with majority <span className="ml-1 font-semibold text-emerald">{(avgAgreement._avg.agreementRate ?? 0).toFixed(0)}%</span></span>
          <span className="text-ink3">Active jurors <span className="ml-1 font-semibold text-ink">{jurors}</span></span>
          <span className="text-ink3">Open disputes <span className="ml-1 font-semibold text-amber">{openDisputes}</span></span>
        </div>
      </Card>
    </div>
  );
}
