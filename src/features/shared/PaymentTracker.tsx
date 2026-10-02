"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "./Toast";
import { useRefreshPortfolio } from "@/features/wallet/ticker/usePortfolio";

/*
  Pending-transaction tracker (payment plan P5.3). Follows one payment that is still in
  flight: polls GET /api/payments/:id every 10 s (paused while the tab is hidden) and
  shows "Confirming… n/12 blocks". When it finalises: a toast with the receipt link, a
  page refresh, and an immediate wallet-balance refresh.
*/

interface PaymentStatusView {
  id: string;
  label: string;
  status: string;
  final: boolean;
  confirmations: number | null;
  confirmationsTarget: number;
  failureReason: string | null;
  receiptNo: string | null;
}

const POLL_MS = 10_000;

export function PaymentTracker({ paymentId, onFinal }: { paymentId: string; onFinal?: (p: PaymentStatusView) => void }) {
  const router = useRouter();
  const toast = useToast();
  const refreshPortfolio = useRefreshPortfolio();
  const announced = useRef(false);

  const { data } = useQuery<PaymentStatusView>({
    queryKey: ["payment", paymentId],
    queryFn: async ({ signal }) => {
      const res = await fetch(`/api/payments/${paymentId}`, { signal, cache: "no-store" });
      if (!res.ok) throw new Error(`payment ${res.status}`);
      return res.json();
    },
    refetchInterval: (q) => (q.state.data?.final ? false : POLL_MS),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!data?.final || announced.current) return;
    announced.current = true;
    const action = data.receiptNo ? { label: "Download receipt", href: `/api/receipts/${data.receiptNo}/pdf` } : undefined;
    if (data.status === "CONFIRMED") toast(`${data.label} — confirmed.`, "success", action);
    else toast(`${data.label} — ${data.failureReason ?? "didn't go through."}`, "error", action);
    refreshPortfolio();
    router.refresh();
    onFinal?.(data);
  }, [data, toast, refreshPortfolio, router, onFinal]);

  if (!data) return <span className="text-[11px] text-ink3">Checking status…</span>;
  if (data.final) {
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${data.status === "CONFIRMED" ? "border-emerald/40 text-emerald" : "border-ember/40 text-ember"}`}>
        {data.status === "CONFIRMED" ? "✓ Confirmed" : "✗ " + (data.status === "CANCELLED" ? "Cancelled" : "Failed")}
        {data.receiptNo && (
          <a href={`/api/receipts/${data.receiptNo}/pdf`} className="font-medium text-bronze hover:underline">
            receipt
          </a>
        )}
      </span>
    );
  }
  const n = data.confirmations;
  return (
    <span role="status" className="inline-flex items-center gap-1.5 rounded-full border border-amber/40 bg-amber/10 px-2.5 py-1 text-[11px] font-semibold text-amber">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber" aria-hidden />
      {n == null || n === 0 ? "Waiting for the network…" : `Confirming… ${Math.min(n, data.confirmationsTarget)}/${data.confirmationsTarget} blocks`}
    </span>
  );
}
