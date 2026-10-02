"use server";

import { revalidatePath } from "next/cache";
import { isHash, verifyTypedData } from "viem";
import type { Prisma } from "@/generated/platform";
import { assertKycVerified, requireRole } from "@/lib/auth/guards";
import { platformDb } from "@/lib/platformDb";
import * as chain from "@/lib/chain/escrow";
import { verifyPhaseFunding } from "@/lib/chain/verifyFunding";
import { publicChainInfo } from "@/lib/chain/publicChain";
import { ESCROW_ADDRESS } from "@/lib/chain/config";
import { payoutAddressFor } from "@/lib/chain/payout";
import { getWalletSummary } from "@/lib/chain/wallet";
import { escrowAssets } from "@/lib/payments/escrowAssets";
import { fundingBlocker, loadFundablePhase } from "@/lib/escrow/fundGates";
import { paymentMode } from "@/lib/payments/mode";
import { createQuote, getQuote, quoteView, type QuoteView } from "@/lib/payments/quotes";
import { quoteExpired } from "@/lib/payments/quoteMath";
import { demoAuthTypedData } from "@/lib/payments/demoAuth";
import { failPayment, initiatePayment, recordVerifiedPayment, runPayment, type PaymentOutcome, type PaymentSpec } from "@/lib/payments/service";

/*
  The multi-crypto payment window's server side (payment plan P6.3–6.5).

    createQuoteAction            → a 5-minute price for this phase in the chosen asset
    submitWalletFundingAction    → testnet: the payer sent approve + fundPhaseWith /
                                   fundPhaseNative from their own wallet; we VERIFY the mined
                                   PhaseFunded event against the quote before anything moves
    authorizeDemoPaymentAction   → demo: the payer signed an EIP-712 authorisation; we verify
                                   it and move demo credit into escrow

  Paying cwINR from the ChainWork wallet stays fundPhaseAction (no quote needed: ₹1 = 1).
*/

export interface CheckoutResult {
  ok?: boolean;
  error?: string;
  code?: string;
  quote?: QuoteView;
  paymentId?: string;
  receiptNo?: string | null;
  pending?: boolean;
}

function outcome(r: PaymentOutcome): CheckoutResult {
  return r.ok
    ? { ok: true, paymentId: r.paymentId, receiptNo: r.receiptNo }
    : { error: r.reason, code: r.code, paymentId: r.paymentId, receiptNo: r.receiptNo, pending: r.pending };
}

export async function createQuoteAction(phaseId: string, assetKey: string): Promise<CheckoutResult> {
  const user = await requireRole("CLIENT");
  const r = await createQuote(phaseId, user.id, assetKey);
  return r.ok ? { ok: true, quote: r.quote } : { error: r.error };
}

/** The FUND payment record for a quote (who pays whom, in what). */
async function fundSpec(quoteId: string, userId: string, signer: "EXTERNAL_WALLET" | "DEMO_SIGNATURE", operation: string) {
  const q = await getQuote(quoteId, userId);
  if (!q) return { error: "That quote doesn't exist. Get a new one." } as const;
  if (q.usedAt) return { error: "That quote was already used." } as const;
  const phase = await loadFundablePhase(q.phaseId);
  const blocker = await fundingBlocker(phase, userId);
  if (blocker || !phase) return { error: blocker ?? "Phase not found." } as const;
  const spec: PaymentSpec = {
    kind: "FUND", operation, signer, amountInr: Number(q.amountInr),
    payerUserId: phase.hire.clientId, payeeUserId: phase.hire.workerId,
    toAddress: q.workerAddress, phaseId: phase.id, hireId: phase.hireId,
    asset: { symbol: q.assetSymbol, address: q.assetAddress, chainId: q.chainId, amount: q.assetAmount, quoteId: q.id, rate: Number(q.rate) },
  };
  return { q, phase, spec } as const;
}

/** Same in-transaction effects as a ChainWork-wallet funding: tell the worker, retire the quote. */
function onFunded(quoteId: string, workerId: string, clientName: string, phaseName: string, hireId: string) {
  return async (tx: Prisma.TransactionClient, _p: unknown, receipt: { receiptNo: string }) => {
    await tx.paymentQuote.updateMany({ where: { id: quoteId, usedAt: null }, data: { usedAt: new Date() } });
    await tx.notification.create({
      data: {
        userId: workerId, type: "ESCROW", title: "Escrow funded",
        body: `${clientName} funded "${phaseName}". You can start work. Receipt ${receipt.receiptNo}.`,
        linkUrl: `/dashboard/worker/hires/${hireId}`,
      },
    });
  };
}

export async function submitWalletFundingAction(quoteId: string, txHash: string): Promise<CheckoutResult> {
  const user = await requireRole("CLIENT");
  if (paymentMode() === "demo") return { error: "In demo mode, payments are authorised by signature, not sent on-chain." };
  if (!isHash(txHash)) return { error: "That isn't a transaction hash." };
  if (await platformDb.paymentTransaction.findUnique({ where: { txHash } })) {
    return { error: "That transaction has already been recorded." };
  }
  const s = await fundSpec(quoteId, user.id, "EXTERNAL_WALLET", "fundPhaseWallet");
  if ("error" in s) return { error: s.error };
  await assertKycVerified(user, `/dashboard/client/hires/${s.phase.hireId}`);

  const res = await recordVerifiedPayment(
    { ...s.spec, fromAddress: null },
    txHash as `0x${string}`,
    () => verifyPhaseFunding({ txHash: txHash as `0x${string}`, phaseId: s.phase.id, workerAddress: s.q.workerAddress, assetAddress: s.q.assetAddress, assetAmount: s.q.assetAmount }),
    { onConfirmedTx: onFunded(s.q.id, s.phase.hire.workerId, user.name, s.phase.name, s.phase.hireId) },
  );
  revalidatePath(`/dashboard/client/hires/${s.phase.hireId}`);
  revalidatePath("/dashboard/client/payments");
  return outcome(res);
}

export async function authorizeDemoPaymentAction(quoteId: string, signer: string, signature: string): Promise<CheckoutResult> {
  const user = await requireRole("CLIENT");
  if (paymentMode() !== "demo") return { error: "Signature payments are only used in demo mode." };
  const s = await fundSpec(quoteId, user.id, "DEMO_SIGNATURE", "demoAuthorization");
  if ("error" in s) return { error: s.error };
  await assertKycVerified(user, `/dashboard/client/hires/${s.phase.hireId}`);
  const spec = { ...s.spec, fromAddress: signer };

  // The price lock ran out before signing: recorded as an EXPIRED attempt (with a receipt).
  if (quoteExpired(s.q.expiresAt)) {
    const p = await initiatePayment(spec);
    const receiptNo = await failPayment(p.id, { code: "EXPIRED", reason: "The 5-minute price lock ran out before you authorised. Nothing was charged — get a new quote.", expired: true });
    return { error: "The price lock ran out. Get a new quote.", code: "EXPIRED", paymentId: p.id, receiptNo };
  }

  const typed = demoAuthTypedData({ ...quoteView(s.q), workerAddress: s.q.workerAddress }, publicChainInfo().id);
  let valid = false;
  try {
    valid = await verifyTypedData({ address: signer as `0x${string}`, ...typed, signature: signature as `0x${string}` });
  } catch {
    valid = false;
  }
  if (!valid) return { error: "That signature doesn't match this payment." };

  const res = await runPayment(spec, () => chain.fundPhase(s.phase.id, s.phase.hire.clientId, s.phase.hire.workerId, Number(s.q.amountInr)), {
    onConfirmedTx: onFunded(s.q.id, s.phase.hire.workerId, user.name, s.phase.name, s.phase.hireId),
  });
  revalidatePath(`/dashboard/client/hires/${s.phase.hireId}`);
  revalidatePath("/dashboard/client/payments");
  return outcome(res);
}

export interface CheckoutAssetView {
  key: string;
  symbol: string;
  name: string;
  decimals: number;
  /** null = native coin. */
  address: string | null;
  icon: string;
  /** Payable from the ChainWork (custodial) wallet. */
  custodialPayable: boolean;
  /** Why it can't be chosen for this phase, or null. */
  unavailable: string | null;
}

export interface CheckoutContext {
  phaseId: string;
  phaseName: string;
  hireId: string;
  amountInr: number;
  workerName: string;
  /** Where the escrow will release to (the worker's payout address). */
  workerAddress: string;
  workerPaidToOwnWallet: boolean;
  escrowAddress: string | null;
  mode: "demo" | "testnet" | "mainnet";
  assets: CheckoutAssetView[];
  chainworkWallet: { address: string; spendableInr: number; demoCreditInr: number; live: boolean };
}

/** Everything the payment window shows before a quote: the phase, recipient and currencies. */
export async function checkoutContextAction(phaseId: string): Promise<{ ok: true; ctx: CheckoutContext } | { ok: false; error: string }> {
  const user = await requireRole("CLIENT");
  const phase = await loadFundablePhase(phaseId);
  const blocker = await fundingBlocker(phase, user.id);
  if (blocker || !phase) return { ok: false, error: blocker ?? "Phase not found." };

  const [workerAddress, workerWallet, mine] = await Promise.all([
    payoutAddressFor(phase.hire.workerId),
    platformDb.wallet.findUnique({ where: { userId: phase.hire.workerId }, select: { custodialAddress: true } }),
    getWalletSummary(user.id),
  ]);
  const ownWallet = !!workerWallet && workerWallet.custodialAddress.toLowerCase() !== workerAddress.toLowerCase();
  const mode = paymentMode();
  return {
    ok: true,
    ctx: {
      phaseId: phase.id, phaseName: phase.name, hireId: phase.hireId, amountInr: Number(phase.amount),
      workerName: phase.hire.worker.name, workerAddress, workerPaidToOwnWallet: ownWallet,
      escrowAddress: mode === "demo" ? null : ESCROW_ADDRESS,
      mode,
      assets: escrowAssets().map((a) => ({
        key: a.key, symbol: a.symbol, name: a.name, decimals: a.decimals, address: a.address, icon: a.icon,
        custodialPayable: a.custodialPayable,
        unavailable: a.key === "cwINR" || ownWallet ? null : `${phase.hire.worker.name} is paid into their ChainWork wallet, which holds rupees. Other currencies open once they link their own wallet.`,
      })),
      chainworkWallet: { address: mine.custodialAddress, spendableInr: mine.spendableInr, demoCreditInr: mine.demoCreditInr, live: mine.live },
    },
  };
}
