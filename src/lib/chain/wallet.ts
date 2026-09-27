import "server-only";
import { isAddress } from "viem";
import { provisionWallet } from "./keystore";
import { adapter } from "./escrow";
import { demoLockedCreditInr } from "./demoAdapter";
import { platformDb } from "@/lib/platformDb";

export { payoutAddressFor } from "./payout";

/*
  Wallet layer (Phase 9). Custodial wallets are the default: the platform holds the
  key (dev keystore) and the user only ever sees a rupee balance — no keys, no gas.
  Advanced users can link an external self-custody address; once linked, that becomes
  their payout address.

  Balances, top-ups and withdrawals go through the chain adapter (./escrow.ts), so the
  same code serves the real chain (testnet/mainnet) and the dummy-money demo mode.

  KEY MANAGEMENT — read this. In this build custodial keys are HD accounts derived
  from a dev mnemonic (src/lib/chain/keystore.ts) and gas is pre-funded on the local
  chain. That is a LOCAL-DEV stand-in only. Before mainnet, custody MUST move to an
  HSM or a managed custody provider, with a gasless meta-tx relayer sponsoring gas
  (see the pre-mainnet checklist in Phase 13).
*/

export interface WalletSummary {
  custodialAddress: `0x${string}`;
  externalAddress: string | null;
  payoutAddress: `0x${string}`;
  /** Withdrawable balance in ₹ (on-chain in testnet mode; demo balance in demo mode). */
  balanceInr: number;
  /** Showcase-only demo credit: displayed and usable in demos, NEVER withdrawable. */
  demoCreditInr: number;
  currency: string;
  /** false when the balance read failed and balanceInr is the last cached value. */
  live: boolean;
}

/**
 * Full wallet view: addresses + the balance of the payout address.
 * Resilient by design: a read-only balance view must never take down the page, so if
 * the RPC is unreachable (e.g. the chain node is down) we fall back to the last cached
 * balance and flag `live: false`. Money MOVEMENTS (withdraw/top-up) still require the
 * chain and fail loudly — only this read degrades.
 */
export async function getWalletSummary(userId: string): Promise<WalletSummary> {
  const { address: custodial } = await provisionWallet(userId);
  const wallet = await platformDb.wallet.findUnique({ where: { userId } });
  const external = wallet?.externalAddress ?? null;
  const payout = (external && isAddress(external) ? external : custodial) as `0x${string}`;
  const base = { custodialAddress: custodial, externalAddress: external, payoutAddress: payout, currency: "INR" };

  try {
    const chain = adapter();
    const total = await chain.balanceOfInr(payout);
    // Demo mode: the demo-credit grant lives INSIDE the demo balance (as lockedCredit),
    // so report it separately instead of adding Wallet.demoCredit on top. Testnet mode:
    // demoCredit never exists on-chain and is shown alongside the real balance.
    const demoCreditInr = chain.kind === "demo" ? await demoLockedCreditInr(payout) : Number(wallet?.demoCredit ?? 0);
    const balanceInr = chain.kind === "demo" ? total - demoCreditInr : total;
    // keep the cached balance roughly in sync for cheap reads elsewhere
    await platformDb.wallet.updateMany({ where: { userId }, data: { balanceCache: balanceInr } });
    return { ...base, balanceInr, demoCreditInr, live: true };
  } catch (e) {
    console.warn(`getWalletSummary: balance read failed, using cached balance — ${(e as Error).message.slice(0, 80)}`);
    const balanceInr = wallet ? Number(wallet.balanceCache) : 0;
    return { ...base, balanceInr, demoCreditInr: wallet ? Number(wallet.demoCredit) : 0, live: false };
  }
}

/**
 * Mocked fiat OFF-RAMP: converts the custodial balance to fiat and pays it to the
 * user's bank/UPI. On testnet the tokens move from the custodial wallet to the
 * platform's off-ramp sink on-chain — the balance really drops. TODO(production):
 * call a real off-ramp provider here.
 *
 * DEMO-CREDIT RULE: only the withdrawable balance leaves. In testnet mode demo credit
 * never exists on-chain; in demo mode it is the locked part of the demo balance, which
 * the demo adapter never withdraws. Either way it is structurally non-withdrawable.
 */
export async function withdrawCustodial(userId: string): Promise<{ txHash: `0x${string}`; amountInr: number } | null> {
  const res = await adapter().withdrawAll(userId);
  if (res) await platformDb.wallet.updateMany({ where: { userId }, data: { balanceCache: 0 } });
  return res;
}

/**
 * Mocked fiat ON-RAMP: the client pays via UPI/card, the processor converts to
 * stablecoin and credits their custodial wallet. Here the relayer mints test tokens
 * (testnet) or the demo ledger is credited (demo). TODO(production): a real processor.
 */
export async function topUpCustodial(userId: string, amountInr: number): Promise<`0x${string}`> {
  const { address } = await provisionWallet(userId);
  return adapter().mintInr(address, amountInr);
}

/** Link a verified external (self-custody) address as the payout target. */
export async function linkExternalAddress(userId: string, address: string): Promise<void> {
  if (!isAddress(address)) throw new Error("Invalid address");
  await platformDb.wallet.updateMany({ where: { userId }, data: { externalAddress: address } });
}

export async function unlinkExternalAddress(userId: string): Promise<void> {
  await platformDb.wallet.updateMany({ where: { userId }, data: { externalAddress: null } });
}
