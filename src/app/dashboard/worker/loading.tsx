import { Skeleton, SkeletonList } from "@/features/shared/dashboard-ui";

/* Shown while any Worker screen's data is in flight — a shimmer, never a spinner. */
export default function WorkerLoading() {
  return (
    <div className="max-w-3xl">
      <Skeleton className="mb-6 h-8 w-52" />
      <SkeletonList rows={6} />
    </div>
  );
}
