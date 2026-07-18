import { requireAdmin } from "@/lib/admin/guards";
import { AdminChrome } from "@/features/admin/AdminChrome";
import { visibleNav, ADMIN_ROLE_LABEL } from "@/lib/admin/roles";

/*
  Shell for every console screen (ADM-02..19). Enforces an admin session and scopes
  the nav to the admin's role. Consumer sessions never reach here.
*/
export default async function AdminConsoleLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  return (
    <AdminChrome name={admin.name} roleLabel={ADMIN_ROLE_LABEL[admin.role]} nav={visibleNav(admin.role)}>
      {children}
    </AdminChrome>
  );
}
