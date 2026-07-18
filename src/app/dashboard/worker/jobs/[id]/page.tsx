import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, StatusBadge } from "@/components/ui";
import { requireRole } from "@/lib/auth/guards";
import { getJobDetail } from "@/features/worker/queries";
import { platformDb } from "@/lib/platformDb";
import { ApplyForm } from "@/features/worker/ApplyForm";
import { formatInr, shortDate } from "@/lib/format";

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("WORKER");
  const { id } = await params;
  const job = await getJobDetail(id);
  if (!job) notFound();

  const alreadyApplied = await platformDb.jobApplication.findFirst({
    where: { jobId: id, workerId: user.id },
  });

  const roles = job.roleLineItems.map((r) => ({
    id: r.id,
    roleName: r.roleName,
    rate: Number(r.perPersonRate),
  }));

  return (
    <div className="max-w-3xl">
      <Link href="/dashboard/worker/find-jobs" className="mb-4 inline-block text-[12.5px] font-semibold uppercase tracking-wider text-bronze hover:underline">
        ← Back to jobs
      </Link>

      <Card className="mb-3.5 p-7">
        <div className="flex items-start justify-between gap-5">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2.5">
              <h1 className="m-0 text-2xl font-semibold text-ink">{job.title}</h1>
              {job.urgent && (
                <span className="rounded-full border border-amber/35 px-2.5 py-1 text-[9.5px] font-semibold uppercase tracking-wider text-amber">
                  Urgent
                </span>
              )}
            </div>
            <div className="text-[13px] text-ink3">
              {job.category.name} · {job.location ?? "Nearby"} · from {shortDate(job.startDate)} to {shortDate(job.endDate)}
            </div>
          </div>
          <div className="flex-shrink-0 text-right">
            <div className="text-[22px] font-semibold text-bronze">
              {roles[0] ? formatInr(roles[0].rate) : "—"}
            </div>
            <div className="text-[11.5px] text-ink3">per person</div>
          </div>
        </div>

        <p className="my-4 text-[14.5px] font-light leading-relaxed text-ink2">{job.description}</p>

        {/* Roles */}
        <div className="mb-5 flex flex-col gap-2">
          {job.roleLineItems.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-xl border border-hair bg-bg px-4 py-3">
              <span className="text-sm font-medium text-ink">
                {r.roleName} <span className="text-ink3">· {r.headcount - r.hiredCount} of {r.headcount} open</span>
              </span>
              <span className="text-sm font-semibold text-bronze">{formatInr(Number(r.perPersonRate))}</span>
            </div>
          ))}
        </div>

        {/* Client card */}
        <div className="flex items-center justify-between rounded-xl border border-[#8FC7E8]/25 bg-bg px-5 py-3.5">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-card2 text-sm text-bronze">
              {job.client.name.charAt(0)}
            </span>
            <div>
              <div className="text-[13.5px] font-semibold text-ink">
                {job.client.name}
                {job.client.kycTier !== "UNVERIFIED" && (
                  <StatusBadge tone="warning" className="ml-2">Verified</StatusBadge>
                )}
              </div>
              <div className="text-[11.5px] text-ink3">
                {job.client.clientProfile?.companyName ?? "Individual client"}
              </div>
            </div>
          </div>
          <div className="text-right text-[11.5px] text-[#8FC7E8]">
            {job.fundingMode === "FUND_NOW" ? "Escrow already funded" : "Funds at hire"}
          </div>
        </div>
      </Card>

      {alreadyApplied ? (
        <Card className="flex items-center justify-between p-5">
          <span className="text-sm text-ink2">You&apos;ve applied to this job.</span>
          <StatusBadge tone="info">{alreadyApplied.status}</StatusBadge>
        </Card>
      ) : (
        <ApplyForm jobId={job.id} roles={roles} />
      )}
    </div>
  );
}
