import Link from "next/link";
import { notFound } from "next/navigation";
import { getBlogPost } from "@/features/public/queries";

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getBlogPost(slug);
  if (!post || post.status !== "PUBLISHED") notFound();

  return (
    <article className="mx-auto max-w-2xl px-6 py-24">
      <Link
        href="/blog"
        className="mb-8 inline-block text-xs font-semibold uppercase tracking-wider text-bronze hover:underline"
      >
        ← All posts
      </Link>
      <div className="mb-4 text-[10px] font-semibold uppercase tracking-wider text-bronze">
        {post.tag}
      </div>
      <h1 className="m-0 mb-5 font-display text-[clamp(34px,6vw,52px)] leading-[1.08] text-ink">
        {post.title}
      </h1>
      <div className="mb-10 font-serif text-[15px] italic text-ink3">
        {post.authorName} · {post.readMinutes} min read
      </div>
      <div className="mb-10 flex h-64 items-center justify-center rounded-2xl bg-card2 font-display text-4xl text-bronze/40">
        {post.tag}
      </div>
      <div className="flex flex-col gap-6">
        {post.body.split("\n\n").map((para, i) => (
          <p key={i} className="text-base font-light leading-[1.75] text-ink2">
            {para}
          </p>
        ))}
      </div>
    </article>
  );
}
