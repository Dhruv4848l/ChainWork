import "server-only";
import { platformDb } from "@/lib/platformDb";
import { kindLabel } from "@/lib/receipts/present";

/*
  A user's payment history (payment plan P2.7) — every PaymentTransaction they were
  the payer or payee of, with its receipt. Seen from the viewer's side: the payer sees
  money going out ("Paid"), the payee sees it coming in ("Received"); a verdict split
  shows each side only its own share.
*/

export type HistoryState = "done" | "failed" | "cancelled" | "processing";

export interface HistoryRow {
  id: string;
  label: string;
  context: string;
  at: Date;
  /** Rupees moved, always positive; see `direction`. */
  amountInr: number;
  /** From the viewer's wallet: money in, money out, or neither (e.g. escrow → someone else). */
  direction: "in" | "out" | "neutral";
  state: HistoryState;
  /** "Paid" / "Received" / "Failed" / … — the badge text. */
  stateLabel: string;
  receiptNo: string | null;
  txHash: string | null;
}

const STATE: Record<string, HistoryState> = {
  CONFIRMED: "done",
  FAILED: "failed",
  EXPIRED: "failed",
  CANCELLED: "cancelled",
  INITIATED: "processing",
  SUBMITTED: "processing",
};

/** Badge for a completed movement that didn't touch the viewer's own wallet: name the event. */
const NEUTRAL_LABEL: Record<string, string> = { FUND: "Funded", RELEASE: "Released", SPLIT: "Settled", REFUND: "Refunded" };

/** Movements where money leaves the payer's spendable wallet (as opposed to escrow → someone). */
const OUTFLOW_FROM_PAYER = new Set(["FUND", "WITHDRAW", "MOVE_TO_EXTERNAL", "STAKE_LOCK"]);

export async function getPaymentHistory(userId: string, take = 50): Promise<HistoryRow[]> {
  const payments = await platformDb.paymentTransaction.findMany({
    where: { OR: [{ payerUserId: userId }, { payeeUserId: userId }] },
    orderBy: { initiatedAt: "desc" },
    take,
    include: {
      receipt: { select: { receiptNo: true } },
      phase: { select: { index: true, name: true, hire: { select: { job: { select: { title: true } } } } } },
    },
  });

  return payments.map((p) => {
    const amount = Number(p.amountInr);
    const isPayer = p.payerUserId === userId;
    const isPayee = p.payeeUserId === userId;
    let direction: HistoryRow["direction"];
    let shown = amount;
    if (p.kind === "SPLIT" && p.splitWorkerBps != null) {
      // A verdict pays the worker their share and returns the rest to the client.
      // Same paise rounding as the ledger (service.ledgerRows): the worker share is floored.
      const workerShare = Math.floor((Math.round(amount * 100) * p.splitWorkerBps) / 10_000) / 100;
      shown = isPayee ? workerShare : amount - workerShare;
      direction = shown > 0 ? "in" : "neutral";
    } else if (isPayer && OUTFLOW_FROM_PAYER.has(p.kind)) {
      direction = "out";
    } else if (isPayee && !OUTFLOW_FROM_PAYER.has(p.kind)) {
      direction = "in"; // release / refund / top-up / stake back (a refund's payer is the client too)
    } else {
      // The client's view of a release (escrow → worker) or the worker's view of a funding
      // (client → escrow, held for them): the viewer's own wallet doesn't change.
      direction = "neutral";
    }

    const state = STATE[p.status] ?? "processing";
    const stateLabel =
      state === "done" ? (direction === "in" ? "Received" : direction === "out" ? "Paid" : NEUTRAL_LABEL[p.kind] ?? "Completed")
      : state === "failed" ? "Failed"
      : state === "cancelled" ? "Cancelled"
      : "Processing";

    const context = p.phase
      ? `${p.phase.hire.job.title} · Phase ${p.phase.index} “${p.phase.name}”`
      : p.kind === "TOPUP" ? "Wallet" : p.kind === "WITHDRAW" ? "To your bank / UPI" : "Wallet";

    return {
      id: p.id,
      label: kindLabel(p),
      context,
      at: p.finalizedAt ?? p.initiatedAt,
      amountInr: shown,
      direction,
      state,
      stateLabel,
      receiptNo: p.receipt?.receiptNo ?? null,
      txHash: p.txHash,
    };
  });
}
