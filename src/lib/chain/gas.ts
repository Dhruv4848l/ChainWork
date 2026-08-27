import "server-only";
import { createPublicClient, createWalletClient, http, parseEther, formatEther } from "viem";
import { RPC_URL, activeChain } from "./config";
import { relayerAccount } from "./keystore";

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

  Amounts are configurable because gas prices differ per chain:
    CHAIN_GAS_TOPUP_MIN  — top up when the wallet is below this (default 0.02)
    CHAIN_GAS_TOPUP_AMT  — how much to send (default 0.05)
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
  const hash = await wc.sendTransaction({
    to: address,
    value: TOPUP_WEI - balance,
    chain,
    account: relayer,
  });
  await publicClient.waitForTransactionReceipt({ hash });
}
