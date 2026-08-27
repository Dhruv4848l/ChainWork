import Link from "next/link";
import { getCategoryShowcase } from "@/features/public/queries";

/*
  ISR: this page reads the database, so a purely static build would freeze its content
  at deploy time — category counts move as jobs are posted. Re-render at most once a
  minute instead.
*/
export const dynamic = "force-dynamic";

export const metadata = { title: "Categories — ChainWork" };

export default async function CategoriesPage() {
  const showcase = await getCategoryShowcase();
  return (
    <section className="mx-auto max-w-5xl px-6 py-24">
      <h1 className="m-0 mb-3 font-display text-[clamp(40px,7vw,64px)] leading-[1.05] text-ink">
        Browse by trade
      </h1>
      <p className="mb-12 text-[15px] font-light text-ink3">
        A showcase of verified workers per category. Sign in to see full profiles.
      </p>

      <div className="flex flex-col gap-12">
        {showcase.map((c) => (
          <div key={c.id}>
            <div className="mb-5 flex items-baseline gap-3.5">
              <h2 className="m-0 text-2xl font-semibold text-ink">
                {c.icon} {c.name}
              </h2>
              <span className="text-[13px] text-ink3">
                {c.workerCount} verified workers
              </span>
            </div>
            {c.workers.length === 0 && (
              <div className="rounded-2xl border border-dashed border-line-strong px-6 py-8 text-center">
                <p className="m-0 text-sm text-ink3">
                  A new domain — no verified workers yet.{" "}
                  <Link href="/signup" className="font-semibold text-bronze hover:underline">
                    Be the first to offer these skills →
                  </Link>
                </p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3.5 md:grid-cols-4">
              {c.workers.map((w) => (
                <div key={w.id} className="flex flex-col gap-2.5 rounded-2xl border border-line bg-card p-5">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border border-line bg-card2 font-display text-bronze">
                    {w.name.charAt(0)}
                  </div>
                  <div className="text-[15px] font-semibold text-ink">{w.name}</div>
                  <div className="text-xs text-bronze">★ {w.rating} · {w.jobs} jobs</div>
                  <Link href="/signup" className="text-[11px] font-semibold uppercase tracking-wider text-ink3 hover:text-bronze">
                    Sign in to view →
                  </Link>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
