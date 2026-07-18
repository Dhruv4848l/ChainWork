import Link from "next/link";
import { Button, Card, StatusBadge } from "@/components/ui";
import { PageTitle, EmptyState } from "@/features/shared/dashboard-ui";
import { requireRole } from "@/lib/auth/guards";
import { platformDb } from "@/lib/platformDb";
import { formatDate } from "@/lib/format";

const STATUS_TONE = { PUBLISHED: "success", DRAFT: "draft", ARCHIVED: "draft" } as const;

export default async function MyPostsPage() {
  const user = await requireRole("WORKER");
  const posts = await platformDb.blogPost.findMany({
    where: { authorName: user.name },
    orderBy: { createdAt: "desc" },
  });

  const writeBtn = (
    <Link href="/dashboard/worker/posts/new">
      <Button variant="primary" size="sm">Write a Post</Button>
    </Link>
  );

  if (posts.length === 0) {
    return (
      <div>
        <PageTitle action={writeBtn}>My Posts</PageTitle>
        <EmptyState title="No posts yet" hint="Share something practical from your trade — it builds trust with clients." />
      </div>
    );
  }

  return (
    <div>
      <PageTitle action={writeBtn}>My Posts</PageTitle>
      <Card className="overflow-hidden p-0">
        {posts.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-3.5 border-b border-hair px-6 py-4 last:border-b-0">
            <span>
              <span className="block text-sm font-medium text-ink">{p.title}</span>
              <span className="mt-0.5 block text-[11.5px] text-ink3">{p.tag} · {formatDate(p.publishedAt)}</span>
            </span>
            <StatusBadge tone={STATUS_TONE[p.status as keyof typeof STATUS_TONE] ?? "draft"}>{p.status}</StatusBadge>
          </div>
        ))}
      </Card>
    </div>
  );
}
