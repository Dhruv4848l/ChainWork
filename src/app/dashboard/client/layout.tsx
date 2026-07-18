import { requireRole } from "@/lib/auth/guards";
import { ClientChrome } from "@/features/client/ClientChrome";
import { getEscrowTotal, getUnreadNotificationCount } from "@/features/client/queries";

/*
  Shell for every Client screen (CL-01..13). Enforces the CLIENT role and loads the
  top-bar escrow total.
*/
export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("CLIENT");
  const [escrow, unreadCount] = await Promise.all([
    getEscrowTotal(user.id),
    getUnreadNotificationCount(user.id),
  ]);
  return (
    <ClientChrome name={user.name} kycTier={user.kycTier} escrowTotal={escrow} unreadCount={unreadCount}>
      {children}
    </ClientChrome>
  );
}
