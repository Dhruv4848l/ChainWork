import { Card, StatusBadge } from "@/components/ui";
import { explorerTxBase } from "@/lib/chain/config";
import { formatInr, shortDate, shortHash } from "@/lib/format";
import type { HistoryRow, HistoryState } from "./paymentHistory";
import { StatementDownload } from "./StatementDownload";

/*
  Transactions with receipts (payment plan P2.7) — shared by WK-12 Earnings and CL-08
  Payments. Every final payment links its PDF receipt, failed ones included.
*/

const TONE: Record<HistoryState, "success" | "danger" | "draft" | "warning"> = {
  done: "success",
  failed: "danger",
  cancelled: "draft",
  processing: "warning",
};

export function TransactionsCard({ rows, title = "Transactions" }: { rows: HistoryRow[]; title?: string }) {
  const explorer = explorerTxBase();
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-line px-6 py-3.5">
        <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
        <span className="text-[11px] text-ink3">Receipts include failed attempts</span>
      </div>
      {rows.length === 0 && <p className="p-6 text-sm text-ink3">No transactions yet.</p>}
      <ul>
        {rows.map((t) => {
          const muted = t.state !== "done";
          const sign = t.direction === "in" ? "+" : t.direction === "out" ? "−" : "";
          const amountColor = muted ? "text-ink3" : t.direction === "in" ? "text-emerald" : t.direction === "out" ? "text-ink" : "text-ink2";
          return (
            <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-hair px-6 py-3.5 last:border-b-0">
              <span className="min-w-0 flex-1 basis-56">
                <span className="block text-[13px] font-medium text-ink">{t.label}</span>
                <span className="block truncate text-[11px] text-ink3">
                  {t.context} · {shortDate(t.at)}
                </span>
              </span>
              <span className={`w-28 text-right text-[13.5px] font-semibold tabular-nums ${amountColor} ${t.state === "failed" ? "line-through" : ""}`}>
                {sign}{formatInr(t.amountInr)}
              </span>
              <span className="w-24">
                <StatusBadge tone={TONE[t.state]}>{t.stateLabel}</StatusBadge>
              </span>
              <span className="flex w-36 flex-col items-end gap-0.5 text-right">
                {t.receiptNo ? (
                  <a
                    href={`/api/receipts/${t.receiptNo}/pdf`}
                    className="text-[12px] font-medium text-bronze hover:underline focus-visible:outline-2 focus-visible:outline-bronze"
                    aria-label={`Download receipt ${t.receiptNo}`}
                  >
                    Download receipt
                  </a>
                ) : (
                  <span className="text-[11px] text-ink3">{t.state === "processing" ? "Receipt when final" : "—"}</span>
                )}
                {t.txHash &&
                  (explorer ? (
                    <a href={`${explorer}${t.txHash}`} target="_blank" rel="noreferrer" className="font-mono text-[10.5px] text-ink3 hover:text-bronze">
                      {shortHash(t.txHash)} ↗
                    </a>
                  ) : (
                    <span className="font-mono text-[10.5px] text-ink3" title="No explorer on the local chain">{shortHash(t.txHash)}</span>
                  ))}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="border-t border-line px-6 py-4">
        <p className="mb-2.5 text-[12px] text-ink2">Account statement for a date range — every line cites its receipt.</p>
        <StatementDownload />
      </div>
    </Card>
  );
}
