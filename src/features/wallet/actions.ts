"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guards";
import {
  withdrawCustodial,
  topUpCustodial,
} from "@/lib/chain/wallet";
import { formatInr } from "@/lib/format";
import { platformDb } from "@/lib/platformDb";
import { isExternalPayoutActive, payoutActiveFrom } from "@/lib/wallet/siwe";
import { completeWalletLink, startWalletLink, unlinkWallet } from "@/lib/wallet/link";
import * as chain from "@/lib/chain/escrow";
import { demoLockedCreditInr } from "@/lib/chain/demoAdapter";
import { EscrowRuleError } from "@/lib/chain/escrowRules";
import { runPayment } from "@/lib/payments/service";
import { custodialAddressOf, refreshBalanceCache } from "@/lib/payments/parties";

/** What a withdrawal would move right now: the custodial balance minus locked demo credit. */
async function withdrawableInr(userId: string): Promise<number> {
  const address = await custodialAddressOf(userId);
  const a = chain.adapter();
  const total = await a.balanceOfInr(address);
  const locked = a.kind === "demo" ? await demoLockedCreditInr(address) : 0;
  return Math.max(0, Math.round((total - locked) * 100) / 100);
}

export interface WalletActionState {
  ok?: boolean;
  error?: string;
  message?: string;
}

/** Withdraw the custodial balance to bank/UPI (mocked off-ramp; real on-chain move out). */
export async function withdrawAction(): Promise<WalletActionState> {
  const user = await requireUser();
  const amountInr = await withdrawableInr(user.id);
  if (amountInr <= 0) return { ok: true, message: "Nothing to withdraw — your withdrawable balance is ₹0." };
  const from = await custodialAddressOf(user.id);
  const res = await runPayment(
    { kind: "WITHDRAW", operation: "withdraw", signer: "CUSTODIAL", amountInr, payerUserId: user.id, fromAddress: from, toAddress: "Bank / UPI (mock off-ramp)" },
    async () => {
      const out = await withdrawCustodial(user.id);
      if (!out) throw new EscrowRuleError("InsufficientBalance", "nothing withdrawable");
      return out.txHash;
    },
  );
  revalidatePath("/dashboard/worker/earnings");
  revalidatePath("/dashboard/client/payments");
  if (!res.ok) return { error: res.reason };
  return { ok: true, message: `Withdrew ${formatInr(amountInr)} to your bank/UPI (mock off-ramp).` };
}

/** Bounds for one mock on-ramp top-up (whole rupees). */
const TOPUP_MIN_INR = 100;
const TOPUP_MAX_INR = 500000;

/**
 * Add funds (mock fiat on-ramp) — the ONLY way money enters a ChainWork wallet
 * (payment plan P3.1: funding never mints a shortfall any more).
 */
export async function addFundsAction(amount: number = 10000): Promise<WalletActionState> {
  const user = await requireUser();
  const amountInr = Math.ceil(Number(amount));
  if (!Number.isFinite(amountInr) || amountInr < TOPUP_MIN_INR || amountInr > TOPUP_MAX_INR) {
    return { error: `Enter an amount between ${formatInr(TOPUP_MIN_INR)} and ${formatInr(TOPUP_MAX_INR)}.` };
  }
  const to = await custodialAddressOf(user.id);
  const res = await runPayment(
    { kind: "TOPUP", operation: "mint", signer: "RELAYER", amountInr, payeeUserId: user.id, fromAddress: "UPI / card (mock on-ramp)", toAddress: to },
    () => topUpCustodial(user.id, amountInr),
    { afterConfirmed: () => refreshBalanceCache(user.id) },
  );
  revalidatePath("/dashboard/client/payments");
  revalidatePath("/dashboard/worker/earnings");
  revalidatePath("/dashboard/client/hires", "layout");
  if (!res.ok) return { error: res.reason };
  return { ok: true, message: `Added ${formatInr(amountInr)} to your wallet (mock on-ramp).` };
}

/**
 * Move money from the ChainWork (custodial) wallet to the user's verified external wallet
 * (payment plan P3.3). Only after the link's safety hold — the same rule that guards new
 * payouts — and only the withdrawable balance (never demo credit). Receipted like any payment.
 */
export async function moveToWalletAction(amount?: number): Promise<WalletActionState> {
  const user = await requireUser();
  const wallet = await platformDb.wallet.findUnique({ where: { userId: user.id } });
  if (!wallet?.externalAddress) return { error: "Link your own wallet first." };
  if (!isExternalPayoutActive(wallet.externalLinkedAt)) {
    const from = payoutActiveFrom(wallet.externalLinkedAt)!;
    return { error: `Your new wallet is in its 24-hour safety hold until ${from.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} IST.` };
  }
  const available = await withdrawableInr(user.id);
  const amountInr = amount == null ? available : Math.round(Number(amount) * 100) / 100;
  if (!Number.isFinite(amountInr) || amountInr <= 0) return { error: "Enter an amount to move." };
  if (amountInr > available) return { error: `You can move up to ${formatInr(available)}.` };

  const from = await custodialAddressOf(user.id);
  const to = wallet.externalAddress;
  const res = await runPayment(
    { kind: "MOVE_TO_EXTERNAL", operation: "transfer", signer: "CUSTODIAL", amountInr, payerUserId: user.id, fromAddress: from, toAddress: to },
    () => chain.adapter().transferFromCustodial(user.id, to, amountInr),
    { afterConfirmed: () => refreshBalanceCache(user.id) },
  );
  revalidatePath("/dashboard/worker/earnings");
  revalidatePath("/dashboard/client/payments");
  if (!res.ok) return { error: res.reason };
  return { ok: true, message: `Moved ${formatInr(amountInr)} to ${to.slice(0, 6)}…${to.slice(-4)}. Receipt ${res.receiptNo}.` };
}

/**
 * Step 1 of linking an external payout wallet (payment plan P3.5): the server issues a
 * Sign-In with Ethereum message (single-use nonce, 10-minute expiry) and sends a one-time
 * code to the phone / email on file. Nothing is linked yet.
 */
export async function startWalletLinkAction(address: string, chainId: number): Promise<WalletActionState & { siweMessage?: string; sentTo?: string }> {
  const user = await requireUser();
  const r = await startWalletLink(user.id, address, chainId);
  return r.ok ? { ok: true, siweMessage: r.message, sentTo: r.sentTo } : { error: r.error };
}

/**
 * Step 2: the wallet's signature over that exact message + the one-time code. Links the
 * address; new payouts reach it once the safety hold has passed.
 */
export async function completeWalletLinkAction(siweMessage: string, signature: string, code: string): Promise<WalletActionState> {
  const user = await requireUser();
  const r = await completeWalletLink(user.id, siweMessage, signature, code);
  if (!r.ok) return { error: r.error };
  revalidatePath("/dashboard/worker/earnings");
  revalidatePath("/dashboard/client/payments");
  const when = r.activeFrom
    ? r.activeFrom.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) + " IST"
    : "now";
  return { ok: true, message: `Wallet linked. New escrow payouts go to it from ${when} (24-hour safety hold).` };
}

export async function unlinkWalletAction(): Promise<WalletActionState> {
  const user = await requireUser();
  await unlinkWallet(user.id);
  revalidatePath("/dashboard/worker/earnings");
  revalidatePath("/dashboard/client/payments");
  return { ok: true, message: "Switched back to your ChainWork custodial wallet." };
}
