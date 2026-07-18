export const metadata = { title: "Pricing — ChainWork" };

export default function PricingPage() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-24">
      <h1 className="m-0 mb-4 font-display text-[clamp(40px,7vw,64px)] leading-[1.05] text-ink">
        Simple, honest fees
      </h1>
      <p className="mb-12 text-base font-light text-ink2">
        No subscriptions. ChainWork earns only when work gets done.
      </p>

      <div className="mb-10 grid gap-4 sm:grid-cols-2">
        <PriceCard side="For Workers" pct="5%" note="Deducted from each released payment. Nothing to apply, message, or withdraw." />
        <PriceCard side="For Clients" pct="3%" note="Added at escrow funding. Posting jobs and reviewing applicants is free." />
      </div>

      <div className="flex items-start gap-4 rounded-2xl border border-line-strong bg-card2 p-8">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="mt-0.5 shrink-0">
          <rect x="2" y="8" width="12" height="8" rx="4" stroke="#D9A066" strokeWidth="1.2" />
          <rect x="10" y="8" width="12" height="8" rx="4" stroke="#D9A066" strokeWidth="1.2" />
        </svg>
        <div>
          <h3 className="mb-2 text-lg font-semibold text-ink">
            Where does the money actually sit?
          </h3>
          <p className="text-[15px] font-light leading-relaxed text-ink2">
            When a Client funds a job, the money moves into a smart contract — a
            locked digital vault that neither the Client, the Worker, nor ChainWork
            can open alone. It only opens when both sides confirm the work, when a
            review window runs out, or when a peer jury decides. Your money never
            sits in ChainWork&apos;s bank account.
          </p>
        </div>
      </div>
    </section>
  );
}

function PriceCard({ side, pct, note }: { side: string; pct: string; note: string }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-9">
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-ink3">
        {side}
      </div>
      <div className="font-display text-6xl text-bronze">{pct}</div>
      <p className="mt-3 text-sm font-light leading-relaxed text-ink2">{note}</p>
    </div>
  );
}
