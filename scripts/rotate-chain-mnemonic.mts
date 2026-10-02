/*
  Replace the platform wallet mnemonic (security fix, 2026-10-03).

  Every custodial wallet (and the relayer) is derived from CHAIN_MNEMONIC by index. Swapping
  the mnemonic gives every user a NEW address at the same index. In demo mode, balances and
  open escrows are keyed by address, so they must move with it — this script re-keys, in ONE
  transaction:
    Wallet.custodialAddress            old → new (wallets with a custodialIndex)
    DemoAccount.address                old → new (users + the relayer)
    DemoEscrow.client / .worker        old → new (open escrows pay the recorded address)
  and checks the total demo money is identical before and after. Payment history keeps the
  addresses it was recorded with. External (linked) wallets are untouched.

  On-chain balances at the OLD addresses are NOT moved (testnet tokens; the old phrase is
  public anyway). Use it before going live on testnet, while the site is still in demo mode.

    OLD_CHAIN_MNEMONIC="…" NEW_CHAIN_MNEMONIC="…" [CHAIN_RELAYER_INDEX=0] \
      npm run script -- scripts/rotate-chain-mnemonic.mts            # dry run
    … ROTATE_MNEMONIC=yes npm run script -- scripts/rotate-chain-mnemonic.mts   # apply

  Then set CHAIN_MNEMONIC to the new phrase on the host and redeploy straight away (a stale
  deployment re-syncs Wallet.custodialAddress to its own derivation; the new one re-syncs it
  back — demo balances stay on the new address throughout).
*/
import { mnemonicToAccount } from "viem/accounts";
import { platformDb as db } from "@/lib/platformDb";

const OLD = process.env.OLD_CHAIN_MNEMONIC?.trim();
const NEW = process.env.NEW_CHAIN_MNEMONIC?.trim();
if (!OLD || !NEW) throw new Error("Set OLD_CHAIN_MNEMONIC and NEW_CHAIN_MNEMONIC.");
if (OLD === NEW) throw new Error("The new mnemonic is the same as the old one.");
const RELAYER_INDEX = Number(process.env.CHAIN_RELAYER_INDEX ?? 0);
const APPLY = process.env.ROTATE_MNEMONIC === "yes";

const addr = (m: string, i: number) => mnemonicToAccount(m, { addressIndex: i }).address.toLowerCase();
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const wallets = await db.wallet.findMany({ where: { custodialIndex: { not: null } }, select: { id: true, userId: true, custodialIndex: true, custodialAddress: true } });
const map = new Map<string, string>(); // old → new (lower-case)
map.set(addr(OLD, RELAYER_INDEX), addr(NEW, RELAYER_INDEX));
const mismatched: string[] = [];
for (const w of wallets) {
  const o = addr(OLD, w.custodialIndex!);
  if (w.custodialAddress.toLowerCase() !== o) mismatched.push(`${w.userId} (index ${w.custodialIndex}: stored ${short(w.custodialAddress)}, old phrase gives ${short(o)})`);
  map.set(o, addr(NEW, w.custodialIndex!));
}
if (mismatched.length) {
  throw new Error(`Some wallets weren't derived from OLD_CHAIN_MNEMONIC — wrong old phrase?\n  ${mismatched.join("\n  ")}`);
}

const olds = [...map.keys()];
const news = [...map.values()];
const [accounts, clashes, escrows] = await Promise.all([
  db.demoAccount.findMany({ where: { address: { in: olds } } }),
  db.demoAccount.findMany({ where: { address: { in: news } } }),
  db.demoEscrow.findMany({ where: { OR: [{ client: { in: olds } }, { worker: { in: olds } }] }, select: { key: true, client: true, worker: true, status: true } }),
]);
if (clashes.length) throw new Error(`Demo accounts already exist at ${clashes.length} new address(es) — refusing to merge blindly.`);

const total = async () => {
  const s = await db.demoAccount.aggregate({ _sum: { balance: true, lockedCredit: true }, _count: true });
  return `${s._count} accounts, balance ${s._sum.balance ?? 0}, locked credit ${s._sum.lockedCredit ?? 0}`;
};
const before = await total();
console.log(`Wallets to re-key: ${wallets.length} (+ relayer index ${RELAYER_INDEX} ${short(olds[0])} → ${short(news[0])})`);
console.log(`Demo accounts to move: ${accounts.length} · demo escrows touching old addresses: ${escrows.length}`);
console.log(`Demo money before: ${before}`);

if (!APPLY) {
  console.log("Dry run — nothing changed. Re-run with ROTATE_MNEMONIC=yes to apply.");
  process.exit(0);
}

await db.$transaction(async (tx) => {
  for (const w of wallets) {
    await tx.wallet.update({ where: { id: w.id }, data: { custodialAddress: mnemonicToAccount(NEW, { addressIndex: w.custodialIndex! }).address } });
  }
  for (const a of accounts) {
    await tx.demoAccount.update({ where: { address: a.address }, data: { address: map.get(a.address)! } });
  }
  for (const e of escrows) {
    await tx.demoEscrow.update({
      where: { key: e.key },
      data: { client: map.get(e.client.toLowerCase()) ?? e.client, worker: map.get(e.worker.toLowerCase()) ?? e.worker },
    });
  }
}, { timeout: 60_000 });

const after = await total();
console.log(`Demo money after:  ${after}`);
if (after !== before) throw new Error("Demo totals changed — investigate before redeploying.");
const leftover = await db.demoAccount.count({ where: { address: { in: olds } } });
console.log(`Applied. Accounts left at old addresses: ${leftover}. Now set CHAIN_MNEMONIC on the host and redeploy.`);
await db.$disconnect();
process.exit(0);
