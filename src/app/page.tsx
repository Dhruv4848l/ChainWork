import Link from "next/link";
import { PublicNav } from "@/features/public/PublicNav";
import { PublicFooter } from "@/features/public/PublicFooter";
import { Hero } from "@/features/public/Hero";
import {
  getFeaturedJobs,
  getVerifiedWorkers,
  getCategoriesWithCounts,
  getBlogPosts,
} from "@/features/public/queries";

/*
  PUB-01 Home. Server component: fetches featured jobs / verified workers /
  categories / blog from the seed DB, then composes the marketing sections around
  the client-side cinematic <Hero />.
*/

const STEPS = [
  { n: "01", t: "Post or find work", d: "Clients post a job with roles, headcount and rates. Workers nearby see it instantly." },
  { n: "02", t: "Escrow locks the pay", d: "The moment you agree, the money moves into a smart contract — not our bank account." },
  { n: "03", t: "Work confirmed, paid instantly", d: "Both sides confirm, the escrow releases on the spot. Disputes go to a peer jury." },
];

const QUOTES = [
  { text: "I got paid the same evening the work was confirmed. No chasing anyone for weeks.", who: "Suresh P.", role: "Electrician, 140+ jobs" },
  { text: "The escrow badge changed everything — good workers actually apply when they can see the money is already locked.", who: "Anita R.", role: "Event planner, hires monthly" },
  { text: "We had one dispute. Five verified peers looked at the photos and chat, and it was settled in two days.", who: "Imran K.", role: "Client, small restaurant" },
];

const TRUST = ["Escrow-locked pay", "KYC-verified people", "Disputes settled by peers, not us"];

export default async function HomePage() {
  const [jobs, workers, categories, posts] = await Promise.all([
    getFeaturedJobs(3),
    getVerifiedWorkers(4),
    getCategoriesWithCounts(),
    getBlogPosts(3),
  ]);

  return (
    <>
      <PublicNav variant="hero" />
      <Hero />

      {/* Slide 2 — Jury statement */}
      <Section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(ellipse 60% 50% at 80% 50%, rgba(224,86,58,.08), transparent 70%)" }}
        />
        <div className="relative">
          <h2 className="m-0 mb-9 font-display text-[clamp(40px,6vw,84px)] leading-none text-ink">
            No Judges.
            <br />
            Just Your Peers.
          </h2>
          <p className="max-w-xl text-[17px] font-light leading-relaxed text-ink2">
            If a job goes sideways, it doesn&apos;t come down to one company&apos;s
            opinion. A panel of verified peers reviews the evidence and decides —
            transparent, staked, and fair.
          </p>
        </div>
      </Section>

      {/* How it works */}
      <Section>
        <Eyebrow>How it works</Eyebrow>
        <div className="grid gap-6 md:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="cw-3d rounded-2xl border border-line bg-card p-8">
              <div className="mb-4 font-display text-4xl text-bronze">{s.n}</div>
              <h3 className="mb-2.5 text-xl font-semibold text-ink">{s.t}</h3>
              <p className="text-[15px] font-light leading-relaxed text-ink2">{s.d}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Categories */}
      <Section>
        <SectionHead title="Every trade, one platform" href="/categories" cta="All categories →" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {categories.slice(0, 8).map((c) => (
            <Link
              key={c.id}
              href="/categories"
              className="cw-3d rounded-2xl border border-line bg-card p-6"
            >
              <div className="mb-1.5 text-[17px] font-semibold text-ink">
                {c.icon} {c.name}
              </div>
              <div className="text-[13px] text-ink3">{c.workerCount} workers</div>
            </Link>
          ))}
        </div>
      </Section>

      {/* Verified workers */}
      <Section>
        <SectionHead title="Verified workers" href="/categories" cta="Browse showcase →" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {workers.map((w) => (
            <div key={w.id} className="cw-3d flex flex-col gap-3 rounded-2xl border border-line bg-card p-6">
              <div className="flex h-14 w-14 items-center justify-center rounded-full border border-line bg-card2 font-display text-lg text-bronze">
                {w.name.charAt(0)}
              </div>
              <div>
                <div className="flex items-center gap-2 text-base font-semibold text-ink">
                  {w.name}
                  {w.certified && (
                    <span className="rounded-full border border-[#8FC7E8]/35 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#8FC7E8]">
                      Certified
                    </span>
                  )}
                </div>
                <div className="text-[13px] text-ink2">{w.trade}</div>
              </div>
              <div className="text-[13px] text-bronze">
                ★ {w.rating} <span className="text-ink3">· {w.jobs} jobs</span>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Featured jobs */}
      <Section>
        <SectionHead title="Open jobs right now" href="/jobs" cta="See all jobs →" />
        <div className="grid gap-4 md:grid-cols-3">
          {jobs.map((j) => (
            <Link
              key={j.id}
              href="/signup"
              className="cw-3d flex flex-col gap-2.5 rounded-2xl border border-line bg-card p-6"
            >
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
            </Link>
          ))}
        </div>
      </Section>

      {/* Testimonials */}
      <Section>
        <Eyebrow tone="emerald">What people say</Eyebrow>
        <div className="grid gap-6 md:grid-cols-3">
          {QUOTES.map((q) => (
            <div key={q.who} className="cw-3d rounded-2xl border border-line bg-card p-8">
              <p className="mb-5 text-[15px] font-light leading-relaxed text-ink">“{q.text}”</p>
              <div className="font-serif text-[15px] font-medium italic text-bronze">{q.who}</div>
              <div className="mt-0.5 text-xs text-ink3">{q.role}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* Blog */}
      <Section>
        <SectionHead title="From the blog" href="/blog" cta="All posts →" />
        <div className="grid gap-4 md:grid-cols-3">
          {posts.map((p) => (
            <Link
              key={p.id}
              href={`/blog/${p.slug}`}
              className="cw-3d overflow-hidden rounded-2xl border border-line bg-card"
            >
              <div className="flex h-36 items-center justify-center bg-card2 font-display text-3xl text-bronze/40">
                {p.tag}
              </div>
              <div className="p-6">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-bronze">{p.tag}</div>
                <div className="text-base font-semibold leading-snug text-ink">{p.title}</div>
                <div className="mt-2.5 text-xs text-ink3">
                  {p.authorName} · {p.readMinutes} min read
                </div>
              </div>
            </Link>
          ))}
        </div>
      </Section>

      {/* Trust band */}
      <section className="border-t border-line bg-card px-6 py-16">
        <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-3">
          {TRUST.map((t) => (
            <div key={t} className="flex items-center gap-3.5">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" className="shrink-0">
                <rect x="2" y="8" width="12" height="8" rx="4" stroke="#D9A066" strokeWidth="1.2" />
                <rect x="10" y="8" width="12" height="8" rx="4" stroke="#D9A066" strokeWidth="1.2" />
              </svg>
              <div className="text-[15px] font-medium text-ink">{t}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section
        className="border-t border-line px-6 py-32 text-center"
        style={{ background: "radial-gradient(ellipse 60% 70% at 50% 100%, rgba(217,160,102,.14), transparent 65%), var(--bg)" }}
      >
        <h2 className="m-0 mb-10 font-display text-[clamp(40px,5.5vw,72px)] text-ink">Ready when you are.</h2>
        <div className="flex flex-wrap justify-center gap-4">
          <Link href="/signup" className="cw-sheen cw-press rounded-full bg-bronze px-8 py-4 text-sm font-semibold text-[#1a1512] transition-colors hover:bg-bronze-hover">
            Find Work
          </Link>
          <Link href="/signup" className="rounded-full border border-line-strong px-8 py-4 text-sm font-medium text-ink transition-transform hover:scale-[1.04] hover:border-bronze">
            Post a Job
          </Link>
        </div>
      </section>

      <PublicFooter variant="full" />
    </>
  );
}

// ---- small presentational helpers ----
function Section({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`border-t border-line px-6 py-24 ${className}`}>
      <div className="mx-auto max-w-6xl">{children}</div>
    </section>
  );
}

function Eyebrow({ children, tone = "bronze" }: { children: React.ReactNode; tone?: "bronze" | "emerald" }) {
  return (
    <div className={`mb-9 text-[11px] font-semibold uppercase tracking-[0.2em] ${tone === "emerald" ? "text-emerald" : "text-bronze"}`}>
      {children}
    </div>
  );
}

function SectionHead({ title, href, cta }: { title: string; href: string; cta: string }) {
  return (
    <div className="mb-9 flex items-baseline justify-between gap-4">
      <h2 className="m-0 font-display text-4xl text-ink">{title}</h2>
      <Link href={href} className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-wider text-bronze hover:underline">
        {cta}
      </Link>
    </div>
  );
}
