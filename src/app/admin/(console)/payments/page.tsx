import { Card } from "@/components/ui";
import { EmptyState } from "@/features/shared/dashboard-ui";
import { requireAdminAccess } from "@/lib/admin/guards";
import { bridgeReleasedPhases } from "@/lib/admin/bridge";
import { explorerTxBase } from "@/lib/chain/config";
import { formatInr, shortHash } from "@/lib/format";

/* ADM-10 Pending Payments — released phases + their on-chain payout tx. */
export default async function PendingPaymentsPage() {
  await requireAdminAccess("payments");
  const rows = await bridgeReleasedPhases();
  const explorer = explorerTxBase();

  return (
    <div>
      <h1 className="mb-1 text-[26px] font-semibold text-ink">Pending Payments</h1>
      <p className="mb-5 text-[13px] text-ink3">Released phases and their on-chain payout transactions.</p>
      {rows.length === 0 ? (
        <EmptyState title="No payouts" />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="grid grid-cols-[2fr_1.2fr_1fr_1.2fr] gap-3 border-b border-line px-6 py-3 text-[10px] font-semibold uppercase tracking-wider text-ink3">
            <span>Phase</span><span>Worker</span><span>Amount</span><span>On-chain</span>
          </div>
          {rows.map((r) => (
            <div key={r.phaseId} className="grid grid-cols-[2fr_1.2fr_1fr_1.2fr] items-center gap-3 border-b border-hair px-6 py-3.5 last:border-b-0">
              <span className="text-[13px] font-medium text-ink">{r.title}</span>
              <span className="text-[12px] text-ink2">{r.worker}</span>
              <span className="text-[13px] font-semibold text-emerald">{formatInr(r.amount)}</span>
              {explorer && r.txHash ? (
                <a href={`${explorer}${r.txHash}`} target="_blank" rel="noreferrer" className="font-mono text-[11px] text-[#8FC7E8] hover:underline">{shortHash(r.txHash)}</a>
              ) : (
                <span className="font-mono text-[11px] text-ink3">{shortHash(r.txHash)}</span>
              )}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
