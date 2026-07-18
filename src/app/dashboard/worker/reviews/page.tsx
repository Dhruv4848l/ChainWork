import { Card } from "@/components/ui";
import { PageTitle, EmptyState } from "@/features/shared/dashboard-ui";
import { requireRole } from "@/lib/auth/guards";
import { getWorkerReviews, getWorkerReviewableHires } from "@/features/worker/queries";
import { ReviewForm } from "@/features/shared/ReviewForm";
import { submitReviewAction } from "@/features/worker/actions";

export default async function ReviewsPage() {
  const user = await requireRole("WORKER");
  const [reviews, reviewable] = await Promise.all([
    getWorkerReviews(user.id),
    getWorkerReviewableHires(user.id),
  ]);

  return (
    <div className="max-w-2xl">
      <PageTitle>Reviews</PageTitle>

      {reviewable.length > 0 && (
        <section className="mb-7">
          <h2 className="mb-2.5 text-[13px] font-semibold uppercase tracking-wider text-ink3">
            Awaiting your review ({reviewable.length})
          </h2>
          <div className="flex flex-col gap-3">
            {reviewable.map((h) => (
              <ReviewForm key={h.hireId} hireId={h.hireId} who={h.who} job={h.job} submitAction={submitReviewAction} />
            ))}
          </div>
        </section>
      )}

      <h2 className="mb-2.5 text-[13px] font-semibold uppercase tracking-wider text-ink3">Reviews received</h2>
      {reviews.length === 0 ? (
        <EmptyState title="No reviews yet" hint="Complete a hire and your client's review will appear here." />
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
              {r.text && <p className="m-0 mb-3.5 text-[13.5px] font-light leading-relaxed text-ink2">“{r.text}”</p>}
              <div className="flex flex-wrap gap-4.5">
                {[
                  ["Punctuality", r.ratingPunctuality],
                  ["Quality", r.ratingQuality],
                  ["Communication", r.ratingCommunication],
                ].map(([k, v]) =>
                  v == null ? null : (
                    <span key={String(k)} className="text-[11.5px] text-ink3">
                      {k} <span className="font-semibold text-bronze">{String(v)}</span>
                    </span>
                  )
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
