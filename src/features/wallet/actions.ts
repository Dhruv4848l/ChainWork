"use server";

import { revalidatePath } from "next/cache";
import { verifyMessage } from "viem";
import { requireUser } from "@/lib/auth/guards";
import {
  withdrawCustodial,
  topUpCustodial,
  linkExternalAddress,
  unlinkExternalAddress,
} from "@/lib/chain/wallet";
import { formatInr } from "@/lib/format";
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

/** Add funds (mock fiat on-ramp) — credits a fixed demo amount to the custodial wallet. */
export async function addFundsAction(): Promise<WalletActionState> {
  const user = await requireUser();
  const amountInr = 10000;
  const to = await custodialAddressOf(user.id);
  const res = await runPayment(
    { kind: "TOPUP", operation: "mint", signer: "RELAYER", amountInr, payeeUserId: user.id, fromAddress: "UPI / card (mock on-ramp)", toAddress: to },
    () => topUpCustodial(user.id, amountInr),
    { afterConfirmed: () => refreshBalanceCache(user.id) },
  );
  revalidatePath("/dashboard/client/payments");
  revalidatePath("/dashboard/worker/earnings");
  if (!res.ok) return { error: res.reason };
  return { ok: true, message: `Added ${formatInr(amountInr)} to your wallet (mock on-ramp).` };
}

/**
 * Verify ownership of an external wallet by signature, then link it as the payout
 * address. The signature proves control of the address; it moves no funds and grants
 * no spending permission.
 */
export async function verifyAndLinkWalletAction(
  address: string,
  message: string,
  signature: string
): Promise<WalletActionState> {
  const user = await requireUser();
  try {
    const valid = await verifyMessage({
      address: address as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });
    if (!valid) return { error: "Signature didn't match that address." };
    await linkExternalAddress(user.id, address);
    revalidatePath("/dashboard/worker/earnings");
    revalidatePath("/dashboard/client/payments");
    return { ok: true, message: "External wallet linked — payouts now settle to your address." };
  } catch (e) {
    console.error("verifyAndLink failed:", e);
    return { error: "Could not verify the signature." };
  }
}

export async function unlinkWalletAction(): Promise<WalletActionState> {
  const user = await requireUser();
  await unlinkExternalAddress(user.id);
  revalidatePath("/dashboard/worker/earnings");
  revalidatePath("/dashboard/client/payments");
  return { ok: true, message: "Switched back to your ChainWork custodial wallet." };
}
