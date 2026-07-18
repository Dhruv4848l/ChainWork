import { PageTitle, EmptyState } from "@/features/shared/dashboard-ui";
import { requireRole } from "@/lib/auth/guards";
import { getNotifications } from "@/features/client/queries";
import { NotificationCenter } from "@/features/shared/NotificationCenter";

export default async function ClientNotificationsPage() {
  const user = await requireRole("CLIENT");
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
      <NotificationCenter notifs={notifs} />
    </div>
  );
}
