import { DashboardPlaceholder } from "@/features/auth/DashboardPlaceholder";
import { requireRole } from "@/lib/auth/guards";

export default async function WorkerDashboardPage() {
  const user = await requireRole("WORKER", "/dashboard/worker");
  return <DashboardPlaceholder user={user} />;
}
