import { DashboardPlaceholder } from "@/features/auth/DashboardPlaceholder";
import { requireRole } from "@/lib/auth/guards";

export default async function ClientDashboardPage() {
  const user = await requireRole("CLIENT", "/dashboard/client");
  return <DashboardPlaceholder user={user} />;
}
