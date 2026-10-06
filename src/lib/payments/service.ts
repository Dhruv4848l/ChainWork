import "server-only";
import { Prisma } from "@/generated/platform";
import type {
  PaymentKind,
  PaymentMode as DbPaymentMode,
  PaymentTransaction,
  Receipt,
  SignerKind,
  EscrowTxType,
} from "@/generated/platform";
import { platformDb } from "@/lib/platformDb";
import { paymentMode } from "./mode";
import { classifyPaymentError } from "./errors";
import { observeChainTx, type MinedTx } from "./observer";
import { PHASE_TRANSITIONS, type PhaseEvent } from "@/lib/escrow/phaseMachine";
import { CHAIN_ID, ESCROW_ADDRESS } from "@/lib/chain/config";
import { toTokenUnits } from "@/lib/chain/viemAdapter";
import { issueReceipt } from "@/lib/receipts/issue";
import type { TxHash } from "@/lib/chain/types";

/*
  THE PAYMENT SERVICE (payment plan P1) — every money movement goes through runPayment().

    1. A PaymentTransaction row is created (INITIATED) BEFORE the chain is touched, so
       every attempt exists — including ones that fail or are cancelled.
    2. The chain operation runs. Its primary tx hash is recorded the moment it is
       broadcast (SUBMITTED), via the observer in ./observer.ts.
    3. Success → ONE DB transaction marks it CONFIRMED and applies its money effects:
       the guarded phase transition, the ledger rows and the legacy EscrowTransaction
       row, and issues the receipt (P2). Failure → FAILED / CANCELLED with a code, a
       plain-language reason and a failure receipt, also in one DB transaction.
       A timeout after broadcast leaves it SUBMITTED: the reconciler finishes it.
    4. Optional after-commit work (notifications, hire completion) runs best-effort.

  applyMoneyEffects() derives everything from the stored row, so the reconciler
  (./reconcile.ts) can finish a payment whose original request died mid-way.
*/

export interface PaymentSpec {
  kind: PaymentKind;
  /** The chain operation: fundPhase, approveRelease, autoRelease, refundToClient, resolveDispute, … */
  operation: string;
  signer: SignerKind;
  amountInr: number;
  payerUserId?: string | null;
  payeeUserId?: string | null;
  fromAddress?: string | null;
  toAddress?: string | null;
  splitWorkerBps?: number | null;
  phaseId?: string | null;
  hireId?: string | null;
  /**
   * What actually moves (payment plan P6). Omitted = the cwINR stablecoin at ₹1, except
   * for exits (release / refund / split) of a phase, which inherit the asset that phase
   * was funded in.
   */
  asset?: PaymentAsset | null;
}

export interface PaymentAsset {
  symbol: string;
  /** null = native coin. */
  address: string | null;
  chainId: number | null;
  /** Exact base units. */
  amount: string;
  quoteId?: string | null;
  /** ₹ per whole unit. */
  rate?: number | null;
}

export type PaymentOutcome =
  | { ok: true; paymentId: string; txHash: TxHash; receiptNo: string | null }
  | { ok: false; paymentId: string; code: string; reason: string; pending: boolean; cancelled: boolean; receiptNo: string | null };

export interface RunPaymentHooks {
  /** Extra domain writes in the SAME transaction as the confirmation (strikes, flags…). The receipt already exists. */
  onConfirmedTx?: (tx: Prisma.TransactionClient, payment: PaymentTransaction, receipt: Receipt) => Promise<void>;
  /** After commit, best-effort (notifications, hire completion). Never throws outward. */
  afterConfirmed?: (payment: PaymentTransaction, receipt: Receipt) => Promise<void>;
}

export type ConfirmedPayment = PaymentTransaction & { receipt: Receipt };

function dbMode(): DbPaymentMode {
  const m = paymentMode();
  return m === "demo" ? "DEMO" : m === "testnet" ? "TESTNET" : "MAINNET";
}

const ESCROW_KINDS: Partial<Record<PaymentKind, EscrowTxType>> = {
  FUND: "FUND",
  RELEASE: "RELEASE",
  REFUND: "REFUND",
  SPLIT: "SPLIT",
  STAKE_LOCK: "STAKE_LOCK",
  STAKE_REFUND: "STAKE_REFUND",
  STAKE_FORFEIT: "STAKE_FORFEIT",
};

/** Returning a refused wallet funding to its payer (ADM-10): not part of the phase's books. */
export const FLAGGED_REFUND = "flaggedRefund";

/** Which phase event a confirmed payment implies. */
function phaseEventFor(p: Pick<PaymentTransaction, "kind" | "operation">): PhaseEvent | null {
  switch (p.kind) {
    case "FUND": return "fund";
    case "RELEASE": return p.operation === "autoRelease" ? "autoRelease" : "approve";
    // A refused (flagged) funding was never credited to the phase: refunding it changes nothing there.
    case "REFUND": return p.operation === FLAGGED_REFUND ? null : "refund";
    case "SPLIT": return "resolve";
    default: return null;
  }
}

const paise = (d: Prisma.Decimal | number) => Math.round(Number(d) * 100);
const rupees = (p: number) => new Prisma.Decimal(p).div(100);

/** Ledger rows for a confirmed payment (double-entry style, per user + bucket). */
export function ledgerRows(p: PaymentTransaction): Prisma.LedgerEntryCreateManyInput[] {
  const amt = p.amountInr;
  const row = (userId: string | null, bucket: "WALLET" | "ESCROW", direction: "DEBIT" | "CREDIT", amountInr: Prisma.Decimal, memo: string) =>
    userId ? [{ userId, paymentId: p.id, bucket, direction, amountInr, memo }] : [];
  switch (p.kind) {
    case "FUND":
      return [
        // Paid from the payer's OWN wallet (P6): their ChainWork wallet didn't change.
        ...(p.signer === "EXTERNAL_WALLET" ? [] : row(p.payerUserId, "WALLET", "DEBIT", amt, "Funded phase escrow")),
        ...row(p.payerUserId, "ESCROW", "CREDIT", amt, p.signer === "EXTERNAL_WALLET" ? `Locked in escrow from your wallet (${p.assetSymbol})` : "Locked in escrow"),
      ];
    case "RELEASE":
      return [
        ...row(p.payerUserId, "ESCROW", "DEBIT", amt, "Released from escrow to the worker"),
        ...row(p.payeeUserId, "WALLET", "CREDIT", amt, p.operation === "autoRelease" ? "Payment auto-released" : "Payment released"),
      ];
    case "REFUND":
      // A refused funding was never credited to anyone's books, so returning it posts nothing.
      if (p.operation === FLAGGED_REFUND) return [];
      return [
        ...row(p.payerUserId, "ESCROW", "DEBIT", amt, "Escrow refunded"),
        ...row(p.payeeUserId, "WALLET", "CREDIT", amt, "Refund from escrow"),
      ];
    case "SPLIT": {
      // A split repaired from chain state has no recorded share: log the escrow exit only.
      if (p.splitWorkerBps == null) return row(p.payerUserId, "ESCROW", "DEBIT", amt, "Escrow settled (shares not recorded)");
      const bps = p.splitWorkerBps;
      const total = paise(amt);
      const toWorker = Math.floor((total * bps) / 10_000);
      return [
        ...row(p.payerUserId, "ESCROW", "DEBIT", amt, "Escrow settled by verdict"),
        ...(toWorker > 0 ? row(p.payeeUserId, "WALLET", "CREDIT", rupees(toWorker), `Verdict share (${bps / 100}%)`) : []),
        ...(total - toWorker > 0 ? row(p.payerUserId, "WALLET", "CREDIT", rupees(total - toWorker), `Verdict share (${(10_000 - bps) / 100}%)`) : []),
      ];
    }
    case "WITHDRAW":
      return row(p.payerUserId, "WALLET", "DEBIT", amt, "Withdrawn to bank / UPI");
    case "TOPUP":
      return row(p.payeeUserId, "WALLET", "CREDIT", amt, "Funds added");
    case "MOVE_TO_EXTERNAL":
      return row(p.payerUserId, "WALLET", "DEBIT", amt, "Moved to your external wallet");
    case "STAKE_LOCK":
      return [
        ...row(p.payerUserId, "WALLET", "DEBIT", amt, "Delivery stake locked"),
        ...row(p.payerUserId, "ESCROW", "CREDIT", amt, "Delivery stake held"),
      ];
    case "STAKE_REFUND":
      return [
        ...row(p.payeeUserId, "ESCROW", "DEBIT", amt, "Delivery stake returned"),
        ...row(p.payeeUserId, "WALLET", "CREDIT", amt, "Delivery stake returned"),
      ];
    case "STAKE_FORFEIT":
      return [
        ...row(p.payerUserId, "ESCROW", "DEBIT", amt, "Delivery stake forfeited"),
        ...row(p.payeeUserId, "WALLET", "CREDIT", amt, "Delivery stake received"),
      ];
  }
}

/**
 * The money effects of a confirmed payment — derived only from the stored row.
 * The phase write is guarded on the statuses the event allows; if the phase has
 * already moved (a concurrent request or the reconciler got there first) it is left
 * alone and the drift scan reconciles it, but the ledger still records the movement,
 * because the money DID move on-chain.
 */
export async function applyMoneyEffects(tx: Prisma.TransactionClient, p: PaymentTransaction): Promise<{ phaseUpdated: boolean }> {
  let phaseUpdated = false;
  const event = phaseEventFor(p);
  if (p.phaseId && event) {
    const t = PHASE_TRANSITIONS[event];
    const data: Prisma.PhaseUpdateManyMutationInput = { status: t.to };
    if (event === "fund") data.onChainEscrowAddress = p.mode === "DEMO" ? "demo" : ESCROW_ADDRESS;
    if (event === "approve" || event === "autoRelease") data.releasedAt = p.finalizedAt ?? new Date();
    const res = await tx.phase.updateMany({ where: { id: p.phaseId, status: { in: [...t.from] } }, data });
    phaseUpdated = res.count === 1;
    if (!phaseUpdated) console.warn(`[payments] ${p.kind} ${p.id}: phase ${p.phaseId} was not in ${t.from.join("/")} — left for the drift scan`);
    if (event === "fund" && p.hireId) {
      await tx.contract.updateMany({
        where: { hireId: p.hireId, onChainEscrowAddress: null },
        data: { onChainEscrowAddress: p.mode === "DEMO" ? "demo" : ESCROW_ADDRESS },
      });
    }
  }

  const rows = ledgerRows(p);
  if (rows.length) await tx.ledgerEntry.createMany({ data: rows });

  const escrowType = ESCROW_KINDS[p.kind];
  if (escrowType) {
    await tx.escrowTransaction.create({
      data: {
        phaseId: p.phaseId, type: escrowType, status: "CONFIRMED", amount: p.amountInr,
        fromAddress: p.fromAddress, toAddress: p.toAddress, onChainTxHash: p.txHash, paymentId: p.id,
      },
    });
  }
  return { phaseUpdated };
}

/** Mark CONFIRMED + apply effects atomically. Idempotent: a payment confirms once. */
export async function confirmPayment(
  paymentId: string,
  mined: Partial<Pick<MinedTx, "blockNumber" | "gasUsed" | "effectiveGasPrice">> & { txHash?: string | null },
  opts: { reconciled?: boolean; onConfirmedTx?: RunPaymentHooks["onConfirmedTx"] } = {},
): Promise<ConfirmedPayment | null> {
  return platformDb.$transaction(async (tx) => {
    const res = await tx.paymentTransaction.updateMany({
      where: { id: paymentId, status: { in: ["INITIATED", "SUBMITTED"] } },
      data: {
        status: "CONFIRMED",
        finalizedAt: new Date(),
        reconciled: opts.reconciled ?? false,
        ...(mined.txHash ? { txHash: mined.txHash } : {}),
        ...(mined.blockNumber != null ? { blockNumber: mined.blockNumber } : {}),
        ...(mined.gasUsed != null ? { gasUsed: mined.gasUsed.toString() } : {}),
        ...(mined.gasUsed != null && mined.effectiveGasPrice != null
          ? { gasFeeWei: (mined.gasUsed * mined.effectiveGasPrice).toString() }
          : {}),
      },
    });
    if (res.count !== 1) return null; // already final — never apply effects twice
    const payment = await tx.paymentTransaction.findUniqueOrThrow({ where: { id: paymentId } });
    await applyMoneyEffects(tx, payment);
    const receipt = await issueReceipt(tx, payment);
    if (opts.onConfirmedTx) await opts.onConfirmedTx(tx, payment, receipt);
    return { ...payment, receipt };
  }, { timeout: 20_000 });
}

/** Mark FAILED / CANCELLED and issue its (failure) receipt atomically. Idempotent. */
export async function failPayment(
  paymentId: string,
  f: { code: string; reason: string; cancelled?: boolean; expired?: boolean; reconciled?: boolean },
): Promise<string | null> {
  return platformDb.$transaction(async (tx) => {
    const res = await tx.paymentTransaction.updateMany({
      where: { id: paymentId, status: { in: ["INITIATED", "SUBMITTED"] } },
      data: {
        status: f.expired ? "EXPIRED" : f.cancelled ? "CANCELLED" : "FAILED",
        failureCode: f.code,
        failureReason: f.reason,
        finalizedAt: new Date(),
        reconciled: f.reconciled ?? false,
      },
    });
    if (res.count !== 1) return null; // already final
    const receipt = await issueReceipt(tx, await tx.paymentTransaction.findUniqueOrThrow({ where: { id: paymentId } }));
    return receipt.receiptNo;
  });
}

/** Create the INITIATED record for an attempt. */
/** The asset a phase was funded in (from its confirmed FUND payment), for its exits. */
async function phaseFundingAsset(phaseId: string): Promise<PaymentAsset | null> {
  const f = await platformDb.paymentTransaction.findFirst({
    where: { phaseId, kind: "FUND", status: "CONFIRMED" },
    orderBy: { finalizedAt: "desc" },
    select: { assetSymbol: true, assetAddress: true, assetChainId: true, assetAmount: true, quoteRate: true },
  });
  if (!f || f.assetSymbol === "cwINR") return null;
  return { symbol: f.assetSymbol, address: f.assetAddress, chainId: f.assetChainId, amount: f.assetAmount ?? "0", rate: f.quoteRate ? Number(f.quoteRate) : null };
}

const EXIT_KINDS = new Set<PaymentKind>(["RELEASE", "REFUND", "SPLIT"]);

export async function initiatePayment(spec: PaymentSpec): Promise<PaymentTransaction> {
  const mode = dbMode();
  const asset = spec.asset ?? (spec.phaseId && EXIT_KINDS.has(spec.kind) ? await phaseFundingAsset(spec.phaseId) : null);
  return platformDb.paymentTransaction.create({
    data: {
      kind: spec.kind,
      mode,
      status: "INITIATED",
      operation: spec.operation,
      signer: spec.signer,
      amountInr: new Prisma.Decimal(spec.amountInr),
      assetSymbol: asset?.symbol ?? "cwINR",
      assetAddress: asset?.address ?? null,
      assetChainId: asset ? asset.chainId : mode === "DEMO" ? null : CHAIN_ID,
      assetAmount: asset?.amount ?? toTokenUnits(spec.amountInr).toString(),
      quoteId: asset?.quoteId ?? null,
      quoteRate: asset?.rate != null ? new Prisma.Decimal(asset.rate) : null,
      payerUserId: spec.payerUserId ?? null,
      payeeUserId: spec.payeeUserId ?? null,
      fromAddress: spec.fromAddress ?? null,
      toAddress: spec.toAddress ?? null,
      splitWorkerBps: spec.splitWorkerBps ?? null,
      phaseId: spec.phaseId ?? null,
      hireId: spec.hireId ?? null,
    },
  });
}

/**
 * Run one money movement end to end. `execute` performs the chain operation and
 * returns its tx hash. Never throws for a payment failure — it returns the outcome
 * (the failure is already recorded); it only throws if the DB itself is unreachable.
 */
export async function runPayment(
  spec: PaymentSpec,
  execute: () => Promise<TxHash>,
  hooks: RunPaymentHooks = {},
): Promise<PaymentOutcome> {
  const payment = await initiatePayment(spec);
  let submittedHash: TxHash | null = null;
  let mined: MinedTx | null = null;

  const markSubmitted = async (hash: TxHash) => {
    submittedHash = hash;
    await platformDb.paymentTransaction.updateMany({
      where: { id: payment.id, status: "INITIATED" },
      data: { status: "SUBMITTED", txHash: hash, submittedAt: new Date() },
    });
  };

  let returnedHash: TxHash;
  try {
    returnedHash = await observeChainTx(
      { onSubmitted: markSubmitted, onMined: (tx) => { mined = tx; } },
      execute,
    );
  } catch (e) {
    const c = classifyPaymentError(e);
    if (c.pending && submittedHash) {
      // Broadcast but unconfirmed — the reconciler will settle it either way.
      console.warn(`[payments] ${spec.kind} ${payment.id} pending confirmation (${submittedHash})`);
      return { ok: false, paymentId: payment.id, code: c.code, reason: c.reason, pending: true, cancelled: false, receiptNo: null };
    }
    console.error(`[payments] ${spec.kind} ${payment.id} failed (${c.code}):`, (e as Error).message?.slice(0, 200));
    const receiptNo = await failPayment(payment.id, { code: c.code, reason: c.reason, cancelled: c.cancelled });
    return { ok: false, paymentId: payment.id, code: c.code, reason: c.reason, pending: false, cancelled: c.cancelled, receiptNo };
  }

  const txHash = (submittedHash ?? returnedHash) as TxHash;
  // Demo operations don't broadcast; record the hash before confirming.
  if (!submittedHash) await markSubmitted(txHash);

  const m = mined as MinedTx | null;
  const confirmed = await confirmPayment(
    payment.id,
    { txHash, blockNumber: m?.blockNumber, gasUsed: m?.gasUsed, effectiveGasPrice: m?.effectiveGasPrice },
    { onConfirmedTx: hooks.onConfirmedTx },
  );
  if (confirmed && hooks.afterConfirmed) {
    try {
      await hooks.afterConfirmed(confirmed, confirmed.receipt);
    } catch (e) {
      console.warn(`[payments] after-confirm hook for ${payment.id} failed:`, (e as Error).message?.slice(0, 160));
    }
  }
  return { ok: true, paymentId: payment.id, txHash, receiptNo: confirmed?.receipt.receiptNo ?? null };
}

/**
 * Record a payment whose chain transaction the PAYER already sent from their own wallet
 * (payment plan P6.5). The attempt is recorded first (SUBMITTED with its hash), then
 * `verify` checks the mined transaction against what was agreed; only a verified payment
 * is confirmed (phase, ledger, receipt). A failed check is recorded as FAILED with a
 * receipt and the reason. Never throws for a payment failure.
 */
export async function recordVerifiedPayment(
  spec: PaymentSpec,
  txHash: TxHash,
  verify: () => Promise<MinedTx & { from?: string }>,
  hooks: RunPaymentHooks = {},
): Promise<PaymentOutcome> {
  // A transaction can pay for exactly one thing: refuse a replayed hash before recording.
  const already = await platformDb.paymentTransaction.findUnique({ where: { txHash }, select: { id: true } });
  if (already) {
    return { ok: false, paymentId: already.id, code: "DUPLICATE_TX", reason: "That transaction has already been recorded.", pending: false, cancelled: false, receiptNo: null };
  }
  const payment = await initiatePayment(spec);
  await platformDb.paymentTransaction.updateMany({
    where: { id: payment.id, status: "INITIATED" },
    data: { status: "SUBMITTED", txHash, submittedAt: new Date() },
  });
  let mined: MinedTx & { from?: string };
  try {
    mined = await verify();
  } catch (e) {
    const c = classifyPaymentError(e);
    // A verifier's own finding carries a specific code + plain-language reason; anything
    // else (RPC errors, reverts) is classified like any other chain failure.
    const own = e instanceof Error && e.name === "FundingVerificationError";
    const code = own ? (e as unknown as { code: string }).code : c.code;
    const reason = own ? (e as Error).message : c.reason;
    if (c.pending) {
      return { ok: false, paymentId: payment.id, code: c.code, reason: c.reason, pending: true, cancelled: false, receiptNo: null };
    }
    const receiptNo = await failPayment(payment.id, { code, reason });
    return { ok: false, paymentId: payment.id, code, reason, pending: false, cancelled: false, receiptNo };
  }
  // Record who actually paid and exactly how much arrived (may exceed the quote).
  const paidRaw = (mined as { paidRaw?: bigint }).paidRaw;
  if (mined.from || paidRaw != null) {
    await platformDb.paymentTransaction.update({
      where: { id: payment.id },
      data: { ...(mined.from ? { fromAddress: mined.from } : {}), ...(paidRaw != null ? { assetAmount: paidRaw.toString() } : {}) },
    });
  }
  const confirmed = await confirmPayment(
    payment.id,
    { txHash, blockNumber: mined.blockNumber, gasUsed: mined.gasUsed, effectiveGasPrice: mined.effectiveGasPrice },
    { onConfirmedTx: hooks.onConfirmedTx },
  );
  if (confirmed && hooks.afterConfirmed) {
    try {
      await hooks.afterConfirmed(confirmed, confirmed.receipt);
    } catch (e) {
      console.warn(`[payments] after-confirm hook for ${payment.id} failed:`, (e as Error).message?.slice(0, 160));
    }
  }
  return { ok: true, paymentId: payment.id, txHash, receiptNo: confirmed?.receipt.receiptNo ?? null };
}
