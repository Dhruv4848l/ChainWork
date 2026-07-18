import Link from "next/link";
import { Card, StatusBadge } from "@/components/ui";
import { EmptyState } from "@/features/shared/dashboard-ui";
import { requireAdminAccess } from "@/lib/admin/guards";
import { bridgeKycQueue } from "@/lib/admin/bridge";
import { formatDate } from "@/lib/format";

export default async function KycQueuePage() {
  await requireAdminAccess("users");
  const queue = await bridgeKycQueue();

  return (
    <div>
      <h1 className="mb-1 text-[26px] font-semibold text-ink">User Management — KYC Queue</h1>
      <p className="mb-5 text-[13px] text-ink3">
        Business data fetched via the bridge service by primary key — never a cross-DB join.
      </p>

      {queue.length === 0 ? (
        <EmptyState title="KYC queue is clear" hint="Users pending verification will appear here." />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr_0.6fr] gap-3 border-b border-line px-6 py-3 text-[10px] font-semibold uppercase tracking-wider text-ink3">
            <span>User</span><span>Type</span><span>KYC tier</span><span>Waiting since</span><span></span>
          </div>
          {queue.map((u) => (
            <div key={u.id} className="grid grid-cols-[2fr_1fr_1fr_1fr_0.6fr] items-center gap-3 border-b border-hair px-6 py-3.5 last:border-b-0">
              <span className="text-[13.5px] font-medium text-ink">{u.name}</span>
              <span className="text-[12.5px] text-ink2">{u.accountType}</span>
              <span><StatusBadge tone={u.kycTier === "UNVERIFIED" ? "draft" : "warning"}>{u.kycTier}</StatusBadge></span>
              <span className="text-[12.5px] text-ink3">{formatDate(u.createdAt)}</span>
              <Link href={`/admin/users/${u.id}`} className="text-right text-[12.5px] font-semibold text-bronze hover:underline">Review →</Link>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
