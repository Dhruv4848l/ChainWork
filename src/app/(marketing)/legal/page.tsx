export const metadata = { title: "Terms of Service — ChainWork" };

const SECTIONS = [
  { h: "1. The Platform", b: "ChainWork is a marketplace connecting people who post local, physical work with people who perform it. ChainWork is not the employer of any Worker and is not a party to the work agreement itself, except as the operator of the escrow and dispute infrastructure described below." },
  { h: "2. Escrow & Payments", b: "Funds for a Hire are held in an on-chain smart-contract escrow, denominated in a stablecoin and displayed in local currency. Release requires confirmation by both parties, expiry of the verification window, or a Jury verdict. Platform commission is deducted at release." },
  { h: "3. Disputes & Jury", b: "Financial disputes over active escrow are decided by a panel of staked, verified platform members using commit-then-reveal voting. Each party may appeal once, to a larger panel, within the stated window and for the stated fee. Jury verdicts execute automatically on-chain." },
  { h: "4. Cancellations", b: "Cancellation before work begins may incur the configured penalty. Once work has started, cancellation is treated as a completion dispute and routes through pro-rated settlement, escalatable to the Jury." },
  { h: "5. Your Data", b: "Messages, check-ins, and uploaded evidence tied to a Hire are retained and may be presented to a Jury if that Hire is disputed. Identity documents are visible only to verification staff and are never shared with other users." },
];

export default function LegalPage() {
  return (
    <section className="mx-auto grid max-w-4xl gap-12 px-6 py-24 md:grid-cols-[200px_1fr]">
      <nav className="hidden self-start md:sticky md:top-24 md:flex md:flex-col md:gap-2.5">
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink3">
          On this page
        </div>
        {SECTIONS.map((s) => (
          <span key={s.h} className="text-[13px] text-ink2">{s.h}</span>
        ))}
      </nav>
      <div>
        <h1 className="m-0 mb-2 font-display text-[clamp(34px,6vw,52px)] leading-[1.05] text-ink">
          Terms of Service
        </h1>
        <div className="mb-10 text-[13px] text-ink3">Last updated July 2026</div>
        {SECTIONS.map((s) => (
          <div key={s.h} className="mb-9">
            <h2 className="mb-3 text-xl font-semibold text-ink">{s.h}</h2>
            <p className="m-0 text-[15px] font-light leading-[1.7] text-ink2">{s.b}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
