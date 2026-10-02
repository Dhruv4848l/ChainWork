import type { PhaseReceiptLink } from "./paymentHistory";

/** "Receipts: Funding · Release" — the per-phase receipt links under the Phase Tracker (P2.7). */
export function PhaseReceiptLinks({ links }: { links: PhaseReceiptLink[] | undefined }) {
  if (!links?.length) return null;
  return (
    <p className="mt-2 text-[11.5px] text-ink3">
      Receipts:{" "}
      {links.map((l, i) => (
        <span key={l.receiptNo}>
          {i > 0 && " · "}
          <a
            href={`/api/receipts/${l.receiptNo}/pdf`}
            className={`hover:underline ${l.failed ? "text-ember" : "text-bronze"}`}
            aria-label={`Download receipt ${l.receiptNo} (${l.label})`}
          >
            {l.label}
          </a>
        </span>
      ))}
    </p>
  );
}
