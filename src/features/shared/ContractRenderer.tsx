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
  /** Typed legal-name signatures, when the two-sided signing has happened. */
  clientSignature?: string | null;
  workerSignature?: string | null;
  /** SHA-256 the signatures are bound to. */
  documentHash?: string | null;
  /** Where this viewer goes to read or sign the full document. */
  contractHref?: string;
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
        {contract.contractHref ? (
          <a href={contract.contractHref} className="text-xs text-bronze hover:underline">
            {contract.acceptedByBoth ? "View signed contract →" : "Read & sign →"}
          </a>
        ) : (
          <button className="text-xs text-bronze hover:underline">Download PDF ↓</button>
        )}
      </div>
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4 border-b border-hair py-2 text-[13px]">
          <span className="flex-shrink-0 text-ink3">{k}</span>
          <span className="break-words text-right text-ink">{v}</span>
        </div>
      ))}
      {/* Signature block */}
      {(contract.clientSignature || contract.workerSignature) && (
        <div className="mt-4 grid grid-cols-2 gap-4 border-t border-hair pt-3.5">
          <SignatureCell label="Client" value={contract.clientSignature} />
          <SignatureCell label="Worker" value={contract.workerSignature} />
        </div>
      )}
      {contract.documentHash && (
        <div className="mt-2.5 text-[10.5px] text-ink3">
          Signed document SHA-256{" "}
          <code className="break-all font-mono text-[#8FC7E8]">
            {contract.documentHash.slice(0, 24)}…
          </code>
        </div>
      )}

      <div
        className={`mt-3.5 flex items-center gap-2 text-[11.5px] ${
          contract.acceptedByBoth ? "text-[#8FC7E8]" : "text-amber"
        }`}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
          <rect x="2" y="8" width="12" height="8" rx="4" stroke="currentColor" strokeWidth="1.4" />
          <rect x="10" y="8" width="12" height="8" rx="4" stroke="currentColor" strokeWidth="1.4" />
        </svg>
        {contract.acceptedByBoth
          ? "Signed by both parties and hash-locked — terms only change if both re-sign"
          : "Unsigned — escrow cannot be funded until both parties sign"}
      </div>
    </div>
  );
}

function SignatureCell({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-ink3">{label}</div>
      {value ? (
        <div className="mt-0.5 border-b border-hair pb-1 font-display text-lg text-bronze">
          {value}
        </div>
      ) : (
        <div className="mt-0.5 border-b border-hair pb-1 text-[13px] text-ink3">Pending</div>
      )}
    </div>
  );
}
