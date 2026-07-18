import { Card } from "@/components/ui";
import { requireAdminAccess } from "@/lib/admin/guards";
import { adminDb } from "@/lib/adminDb";
import { ADMIN_ROLE_LABEL, ADMIN_NAV, canAccess } from "@/lib/admin/roles";
import type { AdminRole } from "@/generated/admin";

const ROLE_SCOPE: Record<AdminRole, string> = {
  ROOT_SUPER_ADMIN: "Everything, incl. PlatformConfig, role provisioning, emergency override (double-logged)",
  VERIFICATION_OFFICER: "KYC queue + user detail — no financial screens",
  MODERATION_OFFICER: "Job & blog moderation, taxonomy",
  SUPPORT_AGENT: "Complaint triage: resolve trivial, route the rest",
  FINANCE_COMPLIANCE_OFFICER: "Settlements, confirmations, payouts, partial config",
  ANALYST: "Reports + ongoing work — strictly read-only",
  JURY: "Only their assigned dispute cases",
};

export default async function RolesPage() {
  await requireAdminAccess("roles");
  const counts = await adminDb.adminUser.groupBy({ by: ["role"], _count: true });
  const countMap = new Map(counts.map((c) => [c.role, c._count]));
  const roles = Object.keys(ADMIN_ROLE_LABEL) as AdminRole[];

  return (
    <div className="max-w-4xl">
      <h1 className="mb-1 text-[26px] font-semibold text-ink">Roles &amp; Permissions</h1>
      <p className="mb-5 text-[13px] text-ink3">Internal roles and the console sections each can reach.</p>
      <div className="flex flex-col gap-3">
        {roles.map((r) => (
          <Card key={r} className="p-5">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[15px] font-semibold text-ink">{ADMIN_ROLE_LABEL[r]}</span>
              <span className="text-[12px] text-ink3">{countMap.get(r) ?? 0} account(s)</span>
            </div>
            <p className="mb-2.5 text-[12.5px] text-ink2">{ROLE_SCOPE[r]}</p>
            <div className="flex flex-wrap gap-1.5">
              {ADMIN_NAV.filter((n) => canAccess(r, n.key)).map((n) => (
                <span key={n.key} className="rounded-full border border-line px-2.5 py-0.5 text-[10.5px] text-ink3">{n.label}</span>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
