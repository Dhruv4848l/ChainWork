"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { AddFundsForm } from "@/features/wallet/AddFundsForm";
import { formatInr } from "@/lib/format";
import { lockStakeAction } from "./actions";

/*
  WK-11 delivery stake (payment plan P3.6). Contracts above the platform threshold need
  a refundable stake from the worker before the client can fund phase 1. It comes from
  the worker's real balance; a shortfall offers Add funds prefilled with the gap.
*/
export function StakePanel({ hireId, amountInr, totalInr }: { hireId: string; amountInr: number; totalInr: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [receiptNo, setReceiptNo] = useState<string | null>(null);
  const [shortfall, setShortfall] = useState<number | null>(null);

  const lock = () =>
    start(async () => {
      const r = await lockStakeAction(hireId);
      setMsg(r.message ?? r.error ?? null);
      setReceiptNo(r.receiptNo ?? null);
      setShortfall(r.code === "INSUFFICIENT_BALANCE" ? r.shortfallInr ?? null : null);
      if (r.ok) router.refresh();
    });

  return (
    <div className="mb-4 rounded-xl border border-amber/40 bg-amber/10 px-5 py-4 text-[13px] text-ink2">
      <p>
        <span className="font-semibold text-amber">Delivery stake needed:</span> this contract ({formatInr(totalInr)}) asks you to lock a
        refundable stake of <span className="font-semibold text-ink">{formatInr(amountInr)}</span>{" "}in escrow. It comes back to you when the
        hire completes; it goes to the client only if you abandon a phase. The client can fund phase 1 once it&apos;s locked.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button size="sm" variant="primary" disabled={pending} onClick={lock}>
          {pending ? "Locking…" : `Lock ${formatInr(amountInr)} stake`}
        </Button>
        {msg && (
          <span className="text-xs text-ink3">
            {msg}{" "}
            {receiptNo && (
              <a href={`/api/receipts/${receiptNo}/pdf`} className="font-medium text-bronze hover:underline">
                Download receipt
              </a>
            )}
          </span>
        )}
      </div>
      {shortfall != null && (
        <div className="mt-3 rounded-lg border border-line bg-card p-3">
          <AddFundsForm defaultAmount={shortfall} hint={`Your wallet is ${formatInr(shortfall)} short. Add funds, then lock the stake.`} />
        </div>
      )}
    </div>
  );
}
