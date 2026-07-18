import { Card, StatusBadge } from "@/components/ui";
import { EmptyState } from "@/features/shared/dashboard-ui";
import { requireAdminAccess } from "@/lib/admin/guards";
import { adminDb } from "@/lib/adminDb";
import { settleDisputeAction } from "@/features/admin/actions";
import { AdminActionButton } from "@/features/admin/AdminActionButton";
import { formatInr } from "@/lib/format";

/*
  ADM-08 Pending Settlements — jury cases with a verdict ready to execute. The Settle
  button executes the verdict split on the Phase-6 contract on-chain.
*/
export default async function PendingSettlementsPage() {
  await requireAdminAccess("settlements");
  const cases = await adminDb.disputeCase.findMany({
    where: { verdictChoice: { not: null }, status: { notIn: ["EXECUTED", "CLOSED"] } },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div>
      <h1 className="mb-1 text-[26px] font-semibold text-ink">Pending Settlements</h1>
      <p className="mb-5 text-[13px] text-ink3">Verdicts awaiting on-chain execution. Settling directs the frozen escrow per the jury decision.</p>
      {cases.length === 0 ? (
        <EmptyState title="No settlements pending" hint="Cases with a finalized verdict appear here to execute." />
      ) : (
        <div className="flex flex-col gap-3">
          {cases.map((c) => (
            <Card key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-5">
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="text-[15px] font-semibold text-ink">{c.clientLabel} vs {c.workerLabel}</span>
                  <StatusBadge tone="info">{c.verdictChoice}</StatusBadge>
                </div>
                <div className="mt-0.5 text-[12px] text-ink3">{formatInr(Number(c.escrowAmount))} · {c.valueTier} tier</div>
              </div>
              <AdminActionButton label="Settle on-chain" variant="success" run={settleDisputeAction.bind(null, c.id)} />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
