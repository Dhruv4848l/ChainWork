import { Card, StatusBadge } from "@/components/ui";
import { EmptyState } from "@/features/shared/dashboard-ui";
import { requireAdminAccess } from "@/lib/admin/guards";
import { bridgeComplaints } from "@/lib/admin/bridge";
import { TriageControls } from "@/features/admin/TriageControls";

export default async function ComplaintTriagePage() {
  await requireAdminAccess("complaints");
  const complaints = await bridgeComplaints();

  return (
    <div>
      <h1 className="mb-1 text-[26px] font-semibold text-ink">Complaint Triage Center</h1>
      <p className="mb-5 text-[13px] text-ink3">
        Route each complaint: trivial issues resolve in support; financial disputes over active
        escrow escalate to a peer jury.
      </p>

      {complaints.length === 0 ? (
        <EmptyState title="No complaints to triage" hint="New complaints land here for routing." />
      ) : (
        <div className="flex flex-col gap-3">
          {complaints.map((c) => (
            <Card key={c.id} className="p-5">
              <div className="mb-2 flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2.5">
                    <span className="text-[15px] font-semibold text-ink">{c.hireTitle}</span>
                    <StatusBadge tone="info">{c.category}</StatusBadge>
                    {c.lane && <StatusBadge tone={c.lane === "FINANCIAL" ? "warning" : "draft"}>{c.lane}</StatusBadge>}
                  </div>
                  <div className="mt-0.5 text-[12px] text-ink3">{c.parties} · filed by {c.filedBy}</div>
                </div>
                <StatusBadge tone={c.status === "ESCALATED" ? "warning" : "info"}>{c.status}</StatusBadge>
              </div>
              <p className="mb-3 text-[13px] font-light text-ink2">“{c.description}”</p>
              <TriageControls complaintId={c.id} />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
