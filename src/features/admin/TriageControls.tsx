"use client";

import { useState, useTransition } from "react";
import { triageComplaintAction } from "./actions";

/*
  ADM-06 four-lane triage: trivial → support, policy → super-admin, financial → jury,
  fraud → compliance. Financial-lane routing escalates to a jury case.
*/
const LANES: { key: "TRIVIAL" | "POLICY" | "FINANCIAL" | "FRAUD"; label: string }[] = [
  { key: "TRIVIAL", label: "Trivial → Support" },
  { key: "POLICY", label: "Policy → Super Admin" },
  { key: "FINANCIAL", label: "Financial → Jury" },
  { key: "FRAUD", label: "Fraud → Compliance" },
];

export function TriageControls({ complaintId }: { complaintId: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {LANES.map((l) => (
        <button
          key={l.key}
          disabled={pending}
          onClick={() => start(async () => setMsg((await triageComplaintAction(complaintId, l.key)).message ?? null))}
          className={`rounded-full border px-3 py-1.5 text-[11.5px] font-medium transition-colors disabled:opacity-50 ${
            l.key === "FINANCIAL" ? "border-amber/40 text-amber hover:bg-amber/[0.08]" : "border-line-strong text-ink2 hover:border-bronze"
          }`}
        >
          {l.label}
        </button>
      ))}
      {msg && <span className="w-full text-[11px] text-ink3">{msg}</span>}
    </div>
  );
}
