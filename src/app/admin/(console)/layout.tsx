import { requireAdmin } from "@/lib/admin/guards";
import { AdminChrome } from "@/features/admin/AdminChrome";
import { visibleNav, ADMIN_ROLE_LABEL, canAccess } from "@/lib/admin/roles";
import { bridgeOpenFlagCount } from "@/lib/admin/bridge";

/*
  Shell for every console screen (ADM-02..19). Enforces an admin session and scopes
  the nav to the admin's role. Consumer sessions never reach here.
*/
export default async function AdminConsoleLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  // Sidebar badges: things waiting on an admin (only for roles that can open the page).
  const badges = canAccess(admin.role, "payments") ? { payments: await bridgeOpenFlagCount() } : {};
  return (
    <AdminChrome name={admin.name} roleLabel={ADMIN_ROLE_LABEL[admin.role]} nav={visibleNav(admin.role)} badges={badges}>
      {children}
    </AdminChrome>
  );
}
