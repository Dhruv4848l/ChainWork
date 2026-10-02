import "server-only";
import { isAddress } from "viem";
import { provisionWallet } from "./keystore";
import { adapter } from "./escrow";
import { demoLockedCreditInr } from "./demoAdapter";
import { platformDb } from "@/lib/platformDb";

import { payoutAddressFor } from "./payout";

export { payoutAddressFor };

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
  /** Where releases are paid for NEW fundings (custodial while a fresh link is cooling down). */
  payoutAddress: `0x${string}`;
  currency: string;
  /** What funding a phase can spend: the custodial balance (demo mode: incl. the demo credit). */
  spendableInr: number;
  /** What a withdrawal would move: spendable minus the never-withdrawable demo credit. */
  withdrawableInr: number;
  /** Demo mode only — the unspent part of the showcase grant. Always 0 on testnet/mainnet. */
  demoCreditInr: number;
  /** Balance of the linked external wallet (the stablecoin), or null when none is linked. */
  externalInr: number | null;
  /** As a client: money you have locked in escrow (funded, not yet released/refunded). */
  inEscrowAsClientInr: number;
  /** As a worker: money held in escrow for you. */
  heldForYouInr: number;
  /** false when the chain read failed and the balances are the last cached values. */
  live: boolean;
}

const HELD = ["FUNDED", "IN_PROGRESS", "DELIVERED", "VERIFICATION_WINDOW_OPEN", "DISPUTED"] as const;

async function escrowTotals(userId: string) {
  const [asClient, asWorker] = await Promise.all([
    platformDb.phase.aggregate({ _sum: { amount: true }, where: { status: { in: [...HELD] }, hire: { clientId: userId } } }),
    platformDb.phase.aggregate({ _sum: { amount: true }, where: { status: { in: [...HELD] }, hire: { workerId: userId } } }),
  ]);
  return { inEscrowAsClientInr: Number(asClient._sum.amount ?? 0), heldForYouInr: Number(asWorker._sum.amount ?? 0) };
}

/**
 * Full wallet view (payment plan P3.2): every balance a user has, separately.
 * Resilient by design: a read-only view must never take down the page, so if the RPC
 * is unreachable we fall back to the cached custodial balance and flag `live: false`.
 * Money MOVEMENTS still require the chain and fail loudly — only this read degrades.
 */
export async function getWalletSummary(userId: string): Promise<WalletSummary> {
  const { address: custodial } = await provisionWallet(userId);
  const [wallet, totals, payout] = await Promise.all([
    platformDb.wallet.findUnique({ where: { userId } }),
    escrowTotals(userId),
    payoutAddressFor(userId),
  ]);
  const external = wallet?.externalAddress && isAddress(wallet.externalAddress) ? wallet.externalAddress : null;
  const base = { custodialAddress: custodial, externalAddress: external, payoutAddress: payout, currency: "INR", ...totals };

  try {
    const chain = adapter();
    const [spendableInr, externalInr] = await Promise.all([
      chain.balanceOfInr(custodial),
      external ? chain.balanceOfInr(external) : Promise.resolve(null),
    ]);
    // Demo credit only exists in demo mode, as the locked part of the demo balance. On a
    // real chain Wallet.demoCredit was never minted, so it is not shown at all.
    const demoCreditInr = chain.kind === "demo" ? await demoLockedCreditInr(custodial) : 0;
    const withdrawableInr = Math.max(0, Math.round((spendableInr - demoCreditInr) * 100) / 100);
    await platformDb.wallet.updateMany({ where: { userId }, data: { balanceCache: spendableInr } });
    return { ...base, spendableInr, withdrawableInr, demoCreditInr, externalInr, live: true };
  } catch (e) {
    console.warn(`getWalletSummary: balance read failed, using cached balance — ${(e as Error).message.slice(0, 80)}`);
    const cached = wallet ? Number(wallet.balanceCache) : 0;
    return { ...base, spendableInr: cached, withdrawableInr: cached, demoCreditInr: 0, externalInr: null, live: false };
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
