import { Card } from "@/components/ui";
import { requireAdminAccess } from "@/lib/admin/guards";
import { adminDb } from "@/lib/adminDb";
import { formatDate } from "@/lib/format";

/*
  ADM-19 Audit Log — the immutable record of every privileged action. Read straight
  from the Admin DB (append-only; the app never edits these rows).
*/
export default async function AuditLogPage() {
  await requireAdminAccess("audit");
  const logs = await adminDb.auditLog.findMany({
    include: { actor: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div>
      <h1 className="mb-1 text-[26px] font-semibold text-ink">Audit Log</h1>
      <p className="mb-5 text-[13px] text-ink3">Immutable · every privileged admin & juror action.</p>
      <Card className="overflow-hidden p-0">
        <div className="grid grid-cols-[1.4fr_1fr_1.4fr_0.9fr] gap-3 border-b border-line px-6 py-3 text-[10px] font-semibold uppercase tracking-wider text-ink3">
          <span>Action</span><span>Actor</span><span>Target</span><span>When</span>
        </div>
        {logs.length === 0 && <p className="p-6 text-sm text-ink3">No entries yet.</p>}
        {logs.map((l) => (
          <div key={l.id} className="grid grid-cols-[1.4fr_1fr_1.4fr_0.9fr] items-center gap-3 border-b border-hair px-6 py-3 text-[12.5px] last:border-b-0">
            <span className="font-medium text-ink">{l.action}</span>
            <span className="text-ink2">{l.actor?.name ?? l.actorLabel ?? "system"}</span>
            <span className="truncate text-ink3">{l.targetType} · <span className="font-mono">{l.targetId.slice(-8)}</span></span>
            <span className="text-ink3">{formatDate(l.createdAt)}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}
