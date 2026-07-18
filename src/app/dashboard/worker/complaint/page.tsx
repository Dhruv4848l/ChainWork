import { Card, StatusBadge } from "@/components/ui";
import { requireRole } from "@/lib/auth/guards";
import { getWorkerHireOptions, getWorkerComplaints } from "@/features/worker/queries";
import { ComplaintForm } from "@/features/worker/ComplaintForm";
import { formatDate } from "@/lib/format";

export default async function ComplaintPage({
  searchParams,
}: {
  searchParams: Promise<{ hire?: string }>;
}) {
  const user = await requireRole("WORKER");
  const { hire } = await searchParams;
  const [hires, complaints] = await Promise.all([
    getWorkerHireOptions(user.id),
    getWorkerComplaints(user.id),
  ]);

  return (
    <div className="max-w-2xl">
      <h1 className="mb-4.5 text-[28px] font-semibold text-ink">File a Complaint</h1>
      <ComplaintForm
        hires={hires.map((h) => ({ id: h.id, title: h.job.title }))}
        defaultHireId={hire}
      />

      {complaints.length > 0 && (
        <Card className="p-6">
          <h3 className="mb-4 text-[15px] font-semibold text-ink">Your complaints</h3>
          {complaints.map((c) => (
            <div key={c.id} className="flex items-center justify-between border-b border-hair py-3 last:border-b-0">
              <span>
                <span className="block text-[13.5px] font-medium text-ink">{c.hire.job.title}</span>
                <span className="block text-[11.5px] text-ink3">{c.category} · filed {formatDate(c.createdAt)}</span>
              </span>
              <StatusBadge tone={c.status === "RESOLVED" ? "success" : c.status === "ESCALATED" ? "warning" : "info"}>
                {c.status}
              </StatusBadge>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
