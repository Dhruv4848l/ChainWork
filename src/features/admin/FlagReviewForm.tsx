"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { refundFlagAction, reviewFlagAction } from "./actions";

/*
  ADM-10: close a flagged wallet payment — either refund it to whoever paid it (PhaseEscrow v3:
  the phase can then be funded again correctly), or record a note on what was done. Both are
  audit-logged server-side. On a v1/v2 escrow the refund is not offered: it would close the
  phase's escrow slot for good.
*/
export function FlagReviewForm({ flagId, canRefund, amount, payer }: { flagId: string; canRefund: boolean; amount: string; payer: string }) {
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();

  const refund = () =>
    start(async () => {
      const r = await refundFlagAction(flagId);
      setMsg({ text: r.message ?? r.error ?? "", ok: !r.error });
      setConfirming(false);
    });
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
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" variant="primary" disabled={pending || note.trim().length < 5}>
          {pending && !confirming ? "Saving…" : "Mark reviewed"}
        </Button>
        {canRefund && !confirming && (
          <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => setConfirming(true)}>
            Refund to payer
          </Button>
        )}
      </div>
      {canRefund && confirming && (
        <div className="flex flex-wrap items-center gap-2.5 rounded-lg border border-ember/40 bg-ember/10 px-3 py-2.5 text-[12.5px] text-ink2">
          <span>Send {amount} back to {payer}? The phase stays open to be paid again correctly.</span>
          <Button type="button" size="sm" variant="primary" disabled={pending} onClick={refund}>
            {pending ? "Refunding…" : "Confirm refund"}
          </Button>
          <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </div>
      )}
      {!canRefund && (
        <p className="text-[11.5px] text-ink3">Refund to payer becomes available once the escrow contract is upgraded to v3.</p>
      )}
      {msg && <span className={`text-[12px] ${msg.ok ? "text-emerald" : "text-ember"}`}>{msg.text}</span>}
    </form>
  );
}
