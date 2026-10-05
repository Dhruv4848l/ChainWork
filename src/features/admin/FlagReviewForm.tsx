"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { reviewFlagAction } from "./actions";

/*
  ADM-10: close a flagged wallet payment with a note on what was done (contacted the payer,
  agreed a fix, …). Audit-logged server-side. Refunding from the escrow is not offered here:
  a refunded escrow slot can never be funded again on the current contract.
*/
export function FlagReviewForm({ flagId }: { flagId: string }) {
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [pending, start] = useTransition();
  const inputId = `flag-note-${flagId}`;

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await reviewFlagAction(flagId, note);
          setMsg({ text: r.message ?? r.error ?? "", ok: !r.error });
          if (!r.error) setNote("");
        });
      }}
    >
      <label htmlFor={inputId} className="text-[11px] font-semibold uppercase tracking-wider text-ink3">
        What was done
      </label>
      <textarea
        id={inputId}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        maxLength={1000}
        placeholder="e.g. Contacted the payer; agreed to re-pay the phase correctly."
        className="w-full resize-y rounded-lg border border-line bg-card2 px-3 py-2 text-[13px] text-ink outline-none focus:border-bronze"
      />
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" variant="primary" disabled={pending || note.trim().length < 5}>
          {pending ? "Saving…" : "Mark reviewed"}
        </Button>
        {msg && <span className={`text-[12px] ${msg.ok ? "text-emerald" : "text-ember"}`}>{msg.text}</span>}
      </div>
    </form>
  );
}
