import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, StatusBadge } from "@/components/ui";
import { applicationStatusDisplay } from "@/features/shared/status";
import { requireRole } from "@/lib/auth/guards";
import { getJobApplicants } from "@/features/client/queries";
import { ApplicantActions } from "@/features/client/ApplicantActions";
import { formatInr } from "@/lib/format";

// A quick heuristic "Fit Score" from rating + completed jobs (real Fit modelling is future scope).
function fitScore(rating: number, jobs: number): number {
  return Math.min(99, Math.round(rating * 16 + Math.min(jobs, 200) * 0.06));
}

export default async function ApplicantsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("CLIENT");
  const { id } = await params;
  const job = await getJobApplicants(id, user.id);
  if (!job) notFound();

  return (
    <div>
      <Link href="/dashboard/client/jobs" className="mb-3.5 inline-block text-[12.5px] font-semibold uppercase tracking-wider text-bronze hover:underline">
        ← My jobs
      </Link>
      <h1 className="mb-1 text-[26px] font-semibold text-ink">Applicants — {job.title}</h1>
      <p className="mb-5 text-[13px] text-ink3">
        Accepting creates a hire (escrow funded separately). Partial hiring is allowed — hire fewer
        than the headcount and leave slots open.
      </p>

      <div className="flex flex-col gap-6">
        {job.roleLineItems.map((role) => (
          <div key={role.id}>
            <div className="mb-3 flex items-baseline gap-3">
              <h2 className="m-0 text-lg font-semibold text-ink">{role.roleName}</h2>
              <span className="text-[13px] text-ink3">
                {role.hiredCount} of {role.headcount} filled · {formatInr(Number(role.perPersonRate))}/person
              </span>
            </div>
            {role.applications.length === 0 && (
              <Card className="p-5 text-sm text-ink3">No applicants for this role yet.</Card>
            )}
            <div className="flex flex-col gap-3">
              {role.applications.map((a) => {
                const wp = a.worker.workerProfile;
                const rating = wp?.ratingAvg ?? 0;
                const jobs = wp?.completedJobsCount ?? 0;
                const fit = fitScore(rating, jobs);
                const d = applicationStatusDisplay(a.status);
                const decided = a.status !== "APPLIED" && a.status !== "UNDER_REVIEW";
                return (
                  <Card key={a.id} className="flex flex-wrap items-center gap-4 p-5">
                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-card2 text-bronze">
                      {a.worker.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={a.worker.avatarUrl} alt={a.worker.name} className="h-full w-full object-cover" />
                      ) : (
                        a.worker.name.charAt(0)
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2.5">
                        <span className="text-[15px] font-semibold text-ink">{a.worker.name}</span>
                        <StatusBadge tone={a.worker.kycTier === "UNVERIFIED" ? "draft" : "warning"}>
                          {a.worker.kycTier}
                        </StatusBadge>
                      </div>
                      <div className="mt-0.5 text-xs text-ink3">
                        ★ {rating.toFixed(1)} · {jobs} jobs · {wp?.experienceYears ?? 0} yrs · {wp?.location ?? "nearby"}
                      </div>
                      <div className="mt-0.5 text-xs text-ink3">
                        Published charge:{" "}
                        <span className="text-bronze">
                          {wp?.rateHourly ? `${formatInr(Number(wp.rateHourly))}/hr` : null}
                          {wp?.rateHourly && wp?.rateWeekly ? " · " : null}
                          {wp?.rateWeekly ? `${formatInr(Number(wp.rateWeekly))}/wk` : null}
                          {!wp?.rateHourly && !wp?.rateWeekly ? "not published" : null}
                        </span>
                        {a.proposedRate ? (
                          <>
                            {" · Quoted for this job: "}
                            <span className="font-semibold text-ink">{formatInr(Number(a.proposedRate))}</span>
                          </>
                        ) : null}
                      </div>
                      {a.coverNote && <div className="mt-1.5 text-[12.5px] font-light text-ink2">“{a.coverNote}”</div>}
                    </div>
                    <div className="flex-shrink-0 px-2 text-center">
                      <div className="text-xl font-semibold text-bronze">{fit}</div>
                      <div className="text-[9.5px] font-semibold uppercase tracking-wider text-ink3">Fit score</div>
                    </div>
                    {decided ? (
                      <StatusBadge tone={d.tone}>{d.label}</StatusBadge>
                    ) : (
                      <ApplicantActions applicationId={a.id} />
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
