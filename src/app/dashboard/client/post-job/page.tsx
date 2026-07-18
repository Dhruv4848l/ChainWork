import { requireRole } from "@/lib/auth/guards";
import { getCategoriesWithSkills } from "@/features/client/queries";
import { PostJobBuilder } from "@/features/client/PostJobBuilder";

export default async function PostJobPage() {
  await requireRole("CLIENT");
  const categories = await getCategoriesWithSkills();
  return (
    <PostJobBuilder
      categories={categories.map((c) => ({
        id: c.id,
        name: c.name,
        skills: c.skills.map((s) => ({ id: s.id, name: s.name })),
      }))}
    />
  );
}
