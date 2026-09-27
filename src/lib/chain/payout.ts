import "server-only";
import { isAddress } from "viem";
import { platformDb } from "@/lib/platformDb";
import { provisionWallet } from "./keystore";

/** The address a user is paid to: their linked external address, else custodial. */
export async function payoutAddressFor(userId: string): Promise<`0x${string}`> {
  const wallet = await platformDb.wallet.findUnique({ where: { userId } });
  if (wallet?.externalAddress && isAddress(wallet.externalAddress)) {
    return wallet.externalAddress as `0x${string}`;
  }
  const { address } = await provisionWallet(userId); // ensures a real custodial address
  return address;
}
