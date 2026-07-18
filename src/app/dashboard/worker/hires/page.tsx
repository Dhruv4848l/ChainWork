import Link from "next/link";
import { Button, Card, StatusBadge } from "@/components/ui";
import { PageTitle, EmptyState } from "@/features/shared/dashboard-ui";
import { hireStatusDisplay } from "@/features/shared/status";
import { requireRole } from "@/lib/auth/guards";
import { getWorkerHires } from "@/features/worker/queries";
import { formatInr, shortDate } from "@/lib/format";

export default async function HiresPage() {
  const user = await requireRole("WORKER");
  const hires = await getWorkerHires(user.id);

  if (hires.length === 0) {
    return (
      <div>
        <PageTitle>Active Hires</PageTitle>
        <EmptyState title="No hires yet" hint="Once a client accepts your application, the hire shows up here." />
      </div>
    );
  }

  return (
    <div>
      <PageTitle>Active Hires</PageTitle>
      <div className="grid gap-3.5 md:grid-cols-2">
        {hires.map((h) => {
          const d = hireStatusDisplay(h.status);
          return (
            <Card key={h.id} className="p-6">
              <div className="mb-3 flex items-start justify-between gap-2.5">
                <div>
                  <div className="text-base font-semibold text-ink">{h.job.title}</div>
                  <div className="mt-0.5 text-xs text-ink3">
                    {h.client.name} · {shortDate(h.createdAt)}
                  </div>
                </div>
                <StatusBadge tone={d.tone}>{d.label}</StatusBadge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[15px] font-semibold text-bronze">{formatInr(Number(h.totalValue))}</span>
                <Link href={`/dashboard/worker/hires/${h.id}`}>
                  <Button variant="secondary" size="sm">Open</Button>
                </Link>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
