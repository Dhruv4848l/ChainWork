import Link from "next/link";
import { Card } from "@/components/ui";
import { requireRole } from "@/lib/auth/guards";
import { getWorkerProfile } from "@/features/worker/queries";

/*
  WK-07 Rates. Reference rates are derived from the worker's skills (there's no
  separate Rate table yet). Editing routes to the profile editor.
*/
export default async function RatesPage() {
  const user = await requireRole("WORKER");
  const data = await getWorkerProfile(user.id);
  const skills = data?.workerProfile?.skills ?? [];

  return (
    <div className="max-w-2xl">
      <h1 className="mb-1.5 text-[28px] font-semibold text-ink">My Rates</h1>
      <p className="mb-5 text-[13.5px] text-ink3">
        Reference rates shown on your profile and pre-filled when you apply. The actual
        rate is agreed per job.
      </p>
      <Card className="overflow-hidden p-0">
        {skills.length === 0 && <p className="p-6 text-sm text-ink3">Add skills to your profile to set reference rates.</p>}
        {skills.map((s) => (
          <div key={s.id} className="grid grid-cols-[1.4fr_1fr_0.6fr] items-center gap-4 border-b border-hair px-6 py-4 last:border-b-0">
            <span className="text-sm font-semibold text-ink">{s.skill.name}</span>
            <span className="text-xs text-ink3">{s.proficiency}</span>
            <Link href="/dashboard/worker/profile/edit" className="text-right text-[12.5px] text-ink2 hover:text-bronze">
              Edit
            </Link>
          </div>
        ))}
      </Card>
    </div>
  );
}
