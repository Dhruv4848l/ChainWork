import { Card } from "@/components/ui";
import { PageTitle, EmptyState } from "@/features/shared/dashboard-ui";
import { requireRole } from "@/lib/auth/guards";
import { getClientReviews } from "@/features/client/queries";

export default async function ClientReviewsPage() {
  const user = await requireRole("CLIENT");
  const reviews = await getClientReviews(user.id);

  if (reviews.length === 0) {
    return (
      <div className="max-w-2xl">
        <PageTitle>Reviews</PageTitle>
        <EmptyState title="No reviews yet" hint="Workers review you after a completed hire — they'll appear here." />
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <PageTitle>Reviews from workers</PageTitle>
      <div className="flex flex-col gap-3">
        {reviews.map((r) => (
          <Card key={r.id} className="p-6">
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-sm font-semibold text-ink">
                {r.author.name} <span className="text-xs font-normal text-ink3">· {r.hire.job.title}</span>
              </span>
              <span className="text-[15px] font-semibold text-bronze">★ {r.ratingOverall}</span>
            </div>
            {r.text && <p className="m-0 text-[13.5px] font-light leading-relaxed text-ink2">“{r.text}”</p>}
          </Card>
        ))}
      </div>
    </div>
  );
}
