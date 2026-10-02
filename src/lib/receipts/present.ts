import type { ReceiptContent } from "./content";

/*
  How a receipt reads (payment plan P2.3) — pure text helpers shared by the PDF, the
  public verify page and the transactions table, so all three say the same thing.
*/

const KIND_LABEL: Record<string, string> = {
  FUND: "Phase funded into escrow",
  RELEASE: "Escrow released to the worker",
  REFUND: "Escrow refunded to the client",
  SPLIT: "Escrow settled by verdict",
  WITHDRAW: "Withdrawal to bank / UPI",
  TOPUP: "Funds added to wallet",
  MOVE_TO_EXTERNAL: "Moved to your external wallet",
  STAKE_LOCK: "Delivery stake locked",
  STAKE_REFUND: "Delivery stake returned",
  STAKE_FORFEIT: "Delivery stake forfeited",
};

export function kindLabel(c: Pick<ReceiptContent, "kind" | "operation">): string {
  if (c.kind === "RELEASE" && c.operation === "autoRelease") return "Escrow auto-released to the worker";
  return KIND_LABEL[c.kind] ?? c.kind;
}

export function statusHeadline(c: Pick<ReceiptContent, "status">): string {
  switch (c.status) {
    case "CONFIRMED": return "Payment successful";
    case "CANCELLED": return "Payment cancelled";
    case "EXPIRED": return "Payment expired";
    default: return "Payment failed";
  }
}

/** What the failed receipt promises about the money. Failures in this system never move funds. */
export function failureNote(c: Pick<ReceiptContent, "status">): string | null {
  return c.status === "CONFIRMED" ? null : "No money was moved.";
}

export function networkName(c: Pick<ReceiptContent, "mode" | "asset">): string {
  if (c.mode === "DEMO") return "ChainWork demo ledger (no blockchain)";
  switch (c.asset.chainId) {
    case 80002: return "Polygon Amoy testnet";
    case 137: return "Polygon";
    case 31337: return "Local Hardhat chain (dev)";
    case null: return "—";
    default: return `Chain ${c.asset.chainId}`;
  }
}

/** The watermark stamped across the page, or null for real money. */
export function modeWatermark(mode: string): string | null {
  if (mode === "DEMO") return "DEMO — NO REAL MONEY";
  if (mode === "TESTNET") return "TESTNET — NO REAL VALUE";
  return null;
}

const NATIVE: Record<number, string> = { 80002: "POL", 137: "POL", 31337: "ETH", 11155111: "ETH" };

/** Gas fee in the chain's native coin, e.g. "0.000226 ETH (paid by ChainWork)". */
export function gasLine(c: Pick<ReceiptContent, "gasFeeWei" | "gasPaidBy" | "asset" | "mode">): string {
  if (c.mode === "DEMO" || c.gasPaidBy === "None") return "None (no blockchain transaction)";
  if (!c.gasFeeWei) return "—";
  const wei = BigInt(c.gasFeeWei);
  const unit = BigInt("1000000000000000000"); // 1e18 (tsconfig targets < ES2020, so no 10n literals)
  const whole = wei / unit;
  const frac = (wei % unit).toString().padStart(18, "0").slice(0, 6).replace(/0+$/, "");
  const amount = frac ? `${whole}.${frac}` : `${whole}`;
  const symbol = (c.asset.chainId != null && NATIVE[c.asset.chainId]) || "native";
  return `${amount === "0" ? "< 0.000001" : amount} ${symbol} (paid by ${c.gasPaidBy})`;
}

/** "1,500.00" — Indian digit grouping, always 2 decimals, from the exact string. */
export function formatRupees(amountInr: string): string {
  const [whole, frac = "00"] = amountInr.split(".");
  const grouped = new Intl.NumberFormat("en-IN").format(BigInt(whole));
  return `${grouped}.${frac.padEnd(2, "0").slice(0, 2)}`;
}

/** "2 Oct 2026, 10:32:05 am IST" */
export function istDateTime(iso: string): string {
  return (
    new Date(iso).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    }) + " IST"
  );
}

/** "Fan installation · Phase 1 “Site prep & materials”" */
export function purposeLine(c: Pick<ReceiptContent, "purpose">): string {
  const { jobTitle, phaseIndex, phaseName } = c.purpose;
  const phase = phaseIndex != null ? `Phase ${phaseIndex}${phaseName ? ` “${phaseName}”` : ""}` : null;
  return [jobTitle, phase].filter(Boolean).join(" · ") || "—";
}

/** The public verify page for a receipt; `h` carries the content hash the QR vouches for. */
export function verifyPath(receiptNo: string, contentHash: string): string {
  return `/receipts/verify/${encodeURIComponent(receiptNo)}?h=${contentHash}`;
}

/** Mask a name for the public verify page: "Ravi Kumar" → "R••• K•••". */
export function maskName(name: string | null): string {
  if (!name) return "—";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0] + "•••")
    .join(" ");
}

/** Mask an address for the public verify page: 0x90F7…b906. */
export function maskAddress(addr: string | null): string {
  if (!addr) return "—";
  return /^0x[0-9a-fA-F]{40}$/.test(addr) ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

/** Download filename: ChainWork-Receipt-CW-RCPT-2026-000123.pdf */
export function receiptFilename(receiptNo: string): string {
  return `ChainWork-Receipt-${receiptNo}.pdf`;
}
