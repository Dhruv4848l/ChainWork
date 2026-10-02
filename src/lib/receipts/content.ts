import { createHash } from "node:crypto";

/*
  Receipt content (payment plan P2) — pure, no DB, so numbering and hashing are
  unit-tested (content.test.ts).

  A receipt is a FROZEN snapshot of a finalised payment: names, addresses, amounts,
  purpose and outcome as they were at issue time. The PDF and the public verify page
  both render from this snapshot, and its SHA-256 (over canonical JSON) is printed on
  the PDF and encoded in the verify QR — so an edited PDF no longer matches.
*/

export const RECEIPT_CONTENT_VERSION = 1;

export type ReceiptOutcome = "SUCCESS" | "FAILED";

export interface ReceiptParty {
  userId: string | null;
  name: string | null;
  address: string | null;
}

export interface ReceiptContent {
  v: number;
  receiptNo: string;
  outcome: ReceiptOutcome;
  /** CONFIRMED | FAILED | CANCELLED | EXPIRED */
  status: string;
  /** FUND | RELEASE | REFUND | SPLIT | WITHDRAW | TOPUP | … */
  kind: string;
  operation: string;
  /** DEMO | TESTNET | MAINNET — drives the watermark. */
  mode: string;
  /** Rupees as a fixed 2-dp string ("1500.00"), never a float. */
  amountInr: string;
  /** SPLIT only: the worker's share in basis points. */
  splitWorkerBps: number | null;
  asset: { symbol: string; chainId: number | null; address: string | null; amount: string | null };
  payer: ReceiptParty;
  payee: ReceiptParty;
  txHash: string | null;
  blockNumber: string | null;
  gasFeeWei: string | null;
  /** Who paid the network fee: the platform relayer / custodial gas, the payer's own wallet, or nobody (demo). */
  gasPaidBy: "ChainWork" | "Payer" | "None";
  failure: { code: string; reason: string } | null;
  purpose: {
    hireId: string | null;
    phaseId: string | null;
    jobTitle: string | null;
    phaseIndex: number | null;
    phaseName: string | null;
  };
  escrowContract: string | null;
  reconciled: boolean;
  initiatedAt: string;
  finalizedAt: string;
  issuedAt: string;
}

/** Final payment status → receipt outcome. Only CONFIRMED is a success. */
export function outcomeFor(status: string): ReceiptOutcome {
  return status === "CONFIRMED" ? "SUCCESS" : "FAILED";
}

/** "RCPT" for successful payments, "FAIL" for failed / cancelled / expired ones. */
export function sequencePrefix(outcome: ReceiptOutcome): "RCPT" | "FAIL" {
  return outcome === "SUCCESS" ? "RCPT" : "FAIL";
}

/** The receipt year, in India time (the business's calendar), not UTC. */
export function receiptYear(at: Date): number {
  const ist = new Date(at.getTime() + 330 * 60_000);
  return ist.getUTCFullYear();
}

/** Counter key for ReceiptSequence: "RCPT-2026". */
export function sequenceKey(outcome: ReceiptOutcome, year: number): string {
  return `${sequencePrefix(outcome)}-${year}`;
}

/** CW-RCPT-2026-000123 */
export function formatReceiptNo(outcome: ReceiptOutcome, year: number, seq: number): string {
  if (!Number.isInteger(seq) || seq < 1) throw new Error(`Invalid receipt sequence ${seq}`);
  return `CW-${sequencePrefix(outcome)}-${year}-${String(seq).padStart(6, "0")}`;
}

const RECEIPT_NO_RE = /^CW-(RCPT|FAIL)-(\d{4})-(\d{6,})$/;

export function isReceiptNo(s: string): boolean {
  return RECEIPT_NO_RE.test(s);
}

/** JSON with object keys sorted at every level — the same content always hashes the same. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object" && !(v instanceof Date)) {
    return Object.fromEntries(
      Object.keys(v as Record<string, unknown>)
        .sort()
        .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
        .map((k) => [k, sortKeys((v as Record<string, unknown>)[k])]),
    );
  }
  return v;
}

/** SHA-256 (hex) of the canonical JSON of a receipt's content. */
export function receiptHash(content: ReceiptContent): string {
  return createHash("sha256").update(canonicalJson(content)).digest("hex");
}

/** Constant-shape check used by the verify page: does this content still match its hash? */
export function verifyReceiptHash(content: ReceiptContent, expectedHash: string): boolean {
  return receiptHash(content) === expectedHash.toLowerCase();
}

/** Who bore the network fee, from how the payment was signed. */
export function gasPaidBy(mode: string, signer: string): ReceiptContent["gasPaidBy"] {
  if (mode === "DEMO" || signer === "DEMO_SIGNATURE") return "None";
  return signer === "EXTERNAL_WALLET" ? "Payer" : "ChainWork";
}
