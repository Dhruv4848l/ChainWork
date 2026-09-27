import "server-only";
import { platformDb } from "@/lib/platformDb";
import { provisionWallet } from "@/lib/chain/keystore";
import { ESCROW_ADDRESS } from "@/lib/chain/config";
import * as chain from "@/lib/chain/escrow";
import { paymentMode } from "./mode";

/*
  Small helpers the money actions share when describing a payment's parties.
*/

/** The user's custodial address (provisioning it on first use). */
export async function custodialAddressOf(userId: string): Promise<string> {
  return (await provisionWallet(userId)).address;
}

/** What to print as the escrow side of a movement. */
export function escrowAddressLabel(): string {
  return paymentMode() === "demo" ? "ChainWork demo escrow" : ESCROW_ADDRESS;
}

/** Re-read a user's payout balance into Wallet.balanceCache (best-effort, for cheap reads). */
export async function refreshBalanceCache(userId: string): Promise<void> {
  try {
    const wallet = await platformDb.wallet.findUnique({ where: { userId } });
    if (!wallet) return;
    const address = wallet.externalAddress ?? (await provisionWallet(userId)).address;
    const bal = await chain.balanceOfInr(address);
    await platformDb.wallet.update({ where: { userId }, data: { balanceCache: bal } });
  } catch (e) {
    console.warn(`refreshBalanceCache(${userId}) skipped:`, (e as Error).message?.slice(0, 100));
  }
}
