import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, StatusBadge } from "@/components/ui";
import { requireAdminAccess } from "@/lib/admin/guards";
import { bridgeGetUser } from "@/lib/admin/bridge";
import { approveKycAction } from "@/features/admin/actions";
import { AdminActionButton } from "@/features/admin/AdminActionButton";
import { formatDate } from "@/lib/format";

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminAccess("users");
  const { id } = await params;
  const u = await bridgeGetUser(id); // via bridge — sanitized, masked contact
  if (!u) notFound();

  const facts: [string, string][] = [
    ["Role", u.role],
    ["Email", u.email],
    ["Phone", u.phone],
    ["Phone verified", u.phoneVerified ? "Yes" : "No"],
    ["Email verified", u.emailVerified ? "Yes" : "No"],
    ["Strikes", String(u.strikes)],
    ["Joined", formatDate(u.createdAt)],
  ];

  return (
    <div className="max-w-3xl">
      <Link href="/admin/users" className="mb-4 inline-block text-[12px] font-semibold uppercase tracking-wider text-bronze hover:underline">
        ← KYC queue
      </Link>

      <div className="mb-4 flex items-center gap-3">
        <h1 className="m-0 text-[24px] font-semibold text-ink">{u.name}</h1>
        <StatusBadge tone={u.kycTier === "UNVERIFIED" ? "draft" : u.kycTier === "TRUSTED" || u.kycTier === "VERIFIED" ? "success" : "warning"}>
          {u.kycTier}
        </StatusBadge>
        {u.suspended && <StatusBadge tone="danger">Suspended</StatusBadge>}
      </div>

      <div className="grid gap-3.5 md:grid-cols-2">
        <Card className="p-6">
          <h3 className="mb-3 text-[15px] font-semibold text-ink">Details</h3>
          {facts.map(([k, v]) => (
            <div key={k} className="flex justify-between border-b border-hair py-2 text-[13px] last:border-b-0">
              <span className="text-ink3">{k}</span>
              <span className="text-right text-ink">{v}</span>
            </div>
          ))}
        </Card>
        <Card className="p-6">
          <h3 className="mb-3 text-[15px] font-semibold text-ink">{u.worker ? "Worker profile" : "Client profile"}</h3>
          {u.worker && (
            <div className="text-[13px] text-ink2">
              <div className="mb-1">{u.worker.headline ?? "—"}</div>
              <div className="text-ink3">★ {u.worker.rating.toFixed(1)} · {u.worker.completedJobs} jobs</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {u.worker.skills.map((s) => <span key={s} className="rounded-full border border-bronze/30 px-2.5 py-0.5 text-[11px] text-bronze">{s}</span>)}
              </div>
            </div>
          )}
          {u.client && (
            <div className="text-[13px] text-ink2">
              <div>{u.client.company ?? "Individual"} · {u.client.type}</div>
              <div className="mt-1 text-ink3">Escrow reliability {Math.round(u.client.reliability)}%</div>
            </div>
          )}
        </Card>
      </div>

      <Card className="mt-3.5 flex flex-wrap items-center gap-3 p-6">
        <span className="text-[13px] font-medium text-ink">Set KYC tier:</span>
        <AdminActionButton label="Approve → Basic" run={approveKycAction.bind(null, u.id, "BASIC")} />
        <AdminActionButton label="Approve → Verified" variant="success" run={approveKycAction.bind(null, u.id, "VERIFIED")} />
        <AdminActionButton label="Approve → Trusted" variant="primary" run={approveKycAction.bind(null, u.id, "TRUSTED")} />
      </Card>
    </div>
  );
}
