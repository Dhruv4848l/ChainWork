/*
  Statement arithmetic (payment plan P2.6) — pure and unit-tested (statement.test.ts).
  Money is integer paise throughout; rupee strings are only made at render time.

  ESCROW is a true running balance: every lock (CREDIT) and release/refund (DEBIT) is a
  recorded payment, so opening + movements = closing.

  WALLET is shown as money in / money out / net for the period only. Until the wallet
  rework (payment plan P3.1) every wallet credit is not yet a recorded payment (testnet
  funding tops up implicitly; the demo grant predates the ledger), so a wallet running
  balance derived from the ledger would be wrong. The live wallet balance is in the app.
*/

export type Bucket = "WALLET" | "ESCROW";
export type Direction = "DEBIT" | "CREDIT";

export interface LedgerLine {
  at: Date;
  bucket: Bucket;
  direction: Direction;
  amountPaise: number;
  memo: string;
  receiptNo: string | null;
}

export interface WalletRow { at: Date; memo: string; receiptNo: string | null; inPaise: number; outPaise: number }
export interface EscrowRow { at: Date; memo: string; receiptNo: string | null; creditPaise: number; debitPaise: number; balancePaise: number }

export interface StatementData {
  wallet: { rows: WalletRow[]; totalInPaise: number; totalOutPaise: number; netPaise: number };
  escrow: { openingPaise: number; rows: EscrowRow[]; closingPaise: number; lockedPaise: number; releasedPaise: number };
}

const IST_OFFSET_MS = 330 * 60_000;
const MAX_DAYS = 366;

export interface Period { from: string; to: string; startUtc: Date; endUtc: Date }

/**
 * Parse an inclusive IST date range ("2026-10-01".."2026-10-31") into UTC bounds
 * [startUtc, endUtc). Throws a readable error for bad input.
 */
export function parsePeriod(from: string, to: string): Period {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(from) || !re.test(to)) throw new Error("Dates must look like 2026-10-01.");
  const startUtc = new Date(Date.parse(`${from}T00:00:00Z`) - IST_OFFSET_MS);
  const endUtc = new Date(Date.parse(`${to}T00:00:00Z`) - IST_OFFSET_MS + 86_400_000);
  if (Number.isNaN(startUtc.getTime()) || Number.isNaN(endUtc.getTime())) throw new Error("That date doesn't exist.");
  if (endUtc <= startUtc) throw new Error("The start date must be on or before the end date.");
  if ((endUtc.getTime() - startUtc.getTime()) / 86_400_000 > MAX_DAYS) throw new Error("A statement can cover at most one year.");
  return { from, to, startUtc, endUtc };
}

/** Today's date in IST as "YYYY-MM-DD", and N days earlier — for the default period. */
export function istDateString(at: Date): string {
  return new Date(at.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function defaultPeriod(now: Date = new Date()): { from: string; to: string } {
  return { from: istDateString(new Date(now.getTime() - 29 * 86_400_000)), to: istDateString(now) };
}

/** Build the statement from ledger lines before the period (for the opening balance) and during it. */
export function computeStatement(before: LedgerLine[], during: LedgerLine[]): StatementData {
  const sorted = [...during].sort((a, b) => a.at.getTime() - b.at.getTime());

  const wallet = sorted.filter((l) => l.bucket === "WALLET").map<WalletRow>((l) => ({
    at: l.at, memo: l.memo, receiptNo: l.receiptNo,
    inPaise: l.direction === "CREDIT" ? l.amountPaise : 0,
    outPaise: l.direction === "DEBIT" ? l.amountPaise : 0,
  }));
  const totalInPaise = wallet.reduce((s, r) => s + r.inPaise, 0);
  const totalOutPaise = wallet.reduce((s, r) => s + r.outPaise, 0);

  const escrowDelta = (l: LedgerLine) => (l.direction === "CREDIT" ? l.amountPaise : -l.amountPaise);
  const openingPaise = before.filter((l) => l.bucket === "ESCROW").reduce((s, l) => s + escrowDelta(l), 0);
  let running = openingPaise;
  const escrow = sorted.filter((l) => l.bucket === "ESCROW").map<EscrowRow>((l) => {
    running += escrowDelta(l);
    return {
      at: l.at, memo: l.memo, receiptNo: l.receiptNo,
      creditPaise: l.direction === "CREDIT" ? l.amountPaise : 0,
      debitPaise: l.direction === "DEBIT" ? l.amountPaise : 0,
      balancePaise: running,
    };
  });

  return {
    wallet: { rows: wallet, totalInPaise, totalOutPaise, netPaise: totalInPaise - totalOutPaise },
    escrow: {
      openingPaise,
      rows: escrow,
      closingPaise: running,
      lockedPaise: escrow.reduce((s, r) => s + r.creditPaise, 0),
      releasedPaise: escrow.reduce((s, r) => s + r.debitPaise, 0),
    },
  };
}

/** "1,500.00" from paise (negative shown with a leading minus). */
export function paiseToRupees(paise: number): string {
  const neg = paise < 0;
  const abs = Math.abs(paise);
  const whole = new Intl.NumberFormat("en-IN").format(Math.floor(abs / 100));
  return `${neg ? "−" : ""}${whole}.${String(abs % 100).padStart(2, "0")}`;
}

/** Decimal rupee string/number → integer paise without float drift. */
export function toPaise(amount: string | number): number {
  const [w, f = ""] = String(amount).split(".");
  const sign = w.startsWith("-") ? -1 : 1;
  return sign * (Math.abs(parseInt(w, 10)) * 100 + parseInt((f + "00").slice(0, 2), 10));
}
