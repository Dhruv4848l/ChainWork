import { Card, StatusBadge } from "@/components/ui";
import { EmptyState } from "@/features/shared/dashboard-ui";
import { requireAdminAccess } from "@/lib/admin/guards";
import { bridgePendingConfirmations } from "@/lib/admin/bridge";
import { formatInr } from "@/lib/format";

/* ADM-09 Pending Confirmations — the Phase 8 auto-release countdown data. */
export default async function PendingConfirmationsPage() {
  await requireAdminAccess("confirmations");
  const pending = await bridgePendingConfirmations();

  return (
    <div>
      <h1 className="mb-1 text-[26px] font-semibold text-ink">Pending Completion Confirmations</h1>
      <p className="mb-5 text-[13px] text-ink3">
        Phases mid verification-window. Stalled ones auto-release to the worker once the window closes
        and the 2 reminders are spent.
      </p>
      {pending.length === 0 ? (
        <EmptyState title="Nothing awaiting confirmation" />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="grid grid-cols-[2fr_1.2fr_1fr_1fr_1fr] gap-3 border-b border-line px-6 py-3 text-[10px] font-semibold uppercase tracking-wider text-ink3">
            <span>Phase</span><span>Parties</span><span>Amount</span><span>Reminders</span><span>Auto-release</span>
          </div>
          {pending.map((p) => (
            <div key={p.phaseId} className="grid grid-cols-[2fr_1.2fr_1fr_1fr_1fr] items-center gap-3 border-b border-hair px-6 py-3.5 last:border-b-0">
              <span className="text-[13px] font-medium text-ink">{p.title}</span>
              <span className="text-[12px] text-ink2">{p.client} → {p.worker}</span>
              <span className="text-[13px] font-semibold text-[#8FC7E8]">{formatInr(p.amount)}</span>
              <span className="text-[12px] text-ink3">{p.remindersSent} / 2 sent</span>
              <span>
                {p.overdue
                  ? <StatusBadge tone="warning">due now</StatusBadge>
                  : <span className="text-[12px] text-ink2">in ~{p.hoursUntilAutoRelease}h</span>}
              </span>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
