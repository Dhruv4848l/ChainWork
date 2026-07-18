import { Card, StatusBadge } from "@/components/ui";
import { requireRole } from "@/lib/auth/guards";
import { getClientHireOptions, getClientComplaints } from "@/features/client/queries";
import { ClientComplaintForm } from "@/features/client/ClientComplaintForm";
import { formatDate } from "@/lib/format";

export default async function ClientComplaintPage({
  searchParams,
}: {
  searchParams: Promise<{ hire?: string }>;
}) {
  const user = await requireRole("CLIENT");
  const { hire } = await searchParams;
  const [hires, complaints] = await Promise.all([
    getClientHireOptions(user.id),
    getClientComplaints(user.id),
  ]);

  return (
    <div className="max-w-2xl">
      <h1 className="mb-2 text-[28px] font-semibold text-ink">File a Complaint</h1>
      <p className="mb-4.5 max-w-xl text-[13.5px] leading-relaxed text-ink3">
        Once work has started, cancelling routes here — a pro-rated settlement is proposed first,
        and a peer jury decides if it&apos;s contested.
      </p>
      <ClientComplaintForm
        hires={hires.map((h) => ({ id: h.id, label: `${h.job.title} · ${h.worker.name}` }))}
        defaultHireId={hire}
      />

      {complaints.length > 0 && (
        <Card className="mt-4 p-6">
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
