import Link from "next/link";
import { getFeaturedJobs } from "@/features/public/queries";

/*
  ISR: this page reads the database, so a purely static build would freeze its content
  at deploy time — the public job board must reflect newly posted jobs. Re-render at
  most once a minute instead.
*/
export const dynamic = "force-dynamic";

export const metadata = { title: "Open jobs — ChainWork" };

export default async function JobsPage() {
  const jobs = await getFeaturedJobs(12);
  return (
    <section className="mx-auto max-w-5xl px-6 py-24">
      <h1 className="m-0 mb-3 font-display text-[clamp(40px,7vw,64px)] leading-[1.05] text-ink">
        Open jobs
      </h1>
      <p className="mb-12 text-[15px] font-light text-ink3">
        A live look at what&apos;s being hired for right now. Sign in to apply.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
        {jobs.map((j) => (
          <div key={j.id} className="flex flex-col gap-2.5 rounded-2xl border border-line bg-card p-6">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-ink3">{j.category}</span>
              {j.urgent && (
                <span className="rounded-full border border-amber/35 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber">
                  Urgent
                </span>
              )}
            </div>
            <div className="text-[17px] font-semibold text-ink">{j.title}</div>
            <div className="text-[13px] text-ink2">{j.location}</div>
            <div className="text-[15px] font-medium text-bronze">{j.pay}</div>
            <Link
              href="/signup"
              className="mt-2 rounded-full bg-bronze py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-[#1a1512] hover:bg-bronze-hover"
            >
              Sign in to apply
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
