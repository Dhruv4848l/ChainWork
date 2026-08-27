import Link from "next/link";
import { Card } from "@/components/ui";
import { requireRole } from "@/lib/auth/guards";
import { getWorkerProfile } from "@/features/worker/queries";
import { formatInr } from "@/lib/format";

/*
  WK-07 Rates. Two things live here:
   1) the worker's published reference charges (per hour / per week) — what a client
      sees on the profile and the applicant card, and what pre-fills the apply form;
   2) the skill list with proficiency, which is what those charges are *for*.
  Neither is binding: the number that counts is the rate agreed on each hire, and
  the money that actually moves is whatever the signed contract's phases say.
*/
export default async function RatesPage() {
  const user = await requireRole("WORKER");
  const data = await getWorkerProfile(user.id);
  const profile = data?.workerProfile;
  const skills = profile?.skills ?? [];
  const hourly = profile?.rateHourly ? Number(profile.rateHourly) : null;
  const weekly = profile?.rateWeekly ? Number(profile.rateWeekly) : null;

  return (
    <div className="max-w-2xl">
      <h1 className="mb-1.5 text-[28px] font-semibold text-ink">My Rates</h1>
      <p className="mb-5 text-[13.5px] text-ink3">
        What you charge, shown on your profile and pre-filled when you apply. The actual
        rate is agreed per job — and the amount that moves is what the signed contract says.
      </p>

      <Card className="mb-3.5 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="m-0 text-[15px] font-semibold text-ink">Published charges</h3>
          <Link href="/dashboard/worker/profile/edit" className="text-[12.5px] text-bronze hover:underline">
            Edit
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3.5">
          <RateTile label="Per hour" value={hourly} />
          <RateTile label="Per week" value={weekly} />
        </div>
        {!hourly && !weekly && (
          <p className="mt-3.5 text-[12.5px] text-amber">
            You haven&apos;t published a charge yet — clients filter on this. Add one from Edit Profile.
          </p>
        )}
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-line px-6 py-3.5 text-[10.5px] font-semibold uppercase tracking-wider text-ink3">
          Skills these rates cover
        </div>
        {skills.length === 0 && (
          <p className="p-6 text-sm text-ink3">Add skills to your profile to set reference rates.</p>
        )}
        {skills.map((s) => (
          <div
            key={s.id}
            className="grid grid-cols-[1.4fr_1fr_0.6fr] items-center gap-4 border-b border-hair px-6 py-4 last:border-b-0"
          >
            <span className="text-sm font-semibold text-ink">{s.skill.name}</span>
            <span className="text-xs text-ink3">{s.proficiency}</span>
            <Link
              href="/dashboard/worker/profile/edit"
              className="text-right text-[12.5px] text-ink2 hover:text-bronze"
            >
              Edit
            </Link>
          </div>
        ))}
      </Card>
    </div>
  );
}

function RateTile({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-xl border border-line bg-bg px-5 py-4">
      <div className="text-[10.5px] font-semibold uppercase tracking-wider text-ink3">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-bronze">
        {value ? formatInr(value) : <span className="text-ink3">Not set</span>}
      </div>
    </div>
  );
}
