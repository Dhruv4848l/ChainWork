import Link from "next/link";
import { requireRole } from "@/lib/auth/guards";
import { PostEditor } from "@/features/worker/PostEditor";

export default async function NewPostPage() {
  await requireRole("WORKER");
  return (
    <div>
      <Link href="/dashboard/worker/posts" className="mb-4 inline-block text-[12.5px] font-semibold uppercase tracking-wider text-bronze hover:underline">
        ← My posts
      </Link>
      <PostEditor />
    </div>
  );
}
