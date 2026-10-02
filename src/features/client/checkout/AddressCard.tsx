"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

/*
  Who the escrow pays (payment plan P6.7): the worker's payout address with copy + QR, and
  the escrow contract the money is locked in. The payer sends to the CONTRACT — the QR is
  for checking the recipient on a phone wallet, not for a direct transfer.
*/
export function AddressCard({ label, address, note, escrowAddress }: { label: string; address: string; note: string; escrowAddress: string | null }) {
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    QRCode.toDataURL(address, { margin: 1, width: 168, errorCorrectionLevel: "M" }).then(setQr, () => setQr(null));
  }, [address]);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard blocked — the address is selectable */
    }
  }

  const row = (title: string, value: string) => (
    <div className="min-w-0">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-ink3">{title}</div>
      <div className="flex items-center gap-2">
        <code className="min-w-0 select-all break-all font-mono text-[12px] text-ink">{value}</code>
        <button
          onClick={() => copy(value)}
          aria-label={`Copy ${title}`}
          className="shrink-0 rounded-md border border-line px-2 py-0.5 text-[11px] text-ink2 hover:border-line-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-bronze"
        >
          {copied === value ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );

  return (
    <section aria-label="Recipient" className="flex flex-col gap-3 rounded-xl border border-line p-4 sm:flex-row sm:items-center">
      {qr && (
        // White tile on purpose: QR scanners need dark-on-light in both themes.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qr} alt={`QR code of ${address}`} width={96} height={96} className="shrink-0 self-start rounded-md bg-white p-1" />
      )}
      <div className="flex min-w-0 flex-col gap-2.5">
        {row(label, address)}
        <p className="-mt-1.5 text-[11.5px] text-ink3">{note}</p>
        {escrowAddress && row("Escrow contract (you pay this)", escrowAddress)}
      </div>
    </section>
  );
}
