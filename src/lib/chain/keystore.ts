import "server-only";
import fs from "node:fs";
import path from "node:path";
import { mnemonicToAccount } from "viem/accounts";
import { MNEMONIC, RELAYER_INDEX } from "./config";
import { platformDb } from "@/lib/platformDb";

/*
  Custodial-wallet keystore. Each user is assigned a deterministic HD account
  derived from the (dev/testnet) mnemonic, indexed 1.. (index 0 is the platform
  relayer). The user's real on-chain address is written back to
  Wallet.custodialAddress on first provision.

  WHERE THE INDEX LIVES — this matters for deployment. The mapping
  userId -> addressIndex is stored in the DATABASE (Wallet.custodialIndex), not in
  a local JSON file. A serverless host (Vercel) gives every request a read-only,
  ephemeral filesystem: a file-backed map would either throw on write or silently
  reset on the next cold start and hand the SAME index — i.e. the same wallet and
  the same money — to two different users. The column is @unique, so the database
  itself refuses a double allocation; races lose the write and retry.

  Local dev keeps its history: if the legacy .chain-keystore.json is present (and
  we're not in production) its index for a user is adopted on first provision, so
  wallets that already hold local test balances keep their addresses.

  PRODUCTION NOTE: real custody must use per-user keys in an HSM / managed custody
  provider and a gasless meta-tx relayer — NOT a shared mnemonic. This is a
  clearly-scoped testnet stand-in (see the pre-mainnet checklist).
*/
const KEYSTORE_PATH = path.join(process.cwd(), ".chain-keystore.json");
const MAX_ALLOC_ATTEMPTS = 5;

/** Legacy dev file map (userId -> index). Never used in production; never throws. */
function legacyFileIndex(userId: string): number | undefined {
  if (process.env.NODE_ENV === "production") return undefined;
  try {
    const ks = JSON.parse(fs.readFileSync(KEYSTORE_PATH, "utf8")) as Record<string, number>;
    const i = ks[userId];
    return typeof i === "number" && Number.isInteger(i) && i > RELAYER_INDEX ? i : undefined;
  } catch {
    return undefined;
  }
}

export function relayerAccount() {
  return mnemonicToAccount(MNEMONIC, { addressIndex: RELAYER_INDEX });
}

export function accountAtIndex(index: number) {
  return mnemonicToAccount(MNEMONIC, { addressIndex: index });
}

/** Lowest free index above the relayer, per the DB's own view. */
async function nextFreeIndex(): Promise<number> {
  const agg = await platformDb.wallet.aggregate({ _max: { custodialIndex: true } });
  const max = agg._max.custodialIndex ?? RELAYER_INDEX;
  return Math.max(max, RELAYER_INDEX) + 1;
}

/**
 * Claim `index` for this user, but only while the row is still unallocated.
 * Returns false if someone else won the race (or the index is already taken).
 */
async function tryClaim(userId: string, index: number): Promise<boolean> {
  try {
    const res = await platformDb.wallet.updateMany({
      where: { userId, custodialIndex: null },
      data: { custodialIndex: index, custodialAddress: accountAtIndex(index).address },
    });
    return res.count === 1;
  } catch {
    // Unique-constraint violation: that index went to another user. Retry higher.
    return false;
  }
}

/** Ensure the user has a custodial account; returns its index + address. */
export async function provisionWallet(userId: string): Promise<{ index: number; address: `0x${string}` }> {
  const existing = await platformDb.wallet.findUnique({
    where: { userId },
    select: { custodialIndex: true },
  });
  if (!existing) {
    throw new Error(`No wallet row for user ${userId} — a wallet is created at signup.`);
  }

  if (existing.custodialIndex !== null) {
    const address = accountAtIndex(existing.custodialIndex).address;
    // Keep the stored address in step with the derived one (e.g. after a mnemonic swap).
    await platformDb.wallet.updateMany({ where: { userId }, data: { custodialAddress: address } });
    return { index: existing.custodialIndex, address };
  }

  // First provision. Prefer the legacy local-dev index so existing test balances
  // stay reachable; otherwise take the next free slot. Retry on lost races.
  const preferred = legacyFileIndex(userId);
  if (preferred !== undefined && (await tryClaim(userId, preferred))) {
    return { index: preferred, address: accountAtIndex(preferred).address };
  }

  for (let attempt = 0; attempt < MAX_ALLOC_ATTEMPTS; attempt++) {
    const index = (await nextFreeIndex()) + attempt;
    if (await tryClaim(userId, index)) {
      return { index, address: accountAtIndex(index).address };
    }
    // Lost the race — re-read. Another request may have provisioned THIS user.
    const now = await platformDb.wallet.findUnique({
      where: { userId },
      select: { custodialIndex: true },
    });
    if (now?.custodialIndex != null) {
      return { index: now.custodialIndex, address: accountAtIndex(now.custodialIndex).address };
    }
  }
  throw new Error(`Could not allocate a custodial wallet index for user ${userId} (contention).`);
}

/** The user's account (must be provisioned first). */
export async function accountForUser(userId: string) {
  const { index } = await provisionWallet(userId);
  return accountAtIndex(index);
}
