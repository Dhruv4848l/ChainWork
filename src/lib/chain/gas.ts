import "server-only";
import { createPublicClient, createWalletClient, http, parseEther, formatEther, type Account } from "viem";
import { RPC_URL, activeChain } from "./config";
import { relayerAccount } from "./keystore";
import { withSignerLock } from "./signerLock";
import { NATIVE_TRANSFER_GAS, gasToRecover, shouldRecoverGas } from "./gasMath";

/*
  GAS SPONSORSHIP for custodial wallets.

  Some escrow actions must be signed by the USER's own custodial wallet, not the
  relayer — the contract records `msg.sender` as the client on `fundPhase`, and a
  token `approve`/`transfer` only counts from the holder. On the local Hardhat node
  every derived account starts with 10,000 ETH, so this never came up. On a real
  testnet (Amoy) those wallets start with ZERO native token and every such
  transaction fails with "insufficient funds for gas" — funding a phase and
  withdrawing would both break on the deployed app.

  So: before a user-signed write, the platform relayer tops the wallet up to a small
  working balance. This is the testnet stand-in for the gasless meta-tx relayer named
  in the pre-mainnet checklist — same intent (users never hold or think about gas),
  simpler mechanism.

  Amounts are configurable because gas prices differ per chain (payment plan P3.7):
    CHAIN_GAS_TOPUP_MIN     — top up when the wallet is below this (default 0.02)
    CHAIN_GAS_TOPUP_AMT     — how much to send (default 0.05)
    CHAIN_GAS_RECOVER_DUST  — don't sweep leftovers smaller than this (default 0.001)
  Leftover sponsored gas is swept back to the relayer after a withdrawal (recoverGas).
*/

const chain = activeChain();
const publicClient = createPublicClient({ chain, transport: http(RPC_URL) });

const MIN_WEI = parseEther(process.env.CHAIN_GAS_TOPUP_MIN ?? "0.02");
const TOPUP_WEI = parseEther(process.env.CHAIN_GAS_TOPUP_AMT ?? "0.05");

/**
 * Make sure `address` can pay for gas, funding it from the relayer if not.
 * A no-op when the wallet already has enough (so it costs one RPC read on the
 * local chain, where accounts are pre-funded).
 */
export async function ensureGas(address: `0x${string}`): Promise<void> {
  const balance = await publicClient.getBalance({ address });
  if (balance >= MIN_WEI) return;

  const relayer = relayerAccount();
  const relayerBalance = await publicClient.getBalance({ address: relayer.address });
  if (relayerBalance < TOPUP_WEI * BigInt(2)) {
    throw new Error(
      `Platform relayer is out of gas (${formatEther(relayerBalance)} on chain ${chain.id}). ` +
        `Top up ${relayer.address} before escrow transactions can be signed.`,
    );
  }

  const wc = createWalletClient({ account: relayer, chain, transport: http(RPC_URL) });
  // Relayer sends are serialised with every other relayer transaction (W6).
  const hash = await withSignerLock(relayer.address, () =>
    wc.sendTransaction({ to: address, value: TOPUP_WEI - balance, chain, account: relayer }),
  );
  await publicClient.waitForTransactionReceipt({ hash });
}

const DUST_WEI = parseEther(process.env.CHAIN_GAS_RECOVER_DUST ?? "0.001");

/**
 * Sweep leftover sponsored gas from a custodial wallet back to the relayer (payment plan
 * P3.7). Called after a withdrawal empties the wallet. Best-effort: never throws, and a
 * no-op on the local Hardhat chain (its accounts hold genuine pre-funded dev ETH).
 * TODO(pre-mainnet): a gasless relayer (ERC-2771 / ERC-4337) removes per-wallet gas.
 */
export async function recoverGas(account: Account): Promise<bigint> {
  try {
    if (!shouldRecoverGas(chain.id)) return BigInt(0);
    const [balance, gasPrice] = await Promise.all([publicClient.getBalance({ address: account.address }), publicClient.getGasPrice()]);
    const value = gasToRecover(balance, gasPrice, DUST_WEI);
    if (value === BigInt(0)) return BigInt(0);
    const wc = createWalletClient({ account, chain, transport: http(RPC_URL) });
    const hash = await withSignerLock(account.address, () =>
      wc.sendTransaction({ to: relayerAccount().address, value, gas: NATIVE_TRANSFER_GAS, gasPrice, chain, account }),
    );
    await publicClient.waitForTransactionReceipt({ hash });
    return value;
  } catch (e) {
    console.warn(`[gas] recovery from ${account.address} skipped:`, (e as Error).message?.slice(0, 120));
    return BigInt(0);
  }
}
