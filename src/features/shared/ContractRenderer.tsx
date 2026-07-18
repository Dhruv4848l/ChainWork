import { formatInr, formatDate, shortHash } from "@/lib/format";

/*
  ContractRenderer — the shared read-only contract card (WK-11 / CL-07): parties,
  total value, dates, scope, cancellation terms, on-chain escrow address, the
  "accepted in-app by both parties" assurance line, and a Download PDF button.
  Presentational + server-compatible.
*/

export type ContractView = {
  parties: string; // "Ravi Kumar ↔ Imran K."
  totalValue: number;
  startDate: Date | string | null;
  endDate: Date | string | null;
  scope: string;
  cancellationTerms?: string | null;
  onChainEscrowAddress?: string | null;
  acceptedByBoth: boolean;
};

export function ContractRenderer({ contract }: { contract: ContractView }) {
  const rows: [string, string][] = [
    ["Parties", contract.parties],
    ["Total value", formatInr(contract.totalValue)],
    ["Dates", `${formatDate(contract.startDate)} – ${formatDate(contract.endDate)}`],
    ["Scope", contract.scope],
    ["Cancellation", contract.cancellationTerms ?? "Per platform policy"],
    ["On-chain escrow", shortHash(contract.onChainEscrowAddress)],
  ];

  return (
    <div className="rounded-2xl border border-line bg-card p-6">
      <div className="mb-3.5 flex items-center justify-between">
        <h3 className="text-[15px] font-semibold text-ink">Contract</h3>
        <button className="text-xs text-bronze hover:underline">Download PDF ↓</button>
      </div>
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4 border-b border-hair py-2 text-[13px]">
          <span className="flex-shrink-0 text-ink3">{k}</span>
          <span className="break-words text-right text-ink">{v}</span>
        </div>
      ))}
      <div className="mt-3.5 flex items-center gap-2 text-[11.5px] text-[#8FC7E8]">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
          <rect x="2" y="8" width="12" height="8" rx="4" stroke="#8FC7E8" strokeWidth="1.4" />
          <rect x="10" y="8" width="12" height="8" rx="4" stroke="#8FC7E8" strokeWidth="1.4" />
        </svg>
        {contract.acceptedByBoth
          ? "Locked on-chain — accepted in-app by both parties at hire; terms only change if both re-accept"
          : "Awaiting acceptance by both parties"}
      </div>
    </div>
  );
}
