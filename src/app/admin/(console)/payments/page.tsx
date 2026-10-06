import { Card } from "@/components/ui";
import { EmptyState } from "@/features/shared/dashboard-ui";
import { FlagReviewForm } from "@/features/admin/FlagReviewForm";
import { requireAdminAccess } from "@/lib/admin/guards";
import { bridgeEscrowSupportsRefund, bridgeFlaggedEscrows, bridgeReleasedPhases } from "@/lib/admin/bridge";
import { explorerTxBase } from "@/lib/chain/config";
import { formatDate, formatInr, shortHash } from "@/lib/format";

/* ADM-10 Payments — flagged wallet payments to review, then released phases + their on-chain payout tx. */
export default async function PendingPaymentsPage() {
  await requireAdminAccess("payments");
  const [rows, flags, canRefund] = await Promise.all([bridgeReleasedPhases(), bridgeFlaggedEscrows(), bridgeEscrowSupportsRefund()]);
  const explorer = explorerTxBase();
  const open = flags.filter((f) => f.status === "OPEN");
  const reviewed = flags.filter((f) => f.status === "REVIEWED").slice(0, 10);

  return (
    <div>
      <h1 className="mb-1 text-[26px] font-semibold text-ink">Pending Payments</h1>
      <p className="mb-5 text-[13px] text-ink3">Flagged wallet payments to review, and released phases with their on-chain payout transactions.</p>

      <section aria-labelledby="flagged-heading" className="mb-7">
        <div className="mb-2.5 flex items-center gap-2.5">
          <h2 id="flagged-heading" className="text-[15px] font-semibold text-ink">Flagged wallet payments</h2>
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${open.length ? "bg-ember/15 text-ember" : "bg-emerald/15 text-emerald"}`}>
            {open.length ? `${open.length} open` : "none open"}
          </span>
        </div>
        <p className="mb-3 max-w-3xl text-[12.5px] leading-relaxed text-ink3">
          Money a payer sent into escrow from their own wallet that did not match what was agreed — wrong worker, short of the price, or another currency.
          It was <span className="text-ink2">not</span> credited to the phase and stays locked in escrow. Refund it to the payer, or settle it with them and record what was done.
        </p>
        {open.length === 0 ? (
          <Card className="p-5 text-[13px] text-ink3">Nothing to review. The reconciler adds a flag here whenever it refuses an on-chain funding.</Card>
        ) : (
          <div className="flex flex-col gap-3">
            {open.map((f) => (
              <Card key={f.id} className="grid gap-4 border-ember/40 p-5 lg:grid-cols-[1.4fr_1fr]">
                <div className="flex flex-col gap-1.5 text-[13px]">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-[14px] font-semibold text-ink">{f.phase}</span>
                    <span className="text-ink3">Hire …{f.hireRef} · {f.client} → {f.worker}</span>
                  </div>
                  <div className="text-ember">{f.reason}</div>
                  <div className="text-ink2">
                    In escrow: <span className="font-semibold text-ink">{f.amount}</span>
                    <span className="text-ink3"> (phase is {formatInr(f.phaseAmountInr)})</span>
                  </div>
                  <div className="font-mono text-[11.5px] text-ink3">paid by {f.paidBy} · names worker {f.paidTo}</div>
                  <div className="text-[11.5px] text-ink3">First seen {formatDate(f.detectedAt)} · last checked {formatDate(f.lastSeenAt)}</div>
                </div>
                <FlagReviewForm flagId={f.id} canRefund={canRefund} amount={f.amount} payer={f.paidBy} />
              </Card>
            ))}
          </div>
        )}
        {reviewed.length > 0 && (
          <details className="mt-3 text-[12.5px] text-ink3">
            <summary className="cursor-pointer text-ink2">Recently reviewed ({reviewed.length})</summary>
            <ul className="mt-2 flex flex-col gap-2">
              {reviewed.map((f) => (
                <li key={f.id} className="rounded-lg border border-hair px-3.5 py-2.5">
                  <span className="text-ink2">{f.phase}</span> — {f.note} <span className="text-ink3">({f.reviewedBy}, {formatDate(f.reviewedAt)})</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <h2 className="mb-2.5 text-[15px] font-semibold text-ink">Released phases</h2>
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
