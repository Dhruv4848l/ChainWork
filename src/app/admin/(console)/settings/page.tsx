import { Card } from "@/components/ui";
import { requireAdminAccess } from "@/lib/admin/guards";
import { adminDb } from "@/lib/adminDb";
import { ConfigEditor } from "@/features/admin/ConfigEditor";

export default async function PlatformSettingsPage() {
  const admin = await requireAdminAccess("settings");
  const rows = await adminDb.platformConfig.findMany({ orderBy: [{ category: "asc" }, { key: "asc" }] });
  const canEdit = admin.role === "ROOT_SUPER_ADMIN" || admin.role === "FINANCE_COMPLIANCE_OFFICER";

  const byCategory = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!byCategory.has(r.category)) byCategory.set(r.category, []);
    byCategory.get(r.category)!.push(r);
  }

  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-[26px] font-semibold text-ink">Platform Settings <span className="text-[13px] font-normal text-ink3">(PlatformConfig)</span></h1>
      <p className="mb-5 text-[13px] text-ink3">
        {canEdit ? "Every change is written to the immutable audit log." : "Read-only for your role."}
      </p>
      <div className="flex flex-col gap-3.5">
        {[...byCategory.entries()].map(([cat, catRows]) => (
          <Card key={cat} className="p-6">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-bronze">{cat}</h3>
            <ConfigEditor
              rows={catRows.map((r) => ({ key: r.key, value: r.value, hint: r.hint, category: r.category }))}
              canEdit={canEdit}
            />
          </Card>
        ))}
      </div>
    </div>
  );
}
