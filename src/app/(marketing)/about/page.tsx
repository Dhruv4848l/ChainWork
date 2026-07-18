export const metadata = { title: "About — ChainWork" };

const STATS = [
  { v: "48K", k: "Jobs completed" },
  { v: "₹31 Cr", k: "Total paid out" },
  { v: "12", k: "Cities live" },
];

export default function AboutPage() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-24">
      <div className="mb-5 text-[11px] font-semibold uppercase tracking-[0.2em] text-bronze">
        About ChainWork
      </div>
      <h1 className="m-0 mb-8 font-display text-[clamp(40px,7vw,64px)] leading-[1.05] text-ink">
        Closing the trust gap in daily-wage work
      </h1>
      <p className="max-w-2xl text-[17px] font-light leading-[1.7] text-ink2">
        Millions of skilled workers — electricians, cooks, drivers, decorators,
        cleaners — are hired by the hour or the day with nothing protecting either
        side. ChainWork puts every agreement into a blockchain escrow and every
        serious dispute in front of a jury of verified peers. No chasing payments.
        No one-sided verdicts.
      </p>
      <div className="mt-16 grid gap-4 sm:grid-cols-3">
        {STATS.map((s) => (
          <div key={s.k} className="rounded-2xl border border-line bg-card p-8">
            <div className="font-display text-5xl text-bronze">{s.v}</div>
            <div className="mt-2 text-xs font-semibold uppercase tracking-wider text-ink3">
              {s.k}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
