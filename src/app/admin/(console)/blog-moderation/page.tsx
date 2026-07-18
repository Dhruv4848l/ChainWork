import { Card, StatusBadge } from "@/components/ui";
import { EmptyState } from "@/features/shared/dashboard-ui";
import { requireAdminAccess } from "@/lib/admin/guards";
import { bridgeBlogQueue } from "@/lib/admin/bridge";
import { moderateBlogAction } from "@/features/admin/actions";
import { AdminActionButton } from "@/features/admin/AdminActionButton";
import { formatDate } from "@/lib/format";

const TONE = { PUBLISHED: "success", DRAFT: "draft", ARCHIVED: "draft" } as const;

export default async function BlogModerationPage() {
  await requireAdminAccess("blogMod");
  const posts = await bridgeBlogQueue();

  return (
    <div>
      <h1 className="mb-1 text-[26px] font-semibold text-ink">Blog Moderation</h1>
      <p className="mb-5 text-[13px] text-ink3">Worker posts are reviewed before publishing.</p>
      {posts.length === 0 ? (
        <EmptyState title="No posts to review" />
      ) : (
        <div className="flex flex-col gap-3">
          {posts.map((p) => (
            <Card key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-5">
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="text-[15px] font-semibold text-ink">{p.title}</span>
                  <StatusBadge tone={TONE[p.status as keyof typeof TONE] ?? "draft"}>{p.status}</StatusBadge>
                </div>
                <div className="mt-0.5 text-[12px] text-ink3">{p.author} · {p.tag} · {formatDate(p.createdAt)}</div>
              </div>
              <div className="flex gap-2">
                <AdminActionButton label="Archive" variant="danger" run={moderateBlogAction.bind(null, p.id, "ARCHIVE")} />
                <AdminActionButton label="Publish" variant="success" run={moderateBlogAction.bind(null, p.id, "PUBLISH")} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
