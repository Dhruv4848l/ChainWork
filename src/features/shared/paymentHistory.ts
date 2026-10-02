import "server-only";
import { platformDb } from "@/lib/platformDb";
import { kindLabel } from "@/lib/receipts/present";
import { payoutAddressFor } from "@/lib/chain/payout";

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

export interface PhaseReceiptLink {
  receiptNo: string;
  /** "Funding", "Release", "Failed funding", … */
  label: string;
  failed: boolean;
}

const PHASE_EVENT: Record<string, string> = {
  FUND: "Funding",
  RELEASE: "Release",
  REFUND: "Refund",
  SPLIT: "Verdict settlement",
  STAKE_LOCK: "Stake lock",
  STAKE_REFUND: "Stake return",
  STAKE_FORFEIT: "Stake forfeit",
};

/**
 * Receipts per phase for one hire (payment plan P2.7 — the per-phase receipt links on
 * the hire pages). Only payments the viewer was a party to; oldest first.
 */
export async function getPhaseReceipts(phaseIds: string[], userId: string): Promise<Record<string, PhaseReceiptLink[]>> {
  if (phaseIds.length === 0) return {};
  const rows = await platformDb.receipt.findMany({
    where: {
      payment: { phaseId: { in: phaseIds }, OR: [{ payerUserId: userId }, { payeeUserId: userId }] },
    },
    orderBy: { issuedAt: "asc" },
    select: { receiptNo: true, outcome: true, payment: { select: { phaseId: true, kind: true, operation: true } } },
  });
  const out: Record<string, PhaseReceiptLink[]> = {};
  for (const r of rows) {
    const phaseId = r.payment.phaseId!;
    const event = r.payment.kind === "RELEASE" && r.payment.operation === "autoRelease" ? "Auto-release" : PHASE_EVENT[r.payment.kind] ?? r.payment.kind;
    const failed = r.outcome === "FAILED";
    (out[phaseId] ??= []).push({ receiptNo: r.receiptNo, label: failed ? `Failed ${event.toLowerCase()}` : event, failed });
  }
  return out;
}

export interface PhasePayout {
  address: string;
  /** "your ChainWork wallet" / "your linked wallet" (worker view) or "the worker's …" (client view). */
  label: string;
  /** true once escrow is funded: the address is fixed on-chain; false = where it WOULD go if funded now. */
  fixed: boolean;
  /** true once the money has left escrow (released / settled). */
  paid: boolean;
}

/**
 * Where each phase of a hire pays the worker (payment plan P3.4). A funded phase pays the
 * address recorded on-chain at funding — taken from its FUND payment; an unfunded phase
 * would pay the worker's current payout address (custodial during a new link's hold).
 */
export async function getPhasePayouts(
  phases: { id: string; status: string }[],
  workerId: string,
  viewer: "worker" | "client",
): Promise<Record<string, PhasePayout>> {
  if (phases.length === 0) return {};
  const [funds, wallet, current] = await Promise.all([
    platformDb.paymentTransaction.findMany({
      where: { phaseId: { in: phases.map((p) => p.id) }, kind: "FUND", status: "CONFIRMED" },
      select: { phaseId: true, toAddress: true },
    }),
    platformDb.wallet.findUnique({ where: { userId: workerId }, select: { custodialAddress: true, externalAddress: true } }),
    payoutAddressFor(workerId),
  ]);
  const who = viewer === "worker" ? "your" : "the worker's";
  const label = (addr: string) =>
    wallet?.externalAddress && addr.toLowerCase() === wallet.externalAddress.toLowerCase()
      ? `${who} linked wallet`
      : addr.toLowerCase() === wallet?.custodialAddress.toLowerCase()
        ? `${who} ChainWork wallet`
        : `${who} earlier payout address`;
  const funded = new Map(funds.filter((f) => f.toAddress).map((f) => [f.phaseId!, f.toAddress!]));
  const out: Record<string, PhasePayout> = {};
  for (const p of phases) {
    if (["RELEASED", "RESOLVED", "AUTO_CANCELLED"].includes(p.status) && !funded.has(p.id)) continue;
    const address = funded.get(p.id) ?? current;
    out[p.id] = { address, label: label(address), fixed: funded.has(p.id), paid: p.status === "RELEASED" || p.status === "RESOLVED" };
  }
  return out;
}
