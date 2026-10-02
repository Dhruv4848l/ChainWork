import type { PhasePayout, PhaseReceiptLink } from "./paymentHistory";

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

/** "Pays out to your ChainWork wallet · 0x90F7…b906" (P3.4). */
export function PhasePayoutLine({ payout }: { payout: PhasePayout | undefined }) {
  if (!payout) return null;
  const short = `${payout.address.slice(0, 6)}…${payout.address.slice(-4)}`;
  return (
    <p className="mt-1.5 text-[11.5px] text-ink3" title={payout.address}>
      {payout.paid ? "Paid out to" : payout.fixed ? "Pays out to" : "Would pay out to"} {payout.label} · <span className="font-mono">{short}</span>
    </p>
  );
}
