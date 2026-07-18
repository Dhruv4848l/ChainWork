"use client";

import { devLoginAction } from "./actions";

/*
  DEV-ONLY quick login. Renders only in development (the page guards on NODE_ENV).
  Click a seeded user to be logged in instantly, skipping OTP — saves time in the
  later phases. Never rendered in production.
*/
const SEEDED = [
  { email: "ravi@chainwork.dev", label: "Ravi Kumar", role: "Worker · Verified" },
  { email: "suresh@chainwork.dev", label: "Suresh Patel", role: "Worker · Trusted" },
  { email: "imran@chainwork.dev", label: "Imran K.", role: "Client · Individual" },
  { email: "events@chainwork.dev", label: "R. Events & Decor", role: "Client · Business" },
];

export function DevLoginPanel() {
  return (
    <div className="mt-6 w-full max-w-md rounded-2xl border border-dashed border-line-strong bg-card2 p-5">
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-ink3">
        Dev quick login (dev only)
      </p>
      <div className="grid grid-cols-2 gap-2">
        {SEEDED.map((u) => (
          <button
            key={u.email}
            onClick={() => devLoginAction(u.email)}
            className="rounded-lg border border-line bg-bg px-3 py-2 text-left transition-colors hover:border-bronze"
          >
            <span className="block text-sm font-medium text-ink">{u.label}</span>
            <span className="block text-[11px] text-ink3">{u.role}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
