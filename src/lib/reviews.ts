import "server-only";
import { platformDb } from "@/lib/platformDb";
import type { ReviewDirection } from "@/generated/platform";
import { notify } from "@/lib/notify";

/*
  Reviews (WK-14 / CL-10). A review can only be left on a COMPLETED hire, by a party
  to that hire, once per direction. Creating a CLIENT_TO_WORKER review recomputes the
  worker's aggregate rating — which in turn feeds juror eligibility (min-rating gate)
  and how the worker ranks in search.
*/

export type ReviewInput = {
  hireId: string;
  authorId: string;
  direction: ReviewDirection;
  overall: number;
  punctuality?: number;
  quality?: number;
  communication?: number;
  text?: string;
};

const clamp = (n: number | undefined) => (n == null ? null : Math.max(1, Math.min(5, Math.round(n))));

export async function submitReview(input: ReviewInput): Promise<{ ok?: boolean; error?: string; message?: string }> {
  const hire = await platformDb.hire.findUnique({
    where: { id: input.hireId },
    include: { job: true },
  });
  if (!hire) return { error: "Hire not found." };

  // Author must be the correct party for the review's direction.
  const expectedAuthor = input.direction === "CLIENT_TO_WORKER" ? hire.clientId : hire.workerId;
  const subjectId = input.direction === "CLIENT_TO_WORKER" ? hire.workerId : hire.clientId;
  if (input.authorId !== expectedAuthor) return { error: "You can't review this hire." };

  if (hire.status !== "COMPLETED") return { error: "You can only review a completed hire." };
  if (!input.overall || input.overall < 1) return { error: "Give an overall rating." };

  const existing = await platformDb.review.findUnique({
    where: { hireId_direction: { hireId: input.hireId, direction: input.direction } },
  });
  if (existing) return { error: "You've already reviewed this hire." };

  await platformDb.review.create({
    data: {
      hireId: input.hireId,
      direction: input.direction,
      authorId: input.authorId,
      subjectId,
      ratingOverall: clamp(input.overall)!,
      ratingPunctuality: clamp(input.punctuality),
      ratingQuality: clamp(input.quality),
      ratingCommunication: clamp(input.communication),
      text: input.text?.trim() || null,
    },
  });

  // A review OF a worker updates their aggregate rating (feeds juror eligibility + ranking).
  if (input.direction === "CLIENT_TO_WORKER") await recomputeWorkerRating(subjectId);

  await notify({
    userId: subjectId,
    type: "REVIEW",
    title: "You received a review",
    body: `${clamp(input.overall)}★ for "${hire.job.title}".`,
    linkUrl: input.direction === "CLIENT_TO_WORKER" ? "/dashboard/worker/reviews" : "/dashboard/client/reviews",
  });

  return { ok: true, message: "Review submitted — thank you." };
}

const avg = (nums: number[]) => (nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10 : 0);

/** Recompute a worker's aggregate rating fields from all reviews they've received. */
async function recomputeWorkerRating(workerUserId: string) {
  const reviews = await platformDb.review.findMany({
    where: { subjectId: workerUserId, direction: "CLIENT_TO_WORKER" },
    select: { ratingOverall: true, ratingPunctuality: true, ratingQuality: true, ratingCommunication: true },
  });
  const nn = (vals: (number | null)[]) => vals.filter((v): v is number => v != null);
  await platformDb.workerProfile.updateMany({
    where: { userId: workerUserId },
    data: {
      ratingAvg: avg(reviews.map((r) => r.ratingOverall)),
      ratingPunctuality: avg(nn(reviews.map((r) => r.ratingPunctuality))),
      ratingQuality: avg(nn(reviews.map((r) => r.ratingQuality))),
      ratingCommunication: avg(nn(reviews.map((r) => r.ratingCommunication))),
    },
  });
}
