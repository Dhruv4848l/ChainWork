import Link from "next/link";
import { notFound } from "next/navigation";
import { Button, Card, StatusBadge } from "@/components/ui";
import { requireRole } from "@/lib/auth/guards";
import { getWorkerProfile } from "@/features/worker/queries";
import { formatInr } from "@/lib/format";

export default async function WorkerProfilePage() {
  const user = await requireRole("WORKER");
  const data = await getWorkerProfile(user.id);
  if (!data || !data.workerProfile) notFound();
  const p = data.workerProfile;

  const ratingRows = [
    { k: "Punctuality", v: p.ratingPunctuality },
    { k: "Quality", v: p.ratingQuality },
    { k: "Communication", v: p.ratingCommunication },
  ];
  const facts = [
    { k: "Experience", v: `${p.experienceYears} years` },
    { k: "Charge / hour", v: p.rateHourly ? formatInr(Number(p.rateHourly)) : "—" },
    { k: "Charge / week", v: p.rateWeekly ? formatInr(Number(p.rateWeekly)) : "—" },
    { k: "Location", v: p.location ?? "—" },
    { k: "Availability", v: p.availability ?? "—" },
    { k: "Languages", v: p.languages.join(", ") || "—" },
  ];

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="m-0 text-[28px] font-semibold text-ink">
          My Profile <span className="text-[13px] font-normal text-ink3">— as clients see it</span>
        </h1>
        <Link href="/dashboard/worker/profile/edit">
          <Button variant="secondary" size="sm">Edit Profile</Button>
        </Link>
      </div>

      <Card className="mb-3.5 flex flex-col gap-6 p-7 sm:flex-row sm:items-start">
        <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-full border border-bronze/40 bg-card2 font-display text-3xl text-bronze">
          {data.name.charAt(0)}
        </div>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="m-0 text-[22px] font-semibold text-ink">{data.name}</h2>
            <StatusBadge tone={data.kycTier === "UNVERIFIED" ? "draft" : "warning"}>
              {data.kycTier}
            </StatusBadge>
          </div>
          <p className="my-3 max-w-xl text-[13.5px] leading-relaxed text-ink2">
            {p.bio ?? "No bio yet — add one so clients know your specialties."}
          </p>
          <div className="flex flex-wrap gap-2">
            {p.skills.map((s) => (
              <span
                key={s.id}
                className="rounded-full border border-bronze/30 px-3.5 py-1.5 text-xs font-medium text-bronze"
              >
                {s.skill.name}
              </span>
            ))}
          </div>
        </div>
        <div className="flex-shrink-0 text-right">
          <div className="text-2xl font-semibold text-bronze">★ {p.ratingAvg.toFixed(1)}</div>
          <div className="text-[11.5px] text-ink3">{p.completedJobsCount} jobs completed</div>
        </div>
      </Card>

      <div className="grid gap-3.5 md:grid-cols-2">
        <Card className="p-6">
          <h3 className="mb-4 text-[15px] font-semibold text-ink">Ratings breakdown</h3>
          {ratingRows.map((r) => (
            <div key={r.k} className="mb-3 flex items-center gap-3.5">
              <span className="w-28 text-[13px] text-ink2">{r.k}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg">
                <div className="h-full bg-bronze" style={{ width: `${(r.v / 5) * 100}%` }} />
              </div>
              <span className="text-[13px] font-semibold text-bronze">{r.v.toFixed(1)}</span>
            </div>
          ))}
          <h3 className="mb-3 mt-5 text-[15px] font-semibold text-ink">Details</h3>
          {facts.map((f) => (
            <div key={f.k} className="flex justify-between border-b border-hair py-2 text-[13px] last:border-b-0">
              <span className="text-ink3">{f.k}</span>
              <span className="text-right text-ink">{f.v}</span>
            </div>
          ))}
        </Card>

        <Card className="p-6">
          <h3 className="mb-3.5 text-[15px] font-semibold text-ink">Portfolio</h3>
          <div className="mb-5 grid grid-cols-3 gap-2.5">
            {(p.portfolioImages.length ? p.portfolioImages : ["Add work photos"]).map((label, i) => (
              <div
                key={i}
                className="flex aspect-square items-center justify-center rounded-[10px] border border-hair bg-card2 p-1 text-center text-[9px] text-ink3"
              >
                {label}
              </div>
            ))}
          </div>
          <h3 className="mb-2.5 text-[15px] font-semibold text-ink">Documents</h3>
          <div className="flex items-center justify-between border-b border-hair py-2.5 text-[13px]">
            <span className="text-ink2">Government ID</span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald">
              {data.kycTier === "UNVERIFIED" ? "Not submitted" : "Verified · private"}
            </span>
          </div>
        </Card>
      </div>
    </div>
  );
}
