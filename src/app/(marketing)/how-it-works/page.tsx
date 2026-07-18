"use client";

import { useState } from "react";

/*
  PUB-03 How it works — a For Workers / For Clients toggle over two step lists.
*/
const WORKER_STEPS = [
  { n: "01", t: "Build your profile", d: "Add your trades, experience, languages, availability, and photos of past work. Verify your phone in a minute." },
  { n: "02", t: "Apply to nearby jobs", d: "Filter by distance, budget, date, and urgency. See whether the Client has already funded escrow before you apply." },
  { n: "03", t: "Work with the pay already locked", d: "The moment you're hired, the money sits in a smart contract. Check in on site, share progress photos, mark each phase delivered." },
  { n: "04", t: "Get paid the moment it's confirmed", d: "The Client approves — or the review window runs out — and the escrow releases straight to your wallet. Withdraw to bank or UPI." },
];
const CLIENT_STEPS = [
  { n: "01", t: "Post a job with roles", d: "One post can hire a whole crew — each role with its own headcount and rate. Your exact address stays hidden until you hire." },
  { n: "02", t: "Review applicants fast", d: "Ratings, verification tier, portfolios, and a Fit Score to triage large pools. Message before you commit." },
  { n: "03", t: "Fund escrow to lock it in", d: "Funding up front gets you a 'Funded' badge and more applicants. The money sits in a smart contract, not our account." },
  { n: "04", t: "Confirm and release", d: "Approve each phase when the work is done — or request changes. If it goes wrong, a peer jury decides, not us." },
];

export default function HowItWorksPage() {
  const [tab, setTab] = useState<"worker" | "client">("worker");
  const steps = tab === "worker" ? WORKER_STEPS : CLIENT_STEPS;

  return (
    <section className="mx-auto max-w-3xl px-6 py-24">
      <h1 className="m-0 mb-10 font-display text-[clamp(40px,7vw,64px)] leading-[1.05] text-ink">
        How it works
      </h1>

      <div className="mb-12 inline-flex rounded-full border border-line bg-card p-1">
        {(["worker", "client"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-6 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
              tab === t ? "bg-bronze text-[#1a1512]" : "text-ink2"
            }`}
          >
            {t === "worker" ? "For Workers" : "For Clients"}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-5">
        {steps.map((s) => (
          <div key={s.n} className="flex items-start gap-6 rounded-2xl border border-line bg-card p-8">
            <div className="font-display text-4xl leading-none text-bronze">{s.n}</div>
            <div>
              <h3 className="mb-2 text-xl font-semibold text-ink">{s.t}</h3>
              <p className="text-[15px] font-light leading-relaxed text-ink2">{s.d}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
