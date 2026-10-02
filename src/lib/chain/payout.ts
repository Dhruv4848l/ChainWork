import "server-only";
import { isAddress } from "viem";
import { platformDb } from "@/lib/platformDb";
import { isExternalPayoutActive } from "@/lib/wallet/siwe";
import { provisionWallet } from "./keystore";

/**
 * The address a user is paid to for NEW escrow fundings: their linked external address
 * once its safety hold has passed (payment plan P3.5), otherwise their custodial wallet.
 * A phase already funded keeps paying the worker address recorded on-chain at funding.
 */
export async function payoutAddressFor(userId: string, now: Date = new Date()): Promise<`0x${string}`> {
  const wallet = await platformDb.wallet.findUnique({ where: { userId } });
  if (wallet?.externalAddress && isAddress(wallet.externalAddress) && isExternalPayoutActive(wallet.externalLinkedAt, now)) {
    return wallet.externalAddress as `0x${string}`;
  }
  const { address } = await provisionWallet(userId); // ensures a real custodial address
  return address;
}
