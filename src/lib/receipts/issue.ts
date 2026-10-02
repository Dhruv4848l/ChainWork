import "server-only";
import type { Prisma, PaymentTransaction, Receipt } from "@/generated/platform";
import { ESCROW_ADDRESS } from "@/lib/chain/config";
import {
  RECEIPT_CONTENT_VERSION,
  formatReceiptNo,
  gasPaidBy,
  outcomeFor,
  receiptHash,
  receiptYear,
  sequenceKey,
  type ReceiptContent,
} from "./content";

/*
  Issue the receipt for a payment that just reached a final state (payment plan P2.1).

  Called INSIDE the transaction that finalises the payment (service.confirmPayment /
  service.failPayment), so:
    - every final payment gets exactly one receipt (Receipt.paymentId is unique);
    - the yearly counter is bumped with a row-locking upsert in the same transaction,
      so concurrent issues serialise and a rollback never burns a number (gap-free, D7).
*/

const FINAL = new Set(["CONFIRMED", "FAILED", "CANCELLED", "EXPIRED"]);

async function nextSequence(tx: Prisma.TransactionClient, key: string): Promise<number> {
  const rows = await tx.$queryRaw<{ last: number }[]>`
    INSERT INTO "ReceiptSequence" ("key", "last") VALUES (${key}, 1)
    ON CONFLICT ("key") DO UPDATE SET "last" = "ReceiptSequence"."last" + 1
    RETURNING "last"`;
  return Number(rows[0].last);
}

/** Build the frozen snapshot (without its number) from the stored payment + related names. */
async function snapshot(tx: Prisma.TransactionClient, p: PaymentTransaction): Promise<Omit<ReceiptContent, "receiptNo" | "issuedAt">> {
  const [payer, payee, phase] = await Promise.all([
    p.payerUserId ? tx.user.findUnique({ where: { id: p.payerUserId }, select: { name: true } }) : null,
    p.payeeUserId ? tx.user.findUnique({ where: { id: p.payeeUserId }, select: { name: true } }) : null,
    p.phaseId
      ? tx.phase.findUnique({
          where: { id: p.phaseId },
          select: { index: true, name: true, hire: { select: { job: { select: { title: true } } } } },
        })
      : null,
  ]);
  const finalizedAt = p.finalizedAt ?? new Date();
  return {
    v: RECEIPT_CONTENT_VERSION,
    outcome: outcomeFor(p.status),
    status: p.status,
    kind: p.kind,
    operation: p.operation,
    mode: p.mode,
    amountInr: p.amountInr.toFixed(2),
    splitWorkerBps: p.splitWorkerBps,
    asset: { symbol: p.assetSymbol, chainId: p.assetChainId, address: p.assetAddress, amount: p.assetAmount },
    payer: { userId: p.payerUserId, name: payer?.name ?? null, address: p.fromAddress },
    payee: { userId: p.payeeUserId, name: payee?.name ?? null, address: p.toAddress },
    txHash: p.txHash,
    blockNumber: p.blockNumber?.toString() ?? null,
    gasFeeWei: p.gasFeeWei,
    gasPaidBy: gasPaidBy(p.mode, p.signer),
    failure: p.status === "CONFIRMED" ? null : { code: p.failureCode ?? "UNKNOWN", reason: p.failureReason ?? "The payment did not complete. No money was moved." },
    purpose: {
      hireId: p.hireId,
      phaseId: p.phaseId,
      jobTitle: phase?.hire.job.title ?? null,
      phaseIndex: phase?.index ?? null,
      phaseName: phase?.name ?? null,
    },
    escrowContract: p.mode === "DEMO" || !p.phaseId ? null : ESCROW_ADDRESS,
    reconciled: p.reconciled,
    initiatedAt: p.initiatedAt.toISOString(),
    finalizedAt: finalizedAt.toISOString(),
  };
}

/**
 * Issue (or return the existing) receipt for a final payment. Must run in the same
 * transaction that finalised it. Idempotent per payment.
 */
export async function issueReceipt(tx: Prisma.TransactionClient, payment: PaymentTransaction): Promise<Receipt> {
  if (!FINAL.has(payment.status)) throw new Error(`Payment ${payment.id} is ${payment.status}, not final — no receipt`);
  const existing = await tx.receipt.findUnique({ where: { paymentId: payment.id } });
  if (existing) return existing;

  const base = await snapshot(tx, payment);
  const issuedAt = new Date();
  const year = receiptYear(new Date(base.finalizedAt));
  const seq = await nextSequence(tx, sequenceKey(base.outcome, year));
  const content: ReceiptContent = { ...base, receiptNo: formatReceiptNo(base.outcome, year, seq), issuedAt: issuedAt.toISOString() };

  return tx.receipt.create({
    data: {
      receiptNo: content.receiptNo,
      paymentId: payment.id,
      outcome: content.outcome,
      content: content as unknown as Prisma.InputJsonValue,
      contentHash: receiptHash(content),
      issuedAt,
    },
  });
}
