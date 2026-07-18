import "server-only";
import fs from "node:fs";
import path from "node:path";
import { mnemonicToAccount } from "viem/accounts";
import { MNEMONIC, RELAYER_INDEX } from "./config";
import { platformDb } from "@/lib/platformDb";

/*
  DEV custodial-wallet keystore. Each user is assigned a deterministic HD account
  derived from the (dev) mnemonic, indexed 1.. (index 0 is the platform relayer).
  The mapping userId -> addressIndex is persisted to a gitignored file so the same
  address is reused across restarts. The user's real on-chain address is written
  back to Wallet.custodialAddress on first provision.

  PRODUCTION NOTE: real custody must use per-user keys in an HSM / managed custody
  provider and a gasless meta-tx relayer — NOT a shared dev mnemonic. This is a
  clearly-scoped local-dev stand-in (hardened in Phase 9 / pre-mainnet checklist).
*/
const KEYSTORE_PATH = path.join(process.cwd(), ".chain-keystore.json");

type Keystore = Record<string, number>; // userId -> addressIndex

function load(): Keystore {
  try {
    return JSON.parse(fs.readFileSync(KEYSTORE_PATH, "utf8"));
  } catch {
    return {};
  }
}
function save(ks: Keystore) {
  fs.writeFileSync(KEYSTORE_PATH, JSON.stringify(ks, null, 2));
}

export function relayerAccount() {
  return mnemonicToAccount(MNEMONIC, { addressIndex: RELAYER_INDEX });
}

export function accountAtIndex(index: number) {
  return mnemonicToAccount(MNEMONIC, { addressIndex: index });
}

/** Ensure the user has a custodial account; returns its index + address. */
export async function provisionWallet(userId: string): Promise<{ index: number; address: `0x${string}` }> {
  const ks = load();
  let index = ks[userId];
  if (index === undefined) {
    const used = new Set(Object.values(ks));
    index = RELAYER_INDEX + 1;
    while (used.has(index)) index++;
    ks[userId] = index;
    save(ks);
  }
  const address = accountAtIndex(index).address;
  // Keep the DB's custodial address in sync with the real on-chain address.
  await platformDb.wallet.updateMany({
    where: { userId },
    data: { custodialAddress: address },
  });
  return { index, address };
}

/** The user's account (must be provisioned first). */
export async function accountForUser(userId: string) {
  const { index } = await provisionWallet(userId);
  return accountAtIndex(index);
}
