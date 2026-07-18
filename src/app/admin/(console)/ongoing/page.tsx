import { Card } from "@/components/ui";
import { EmptyState } from "@/features/shared/dashboard-ui";
import { requireAdminAccess } from "@/lib/admin/guards";
import { bridgeOngoing } from "@/lib/admin/bridge";
import { formatInr } from "@/lib/format";

/* ADM-07 Ongoing Work — read-only overview (Analyst-accessible). */
export default async function OngoingWorkPage() {
  await requireAdminAccess("ongoing");
  const hires = await bridgeOngoing();

  return (
    <div>
      <h1 className="mb-1 text-[26px] font-semibold text-ink">Ongoing Work</h1>
      <p className="mb-5 text-[13px] text-ink3">Live hires and their phase states across the platform.</p>
      {hires.length === 0 ? (
        <EmptyState title="No active hires" />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="grid grid-cols-[2fr_1.4fr_1fr_1.4fr] gap-3 border-b border-line px-6 py-3 text-[10px] font-semibold uppercase tracking-wider text-ink3">
            <span>Hire</span><span>Parties</span><span>Value</span><span>Phases</span>
          </div>
          {hires.map((h) => (
            <div key={h.id} className="grid grid-cols-[2fr_1.4fr_1fr_1.4fr] items-center gap-3 border-b border-hair px-6 py-3.5 last:border-b-0">
              <span className="text-[13.5px] font-medium text-ink">{h.title}</span>
              <span className="text-[12px] text-ink2">{h.client} → {h.worker}</span>
              <span className="text-[13px] font-semibold text-bronze">{formatInr(h.value)}</span>
              <span className="text-[11px] text-ink3">{h.phaseStates.join(" · ")}</span>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
