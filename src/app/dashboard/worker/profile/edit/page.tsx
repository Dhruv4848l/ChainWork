import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/guards";
import { getWorkerProfile, getAllSkills } from "@/features/worker/queries";
import { EditWorkerProfileForm } from "@/features/worker/EditWorkerProfileForm";
import { AvatarUpload, PortfolioUpload } from "@/features/media/ImageUpload";

export default async function EditWorkerProfilePage() {
  const user = await requireRole("WORKER");
  const [data, allSkills] = await Promise.all([getWorkerProfile(user.id), getAllSkills()]);
  if (!data || !data.workerProfile) notFound();
  const p = data.workerProfile;

  return (
    <div className="max-w-2xl">
      <h1 className="mb-5 text-[28px] font-semibold text-ink">Edit Profile</h1>

      <div className="mb-7 flex flex-col gap-6 rounded-2xl border border-line bg-card p-6">
        <div>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-ink3">Profile photo</p>
          <AvatarUpload name={data.name} initialUrl={data.avatarUrl} />
        </div>
        <div>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-ink3">
            Work photos &amp; proof
          </p>
          <PortfolioUpload initialImages={p.portfolioImages} />
        </div>
      </div>

      <EditWorkerProfileForm
        initial={{
          name: data.name,
          headline: p.headline ?? "",
          bio: p.bio ?? "",
          location: p.location ?? "",
          experienceYears: p.experienceYears,
          rateHourly: p.rateHourly ? String(p.rateHourly) : "",
          rateWeekly: p.rateWeekly ? String(p.rateWeekly) : "",
          availability: p.availability ?? "",
          languages: p.languages.join(", "),
        }}
        currentSkills={p.skills.map((s) => ({
          skillId: s.skillId,
          name: s.skill.name,
          proficiency: s.proficiency,
        }))}
        allSkills={allSkills.map((s) => ({ id: s.id, name: s.name }))}
      />
    </div>
  );
}
