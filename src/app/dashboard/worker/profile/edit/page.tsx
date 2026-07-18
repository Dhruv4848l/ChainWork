import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/guards";
import { getWorkerProfile, getAllSkills } from "@/features/worker/queries";
import { EditWorkerProfileForm } from "@/features/worker/EditWorkerProfileForm";

export default async function EditWorkerProfilePage() {
  const user = await requireRole("WORKER");
  const [data, allSkills] = await Promise.all([getWorkerProfile(user.id), getAllSkills()]);
  if (!data || !data.workerProfile) notFound();
  const p = data.workerProfile;

  return (
    <div className="max-w-2xl">
      <h1 className="mb-5 text-[28px] font-semibold text-ink">Edit Profile</h1>
      <EditWorkerProfileForm
        initial={{
          name: data.name,
          headline: p.headline ?? "",
          bio: p.bio ?? "",
          location: p.location ?? "",
          experienceYears: p.experienceYears,
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
