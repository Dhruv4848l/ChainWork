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

export interface WalletActionState {
  ok?: boolean;
  error?: string;
  message?: string;
}

/** Withdraw the custodial balance to bank/UPI (mocked off-ramp; real on-chain move out). */
export async function withdrawAction(): Promise<WalletActionState> {
  const user = await requireUser();
  try {
    const res = await withdrawCustodial(user.id);
    revalidatePath("/dashboard/worker/earnings");
    revalidatePath("/dashboard/client/payments");
    if (!res) return { ok: true, message: "Nothing to withdraw — your balance is ₹0." };
    return { ok: true, message: `Withdrew ${formatInr(res.amountInr)} to your bank/UPI (mock off-ramp).` };
  } catch (e) {
    console.error("withdraw failed:", e);
    return { error: "The withdrawal failed. Please try again." };
  }
}

/** Add funds (mock fiat on-ramp) — credits a fixed demo amount to the custodial wallet. */
export async function addFundsAction(): Promise<WalletActionState> {
  const user = await requireUser();
  try {
    await topUpCustodial(user.id, 10000);
    revalidatePath("/dashboard/client/payments");
    revalidatePath("/dashboard/worker/earnings");
    return { ok: true, message: "Added ₹10,000 to your wallet (mock on-ramp)." };
  } catch (e) {
    console.error("addFunds failed:", e);
    return { error: "Adding funds failed. Please try again." };
  }
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
