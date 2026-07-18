"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";

/*
  WK-09 Post editor. Submission is stubbed — worker posts go through admin blog
  moderation (ADM-15), built in Phase 10.
*/
export function PostEditor() {
  const [msg, setMsg] = useState<string | null>(null);
  const [, start] = useTransition();

  function stub() {
    start(() => setMsg("Saved. Posts are reviewed before publishing — moderation is wired in Phase 10."));
  }

  return (
    <div className="flex max-w-2xl flex-col gap-3.5 rounded-2xl border border-line bg-card p-7">
      <input
        placeholder="Post title"
        className="rounded-[10px] border border-line-strong bg-bg px-4 py-3.5 text-[17px] font-semibold text-ink placeholder:text-ink3 focus:border-bronze focus:outline-none"
      />
      <div className="rounded-[10px] border border-dashed border-line-strong px-6 py-6 text-center text-[12.5px] text-ink3">
        Drop a cover image
      </div>
      <textarea
        rows={9}
        placeholder="Share something practical — what you check, how you price, what clients should know…"
        className="resize-y rounded-[10px] border border-line-strong bg-bg px-4 py-3.5 text-[14.5px] leading-relaxed text-ink placeholder:text-ink3 focus:border-bronze focus:outline-none"
      />
      {msg && <p className="rounded-lg border border-bronze/40 bg-bronze/10 px-3 py-2 text-sm text-bronze">{msg}</p>}
      <div className="flex items-center justify-between">
        <span className="text-xs text-ink3">Posts are reviewed before publishing.</span>
        <div className="flex gap-2.5">
          <Button variant="secondary" size="sm" onClick={stub}>Save Draft</Button>
          <Button variant="primary" size="sm" onClick={stub}>Submit for Review</Button>
        </div>
      </div>
    </div>
  );
}
