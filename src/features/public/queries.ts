import "server-only";
import { platformDb } from "@/lib/platformDb";

/*
  Read-only queries for the public marketing site. All data comes from the Platform
  DB seed (Phase 1) so the marketing pages show real content, not placeholders.
*/

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export function formatInr(n: number): string {
  return inr.format(n);
}

/** PUBLISHED jobs with their first role's rate, for the home + jobs teaser. */
export async function getFeaturedJobs(limit = 6) {
  const jobs = await platformDb.job.findMany({
    where: { status: "PUBLISHED" },
    include: { category: true, roleLineItems: true },
    orderBy: { publishedAt: "desc" },
    take: limit,
  });
  return jobs.map((j) => {
    const rate = j.roleLineItems[0]?.perPersonRate;
    return {
      id: j.id,
      title: j.title,
      category: j.category.name,
      location: j.location ?? "Nearby",
      urgent: j.urgent,
      pay: rate ? `${formatInr(Number(rate))} / person` : "Rate on request",
    };
  });
}

/** Verified/Trusted workers for the home showcase + categories page. */
export async function getVerifiedWorkers(limit = 8) {
  const workers = await platformDb.user.findMany({
    where: { role: "WORKER", kycTier: { in: ["VERIFIED", "TRUSTED"] } },
    include: {
      workerProfile: {
        include: { skills: { include: { skill: { include: { category: true } } } } },
      },
    },
    orderBy: { workerProfile: { completedJobsCount: "desc" } },
    take: limit,
  });
  return workers.map((w) => ({
    id: w.id,
    name: w.name,
    trade: w.workerProfile?.skills[0]?.skill.name ?? "Worker",
    rating: w.workerProfile?.ratingAvg?.toFixed(1) ?? "—",
    jobs: w.workerProfile?.completedJobsCount ?? 0,
    certified: w.kycTier === "TRUSTED",
  }));
}

/** Categories with an approximate worker count (workers who list a skill in it). */
export async function getCategoriesWithCounts() {
  const categories = await platformDb.category.findMany({
    include: {
      skills: { include: { _count: { select: { workerSkills: true } } } },
    },
    orderBy: { name: "asc" },
  });
  return categories.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    icon: c.icon,
    workerCount: c.skills.reduce((sum, s) => sum + s._count.workerSkills, 0),
  }));
}

/** A per-category showcase of verified workers (PUB-07). */
export async function getCategoryShowcase() {
  // Every domain is browsable (Fiverr-style) — ones with verified workers first,
  // new/empty domains still listed so the catalog is visible.
  const categories = (await getCategoriesWithCounts()).sort((a, b) => b.workerCount - a.workerCount);
  const withWorkers = await Promise.all(
    categories.map(async (c) => {
      const workers = await platformDb.user.findMany({
        where: {
          role: "WORKER",
          kycTier: { in: ["VERIFIED", "TRUSTED"] },
          workerProfile: { skills: { some: { skill: { categoryId: c.id } } } },
        },
        include: { workerProfile: true },
        take: 4,
      });
      return {
        ...c,
        workers: workers.map((w) => ({
          id: w.id,
          name: w.name,
          rating: w.workerProfile?.ratingAvg?.toFixed(1) ?? "—",
          jobs: w.workerProfile?.completedJobsCount ?? 0,
        })),
      };
    })
  );
  return withWorkers;
}

/** Published blog posts (PUB-05). */
export async function getBlogPosts(limit = 6) {
  return platformDb.blogPost.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
    take: limit,
  });
}

/** A single blog post by slug (PUB-06). */
export async function getBlogPost(slug: string) {
  return platformDb.blogPost.findUnique({ where: { slug } });
}
