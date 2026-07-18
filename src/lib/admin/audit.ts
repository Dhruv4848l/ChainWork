import "server-only";
import { adminDb } from "@/lib/adminDb";

/*
  Immutable audit log (spec 18, ADM-19). EVERY privileged admin/juror action calls
  this. Rows are append-only — the app never updates or deletes them. Records
  who / what / when / before / after / which primary key.
*/
export async function writeAudit(entry: {
  actorAdminId?: string;
  actorLabel?: string;
  action: string;
  targetType: string;
  targetId: string;
  before?: unknown;
  after?: unknown;
}): Promise<void> {
  await adminDb.auditLog.create({
    data: {
      actorAdminId: entry.actorAdminId ?? null,
      actorLabel: entry.actorLabel ?? null,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      before: (entry.before ?? undefined) as never,
      after: (entry.after ?? undefined) as never,
    },
  });
}
