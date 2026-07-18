import { Card } from "@/components/ui";
import { PageTitle, EmptyState } from "@/features/shared/dashboard-ui";
import { requireRole } from "@/lib/auth/guards";
import { getClientReviews, getClientReviewableHires } from "@/features/client/queries";
import { ReviewForm } from "@/features/shared/ReviewForm";
import { submitReviewAction } from "@/features/client/actions";

export default async function ClientReviewsPage() {
  const user = await requireRole("CLIENT");
  const [reviews, reviewable] = await Promise.all([
    getClientReviews(user.id),
    getClientReviewableHires(user.id),
  ]);

  return (
    <div className="max-w-2xl">
      <PageTitle>Reviews</PageTitle>

      {reviewable.length > 0 && (
        <section className="mb-7">
          <h2 className="mb-2.5 text-[13px] font-semibold uppercase tracking-wider text-ink3">
            Rate your workers ({reviewable.length})
          </h2>
          <div className="flex flex-col gap-3">
            {reviewable.map((h) => (
              <ReviewForm key={h.hireId} hireId={h.hireId} who={h.who} job={h.job} submitAction={submitReviewAction} />
            ))}
          </div>
        </section>
      )}

      <h2 className="mb-2.5 text-[13px] font-semibold uppercase tracking-wider text-ink3">Reviews from workers</h2>
      {reviews.length === 0 ? (
        <EmptyState title="No reviews yet" hint="Workers review you after a completed hire — they'll appear here." />
      ) : (
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
      )}
    </div>
  );
}
