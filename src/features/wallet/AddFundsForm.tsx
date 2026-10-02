"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { addFundsAction } from "./actions";

/*
  Add funds — the mock fiat on-ramp, and since payment plan P3.1 the ONLY way money
  enters a wallet (funding a phase no longer tops up a shortfall behind the scenes).
  Used in the Payments / Earnings header, and inline under a phase whose funding failed
  for lack of balance, prefilled with the exact shortfall.
*/
export function AddFundsForm({
  defaultAmount = 10000,
  label = "Add funds",
  hint,
}: {
  defaultAmount?: number;
  label?: string;
  hint?: string;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState(String(defaultAmount));
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await addFundsAction(Number(amount));
      setMsg({ text: r.message ?? r.error ?? "", ok: !r.error });
      if (!r.error) router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-1.5">
      {hint && <p className="text-xs text-ink2">{hint}</p>}
      <div className="flex items-center gap-2">
        <label className="flex items-center rounded-lg border border-line bg-card2 pl-2.5 text-[13px] text-ink3 focus-within:border-bronze">
          ₹
          <input
            type="number"
            inputMode="numeric"
            min={100}
            max={500000}
            step={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-label="Amount to add, in rupees"
            className="w-24 bg-transparent px-1.5 py-1.5 text-[13px] text-ink outline-none"
          />
        </label>
        <Button type="submit" size="sm" variant="primary" disabled={pending}>
          {pending ? "Adding…" : label}
        </Button>
      </div>
      {msg && <p className={`text-xs ${msg.ok ? "text-emerald" : "text-ember"}`}>{msg.text}</p>}
    </form>
  );
}
