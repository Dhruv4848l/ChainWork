"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

/*
  PUB-09 Contact. The form is a mock (no message is sent) — a real handler/provider
  plugs in later. FAQs are static copy from the design.
*/
const FAQS = [
  { q: "When do I get paid?", a: "The moment the Client approves the phase — or automatically when the review window runs out." },
  { q: "What if the Client disappears?", a: "Up to 2 reminders are sent, then the escrow auto-releases to you. You are never left waiting indefinitely." },
  { q: "Who decides disputes?", a: "A panel of 3, 5, or 7 verified peers — staked, anonymous to each other, voting commit-then-reveal." },
  { q: "Is this crypto?", a: "Under the hood, yes — a stablecoin in a smart contract. On screen, you see rupees and a normal wallet." },
];

const inputCls =
  "w-full rounded-lg border border-line-strong bg-card px-4 py-3.5 text-[15px] text-ink placeholder:text-ink3 focus:border-bronze focus:outline-none focus:ring-2 focus:ring-bronze";

export default function ContactPage() {
  const [sent, setSent] = useState(false);

  return (
    <section className="mx-auto grid max-w-4xl gap-14 px-6 py-24 md:grid-cols-2">
      <div>
        <h1 className="m-0 mb-8 font-display text-[clamp(36px,6vw,56px)] leading-[1.05] text-ink">
          Contact us
        </h1>
        {sent ? (
          <div className="rounded-2xl border border-emerald/40 bg-emerald/10 p-6 text-sm text-emerald">
            Thanks — we&apos;ve got your message and will be in touch. (Demo: nothing
            was actually sent.)
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSent(true);
            }}
            className="flex flex-col gap-3.5"
          >
            <input required placeholder="Your name" className={inputCls} />
            <input required placeholder="Email or phone" className={inputCls} />
            <textarea required placeholder="How can we help?" rows={5} className={`${inputCls} resize-y`} />
            <Button type="submit" variant="primary">Send Message</Button>
          </form>
        )}
      </div>

      <div>
        <h2 className="mb-5 text-xl font-semibold text-ink">Common questions</h2>
        <div className="flex flex-col gap-3">
          {FAQS.map((f) => (
            <div key={f.q} className="rounded-2xl border border-line bg-card p-6">
              <div className="mb-1.5 text-[15px] font-semibold text-ink">{f.q}</div>
              <div className="text-sm font-light leading-relaxed text-ink2">{f.a}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
