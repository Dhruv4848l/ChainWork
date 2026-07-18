import Link from "next/link";
import { Card, StatusBadge } from "@/components/ui";
import { EmptyState } from "@/features/shared/dashboard-ui";
import { requireAdminAccess, getCurrentAdmin } from "@/lib/admin/guards";
import { adminDb } from "@/lib/adminDb";
import { formatInr } from "@/lib/format";

const STATUS_TONE: Record<string, "info" | "warning" | "success" | "danger" | "draft"> = {
  INTAKE: "draft", EVIDENCE: "info", COMMIT: "warning", REVEAL: "warning",
  VERDICT: "info", EXECUTED: "success", APPEALED: "danger", CLOSED: "draft",
};

/*
  ADM-11 Dispute Queue. A JURY admin sees ONLY the cases they're assigned to; other
  roles see the whole queue. Parties are anonymized at this level.
*/
export default async function DisputeQueuePage() {
  await requireAdminAccess("disputes");
  const admin = await getCurrentAdmin();

  let assignedCaseIds: string[] | null = null;
  if (admin?.role === "JURY") {
    const juror = await adminDb.jurorProfile.findFirst({ where: { platformUserId: admin.id } });
    const assignments = juror
      ? await adminDb.juryAssignment.findMany({ where: { jurorId: juror.id }, select: { caseId: true } })
      : [];
    assignedCaseIds = assignments.map((a) => a.caseId);
  }

  const cases = await adminDb.disputeCase.findMany({
    where: assignedCaseIds ? { id: { in: assignedCaseIds } } : undefined,
    include: { _count: { select: { assignments: true, votes: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <h1 className="mb-1 text-[26px] font-semibold text-ink">Dispute Queue</h1>
      <p className="mb-5 text-[13px] text-ink3">
        {admin?.role === "JURY" ? "Your assigned cases only. " : ""}Parties are anonymized. Panel size is set by case value.
      </p>
      {cases.length === 0 ? (
        <EmptyState title="No disputes" hint={admin?.role === "JURY" ? "You have no assigned cases." : "Escalated financial disputes appear here."} />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="grid grid-cols-[1.6fr_1fr_1fr_0.8fr_1fr] gap-3 border-b border-line px-6 py-3 text-[10px] font-semibold uppercase tracking-wider text-ink3">
            <span>Parties</span><span>Value</span><span>Panel</span><span>Votes</span><span>Status</span>
          </div>
          {cases.map((c) => (
            <Link key={c.id} href={`/admin/disputes/${c.id}`} className="grid grid-cols-[1.6fr_1fr_1fr_0.8fr_1fr] items-center gap-3 border-b border-hair px-6 py-3.5 last:border-b-0 hover:bg-bronze/[0.04]">
              <span className="text-[13px] font-medium text-ink">{c.clientLabel} vs {c.workerLabel}</span>
              <span className="text-[13px] font-semibold text-[#8FC7E8]">{formatInr(Number(c.escrowAmount))}</span>
              <span className="text-[12px] text-ink2">{c.panelSize} jurors ({c.valueTier})</span>
              <span className="text-[12px] text-ink3">{c._count.votes}/{c._count.assignments}</span>
              <span><StatusBadge tone={STATUS_TONE[c.status] ?? "draft"}>{c.status}</StatusBadge></span>
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}
