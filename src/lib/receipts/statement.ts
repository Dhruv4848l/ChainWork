import "server-only";
import { platformDb } from "@/lib/platformDb";
import { paymentMode } from "@/lib/payments/mode";
import { computeStatement, toPaise, type LedgerLine, type Period, type StatementData } from "./statementMath";
import { renderStatementPdf } from "./statementPdf";

/*
  Account statement for one user over a period (payment plan P2.6) — read from the
  payment ledger (LedgerEntry), linked to each movement's receipt.
*/

function toLine(e: { createdAt: Date; bucket: "WALLET" | "ESCROW"; direction: "DEBIT" | "CREDIT"; amountInr: { toString(): string }; memo: string; payment: { receipt: { receiptNo: string } | null } }): LedgerLine {
  return {
    at: e.createdAt,
    bucket: e.bucket,
    direction: e.direction,
    amountPaise: toPaise(e.amountInr.toString()),
    memo: e.memo,
    receiptNo: e.payment.receipt?.receiptNo ?? null,
  };
}

export async function buildStatement(userId: string, period: Period): Promise<{ name: string; data: StatementData }> {
  const select = {
    createdAt: true, bucket: true, direction: true, amountInr: true, memo: true,
    payment: { select: { receipt: { select: { receiptNo: true } } } },
  } as const;
  const [user, before, during] = await Promise.all([
    platformDb.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true } }),
    // Only escrow needs history (its opening balance); wallet is per-period in/out.
    platformDb.ledgerEntry.findMany({ where: { userId, bucket: "ESCROW", createdAt: { lt: period.startUtc } }, select }),
    platformDb.ledgerEntry.findMany({
      where: { userId, createdAt: { gte: period.startUtc, lt: period.endUtc } },
      orderBy: { createdAt: "asc" },
      select,
    }),
  ]);
  return { name: user.name, data: computeStatement(before.map(toLine), during.map(toLine)) };
}

export async function statementPdfBytes(userId: string, period: Period): Promise<Uint8Array> {
  const { name, data } = await buildStatement(userId, period);
  const mode = paymentMode();
  return renderStatementPdf({
    name,
    period,
    data,
    mode: mode === "demo" ? "DEMO" : mode === "testnet" ? "TESTNET" : "MAINNET",
    generatedAt: new Date(),
  });
}
