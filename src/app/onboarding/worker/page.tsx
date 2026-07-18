import { AuthShell } from "@/features/auth/AuthShell";
import { WorkerOnboardingForm } from "@/features/auth/WorkerOnboardingForm";
import { requireRole } from "@/lib/auth/guards";
import { platformDb } from "@/lib/platformDb";

export default async function WorkerOnboardingPage() {
  await requireRole("WORKER", "/onboarding/worker");
  const skills = await platformDb.skill.findMany({
    include: { category: true },
    orderBy: { name: "asc" },
  });
  return (
    <AuthShell>
      <WorkerOnboardingForm
        skills={skills.map((s) => ({ id: s.id, name: s.name, category: s.category.name }))}
      />
    </AuthShell>
  );
}
