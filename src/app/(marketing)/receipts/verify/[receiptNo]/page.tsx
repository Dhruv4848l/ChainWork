import type { Metadata } from "next";
import { Card, StatusBadge } from "@/components/ui";
import { verifyReceiptHash } from "@/lib/receipts/content";
import { findReceipt } from "@/lib/receipts/store";
import {
  formatRupees,
  istDateTime,
  kindLabel,
  maskAddress,
  maskName,
  modeWatermark,
  networkName,
  statusHeadline,
} from "@/lib/receipts/present";

/*
  PUBLIC receipt verification (payment plan P2.5) — what the QR on every receipt PDF
  opens. Anyone holding a receipt can check it is genuine and unaltered, without an
  account. Personal details are masked; only the outcome, amount, date and hashes
  are shown in full.

  Authentic = the receipt exists, its stored content still hashes to its stored hash,
  AND that hash equals the one the PDF/QR carries (?h=). A different ?h= means the
  document presented is not the one ChainWork issued.
*/

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Verify a receipt — ChainWork",
  robots: { index: false, follow: false },
};

type Verdict = "authentic" | "mismatch" | "unchecked" | "corrupt";

export default async function VerifyReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ receiptNo: string }>;
  searchParams: Promise<{ h?: string }>;
}) {
  const { receiptNo: raw } = await params;
  const { h } = await searchParams;
  const receiptNo = decodeURIComponent(raw);
  const r = await findReceipt(receiptNo);

  if (!r) {
    return (
      <Shell>
        <Card className="p-8 text-center">
          <StatusBadge tone="danger">Not found</StatusBadge>
          <h1 className="mt-4 font-display text-3xl text-ink">No such receipt</h1>
          <p className="mt-3 text-sm text-ink2">
            ChainWork has not issued a receipt numbered <span className="font-mono text-ink">{receiptNo}</span>.
            If someone gave you this document, treat it as not genuine.
          </p>
        </Card>
      </Shell>
    );
  }

  const c = r.content;
  const intact = verifyReceiptHash(c, r.contentHash);
  const verdict: Verdict = !intact ? "corrupt" : !h ? "unchecked" : h.toLowerCase() === r.contentHash ? "authentic" : "mismatch";
  const success = c.outcome === "SUCCESS";
  const mark = modeWatermark(c.mode);

  const banner = {
    authentic: { tone: "success" as const, label: "Authentic", text: "This receipt was issued by ChainWork and has not been altered." },
    unchecked: { tone: "info" as const, label: "Issued by ChainWork", text: "This receipt number exists. Scan the QR on the document itself to also check its fingerprint." },
    mismatch: { tone: "danger" as const, label: "Does not match", text: "The document you scanned does not match the receipt ChainWork issued under this number. It may have been edited." },
    corrupt: { tone: "danger" as const, label: "Integrity check failed", text: "This receipt's stored record fails its own integrity check. Contact ChainWork support." },
  }[verdict];

  const rows: [string, string][] = [
    ["Receipt no.", c.receiptNo],
    ["Payment", kindLabel(c)],
    ["Date & time", istDateTime(c.finalizedAt)],
    ["From", `${maskName(c.payer.name)} · ${maskAddress(c.payer.address)}`],
    ["To", `${maskName(c.payee.name)} · ${maskAddress(c.payee.address)}`],
    ["Network", networkName(c)],
    ["Transaction", c.txHash ?? "—"],
  ];

  return (
    <Shell>
      <Card className="overflow-hidden">
        <div className="border-b border-line p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={banner.tone}>{banner.label}</StatusBadge>
            {mark && <StatusBadge tone="warning">{mark}</StatusBadge>}
          </div>
          <p className="mt-3 text-sm text-ink2">{banner.text}</p>
        </div>

        <div className="p-6 text-center sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink3">{statusHeadline(c)}</p>
          <p className={`mt-2 font-display text-5xl ${success ? "text-ink" : "text-ink3 line-through"}`}>₹{formatRupees(c.amountInr)}</p>
          {!success && c.failure && <p className="mx-auto mt-3 max-w-md text-sm text-ember">{c.failure.reason} No money was moved.</p>}
        </div>

        <dl className="divide-y divide-hair border-t border-line px-6 sm:px-8">
          {rows.map(([k, v]) => (
            <div key={k} className="grid gap-1 py-3 sm:grid-cols-[140px_1fr] sm:gap-4">
              <dt className="text-xs text-ink3">{k}</dt>
              <dd className="break-all text-sm text-ink">{v}</dd>
            </div>
          ))}
          <div className="grid gap-1 py-3 sm:grid-cols-[140px_1fr] sm:gap-4">
            <dt className="text-xs text-ink3">Fingerprint (SHA-256)</dt>
            <dd className="break-all font-mono text-xs text-ink2">{r.contentHash}</dd>
          </div>
        </dl>
      </Card>
      <p className="mt-4 text-center text-xs text-ink3">
        Names and wallet addresses are partly hidden to protect the people involved.
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <section className="mx-auto w-full max-w-2xl px-4 py-12 sm:py-16">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-bronze">Receipt verification</p>
      {children}
    </section>
  );
}
