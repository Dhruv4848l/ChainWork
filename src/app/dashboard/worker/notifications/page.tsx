import { Card } from "@/components/ui";
import { PageTitle, EmptyState } from "@/features/shared/dashboard-ui";
import { requireRole } from "@/lib/auth/guards";
import { getNotifications } from "@/features/worker/queries";
import { formatDate } from "@/lib/format";

const TYPE_COLOR: Record<string, string> = {
  PAYMENT: "bg-emerald",
  ESCROW: "bg-[#8FC7E8]",
  DISPUTE: "bg-ember",
  REMINDER: "bg-amber",
  APPLICATION: "bg-bronze",
};

export default async function NotificationsPage() {
  const user = await requireRole("WORKER");
  const notifs = await getNotifications(user.id);

  if (notifs.length === 0) {
    return (
      <div className="max-w-2xl">
        <PageTitle>Notifications</PageTitle>
        <EmptyState title="You're all caught up" hint="New activity will show up here." />
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <PageTitle>Notifications</PageTitle>
      <Card className="overflow-hidden p-0">
        {notifs.map((n) => (
          <div
            key={n.id}
            className={`flex items-start gap-3.5 border-b border-hair px-6 py-4 last:border-b-0 ${n.read ? "" : "bg-bronze/[0.04]"}`}
          >
            <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${TYPE_COLOR[n.type] ?? "bg-ink3"}`} />
            <span className="flex-1">
              <span className="block text-[13.5px] text-ink">{n.title}</span>
              {n.body && <span className="mt-0.5 block text-[12.5px] text-ink2">{n.body}</span>}
              <span className="mt-1 block text-[11px] text-ink3">{formatDate(n.createdAt)}</span>
            </span>
          </div>
        ))}
      </Card>
    </div>
  );
}
