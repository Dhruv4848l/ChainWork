import "server-only";
import { createPublicClient, createWalletClient, http, formatUnits, parseUnits, isAddress } from "viem";
import { RPC_URL, TOKEN_ADDRESS, TOKEN_DECIMALS, erc20Abi, activeChain } from "./config";
import { relayerAccount, accountForUser, provisionWallet } from "./keystore";
import { ensureGas } from "./gas";
import { platformDb } from "@/lib/platformDb";

/*
  Wallet layer (Phase 9). Custodial wallets are the default: the platform holds the
  key (dev keystore) and the user only ever sees a rupee balance — no keys, no gas.
  Advanced users can link an external self-custody address; once linked, that becomes
  their payout address.

  KEY MANAGEMENT — read this. In this build custodial keys are HD accounts derived
  from a dev mnemonic (src/lib/chain/keystore.ts) and gas is pre-funded on the local
  chain. That is a LOCAL-DEV stand-in only. Before mainnet, custody MUST move to an
  HSM or a managed custody provider, with a gasless meta-tx relayer sponsoring gas
  (see the pre-mainnet checklist in Phase 13).
*/

const chain = activeChain();
const publicClient = createPublicClient({ chain, transport: http(RPC_URL) });

async function balanceWei(address: `0x${string}`): Promise<bigint> {
  return publicClient.readContract({ address: TOKEN_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [address] });
}
function toInr(wei: bigint): number {
  return Number(formatUnits(wei, TOKEN_DECIMALS));
}

/** The address a user is paid to: their linked external address, else custodial. */
export async function payoutAddressFor(userId: string): Promise<`0x${string}`> {
  const wallet = await platformDb.wallet.findUnique({ where: { userId } });
  if (wallet?.externalAddress && isAddress(wallet.externalAddress)) {
    return wallet.externalAddress as `0x${string}`;
  }
  const { address } = await provisionWallet(userId); // ensures a real custodial address
  return address;
}

export interface WalletSummary {
  custodialAddress: `0x${string}`;
  externalAddress: string | null;
  payoutAddress: `0x${string}`;
  balanceInr: number;
  /** Showcase-only demo credit: displayed and usable in demos, NEVER withdrawable. */
  demoCreditInr: number;
  currency: string;
  /** false when the on-chain read failed and balanceInr is the last cached value. */
  live: boolean;
}

/**
 * Full wallet view: addresses + the on-chain balance of the payout address.
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

  const demoCreditInr = wallet ? Number(wallet.demoCredit) : 0;
  try {
    const balanceInr = toInr(await balanceWei(payout));
    // keep the cached balance roughly in sync for cheap reads elsewhere
    await platformDb.wallet.updateMany({ where: { userId }, data: { balanceCache: balanceInr } });
    return { custodialAddress: custodial, externalAddress: external, payoutAddress: payout, balanceInr, demoCreditInr, currency: "INR", live: true };
  } catch (e) {
    console.warn(`getWalletSummary: on-chain read failed, using cached balance — ${(e as Error).message.slice(0, 80)}`);
    const balanceInr = wallet ? Number(wallet.balanceCache) : 0;
    return { custodialAddress: custodial, externalAddress: external, payoutAddress: payout, balanceInr, demoCreditInr, currency: "INR", live: false };
  }
}

/**
 * Mocked fiat OFF-RAMP: converts the custodial balance to fiat and pays it to the
 * user's bank/UPI. On testnet there's no real bank, so we move the tokens out of the
 * custodial wallet to the platform relayer (the "off-ramp sink") on-chain and record
 * it — the balance really drops. TODO(production): call a real off-ramp provider here.
 *
 * DEMO-CREDIT RULE: this reads the REAL on-chain balance only. The Wallet.demoCredit
 * showcase money never exists on-chain, so it can never leave through here — that's
 * the "non-withdrawable" guarantee, enforced structurally rather than by an if.
 */
export async function withdrawCustodial(userId: string): Promise<{ txHash: `0x${string}`; amountInr: number } | null> {
  const account = await accountForUser(userId);
  const bal = await balanceWei(account.address);
  if (bal === BigInt(0)) return null;
  await ensureGas(account.address); // the transfer out is signed by the user
  const wc = createWalletClient({ account, chain, transport: http(RPC_URL) });
  const txHash = await wc.writeContract({
    address: TOKEN_ADDRESS, abi: erc20Abi, functionName: "transfer",
    args: [relayerAccount().address, bal], chain, account,
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  const amountInr = toInr(bal);
  await platformDb.wallet.updateMany({ where: { userId }, data: { balanceCache: 0 } });
  return { txHash, amountInr };
}

/**
 * Mocked fiat ON-RAMP: the client pays via UPI/card, the processor converts to
 * stablecoin and credits their custodial wallet. Here the relayer mints test tokens
 * to the custodial address. TODO(production): integrate a real payment processor.
 */
export async function topUpCustodial(userId: string, amountInr: number): Promise<`0x${string}`> {
  const { address } = await provisionWallet(userId);
  const relayer = relayerAccount();
  const wc = createWalletClient({ account: relayer, chain, transport: http(RPC_URL) });
  const txHash = await wc.writeContract({
    address: TOKEN_ADDRESS, abi: erc20Abi, functionName: "mint",
    args: [address, parseUnits(String(amountInr), TOKEN_DECIMALS)], chain, account: relayer,
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  return txHash;
}

/** Link a verified external (self-custody) address as the payout target. */
export async function linkExternalAddress(userId: string, address: string): Promise<void> {
  if (!isAddress(address)) throw new Error("Invalid address");
  await platformDb.wallet.updateMany({ where: { userId }, data: { externalAddress: address } });
}

export async function unlinkExternalAddress(userId: string): Promise<void> {
  await platformDb.wallet.updateMany({ where: { userId }, data: { externalAddress: null } });
}
