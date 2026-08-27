import Link from "next/link";
import { getBlogPosts } from "@/features/public/queries";

/*
  ISR: this page reads the database, so a purely static build would freeze its content
  at deploy time — posts are published/moderated from the admin console. Re-render at
  most once a minute instead.
*/
export const dynamic = "force-dynamic";

export const metadata = { title: "Blog — ChainWork" };

export default async function BlogPage() {
  const posts = await getBlogPosts(12);
  return (
    <section className="mx-auto max-w-5xl px-6 py-24">
      <h1 className="m-0 mb-12 font-display text-[clamp(40px,7vw,64px)] leading-[1.05] text-ink">
        The Blog
      </h1>
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
        {posts.map((p) => (
          <Link
            key={p.id}
            href={`/blog/${p.slug}`}
            className="overflow-hidden rounded-2xl border border-line bg-card transition-colors hover:border-bronze/50"
          >
            <div className="flex h-40 items-center justify-center bg-card2 font-display text-3xl text-bronze/40">
              {p.tag}
            </div>
            <div className="p-6">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-bronze">
                {p.tag}
              </div>
              <div className="text-base font-semibold leading-snug text-ink">{p.title}</div>
              <div className="mt-2.5 font-serif text-[13px] italic text-ink3">
                {p.authorName} · {p.readMinutes} min
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
