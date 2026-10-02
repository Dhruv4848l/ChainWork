import "server-only";
import { platformDb } from "@/lib/platformDb";
import type { EscrowTxType, PaymentKind, PaymentMode } from "@/generated/platform";
import { ledgerRows } from "./service";
import { issueReceipt } from "@/lib/receipts/issue";

/*
  One-off (idempotent) backfill: every EscrowTransaction written before the payment
  ledger existed becomes a CONFIRMED PaymentTransaction with ledger rows, so
  statements and receipts (P2) cover history too. Rows already linked (paymentId set)
  are skipped, so it is safe to run repeatedly.

  Mode: hashes from the old MOCK_BLOCKCHAIN stub (`0xmock_…`) → DEMO; everything else
  → TESTNET (this stack has never held real money).

    npm run script -- scripts/backfill-payments.mts
*/

const KIND: Record<EscrowTxType, PaymentKind> = {
  FUND: "FUND",
  RELEASE: "RELEASE",
  REFUND: "REFUND",
  SPLIT: "SPLIT",
  STAKE_LOCK: "STAKE_LOCK",
  STAKE_FORFEIT: "STAKE_FORFEIT",
  STAKE_REFUND: "STAKE_REFUND",
};

export async function backfillPaymentsFromEscrowTransactions(): Promise<{ created: number; skipped: number }> {
  const rows = await platformDb.escrowTransaction.findMany({
    where: { paymentId: null, status: "CONFIRMED" },
    include: { phase: { include: { hire: true } } },
    orderBy: { createdAt: "asc" },
  });
  let created = 0;
  let skipped = 0;
  for (const e of rows) {
    const hire = e.phase?.hire;
    if (!hire) { skipped++; continue; }
    const kind = KIND[e.type];
    const mode: PaymentMode = e.onChainTxHash?.startsWith("0xmock") ? "DEMO" : "TESTNET";
    const toClient = kind === "REFUND" || kind === "STAKE_REFUND";
    // A fake legacy hash can't satisfy the unique txHash column twice; keep only real-looking ones.
    const txHash = e.onChainTxHash && /^0x[0-9a-fA-F]{64}$/.test(e.onChainTxHash) ? e.onChainTxHash : null;
    const clash = txHash ? await platformDb.paymentTransaction.findUnique({ where: { txHash } }) : null;

    await platformDb.$transaction(async (tx) => {
      const payment = await tx.paymentTransaction.create({
        data: {
          kind, mode, status: "CONFIRMED", reconciled: true,
          operation: `backfill:${e.type.toLowerCase()}`,
          signer: kind === "FUND" || kind === "STAKE_LOCK" ? "CUSTODIAL" : "RELAYER",
          amountInr: e.amount,
          payerUserId: kind === "STAKE_LOCK" || kind === "STAKE_REFUND" ? hire.workerId : hire.clientId,
          payeeUserId: toClient ? (kind === "STAKE_REFUND" ? hire.workerId : hire.clientId) : kind === "FUND" ? hire.workerId : kind === "STAKE_FORFEIT" ? hire.clientId : hire.workerId,
          fromAddress: e.fromAddress, toAddress: e.toAddress,
          txHash: clash ? null : txHash,
          phaseId: e.phaseId, hireId: hire.id,
          initiatedAt: e.createdAt, submittedAt: e.createdAt, finalizedAt: e.createdAt,
        },
      });
      const ledger = ledgerRows(payment).map((r) => ({ ...r, createdAt: e.createdAt }));
      if (ledger.length) await tx.ledgerEntry.createMany({ data: ledger });
      await tx.escrowTransaction.update({ where: { id: e.id }, data: { paymentId: payment.id } });
    });
    created++;
  }
  return { created, skipped };
}

/**
 * Issue receipts (P2) for every final payment that has none — payments finalised
 * before receipts existed, plus everything the escrow backfill above just created.
 * Oldest first, so historical numbers follow the order the payments happened in.
 * Idempotent: payments that already have a receipt are skipped.
 */
export async function backfillReceipts(): Promise<{ issued: number }> {
  const payments = await platformDb.paymentTransaction.findMany({
    where: { status: { in: ["CONFIRMED", "FAILED", "CANCELLED", "EXPIRED"] }, receipt: null },
    orderBy: [{ finalizedAt: "asc" }, { initiatedAt: "asc" }],
  });
  for (const p of payments) {
    await platformDb.$transaction((tx) => issueReceipt(tx, p));
  }
  return { issued: payments.length };
}
