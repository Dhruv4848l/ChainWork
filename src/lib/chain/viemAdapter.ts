import "server-only";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  formatUnits,
  maxUint256,
  type Account,
} from "viem";
import {
  RPC_URL,
  ESCROW_ADDRESS,
  TOKEN_ADDRESS,
  TOKEN_DECIMALS,
  phaseEscrowAbi,
  erc20Abi,
  activeChain,
  assertChainWritable,
} from "./config";
import { relayerAccount, accountForUser, provisionWallet } from "./keystore";
import { ensureGas } from "./gas";
import { payoutAddressFor } from "./payout";
import { ESCROW_STATUS_NAMES } from "./escrowRules";
import { keyFor } from "./keys";
import type { ChainAdapter, EscrowView, TxHash } from "./types";

/*
  The REAL chain: PhaseEscrow + the stablecoin, via viem (testnet / mainnet modes).
  Each write waits for a confirmation and returns the tx hash so callers can record it.

  Custodial model (dev/testnet): the platform relayer holds ATTESTOR + DISPUTE roles and
  mints the test stablecoin (mock fiat on-ramp). Client/worker custodial accounts sign
  their own party actions (fund, lockStake, withdraw); their gas is sponsored by the
  relayer (./gas.ts). Every write first calls assertChainWritable(), which refuses to
  sign with the public Hardhat keys on a shared network.
*/

const chain = activeChain();
const publicClient = createPublicClient({ chain, transport: http(RPC_URL) });

function walletFor(account: Account) {
  return createWalletClient({ account, chain, transport: http(RPC_URL) });
}

export function toTokenUnits(amountInr: number | string): bigint {
  return parseUnits(String(amountInr), TOKEN_DECIMALS);
}

export function fromTokenUnits(wei: bigint): number {
  return Number(formatUnits(wei, TOKEN_DECIMALS));
}

async function waitFor(hash: TxHash) {
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

// ---- token helpers (mock on-ramp) ----
async function balanceOf(address: `0x${string}`): Promise<bigint> {
  return publicClient.readContract({ address: TOKEN_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [address] });
}

async function mint(to: `0x${string}`, amount: bigint): Promise<TxHash> {
  const relayer = relayerAccount();
  const hash = await walletFor(relayer).writeContract({
    address: TOKEN_ADDRESS, abi: erc20Abi, functionName: "mint", args: [to, amount], chain, account: relayer,
  });
  return waitFor(hash);
}

async function ensureStablecoin(address: `0x${string}`, needed: bigint) {
  const bal = await balanceOf(address);
  if (bal >= needed) return;
  // Mock fiat on-ramp: the relayer mints the shortfall to the user's wallet.
  // TODO(payment plan P3.1 / W2): stop minting here — funding must spend the real balance.
  await mint(address, needed - bal);
}

async function ensureApproval(account: Account, needed: bigint) {
  const allowance = (await publicClient.readContract({
    address: TOKEN_ADDRESS, abi: erc20Abi, functionName: "allowance", args: [account.address, ESCROW_ADDRESS],
  })) as bigint;
  if (allowance >= needed) return;
  await ensureGas(account.address); // the approve is signed by the user
  const hash = await walletFor(account).writeContract({
    address: TOKEN_ADDRESS, abi: erc20Abi, functionName: "approve", args: [ESCROW_ADDRESS, maxUint256], chain, account,
  });
  await waitFor(hash);
}

/** A relayer-signed PhaseEscrow call (attestor / dispute-resolver operations). */
async function relayerCall(functionName: string, args: readonly unknown[]): Promise<TxHash> {
  assertChainWritable();
  const relayer = relayerAccount();
  const hash = await walletFor(relayer).writeContract({
    address: ESCROW_ADDRESS, abi: phaseEscrowAbi, functionName, args, chain, account: relayer,
  } as Parameters<ReturnType<typeof walletFor>["writeContract"]>[0]);
  return waitFor(hash);
}

export const viemAdapter: ChainAdapter = {
  kind: "viem",

  /** Client funds a phase: mint (mock on-ramp) + approve + fundPhase, signed by the client. */
  async fundPhase(phaseId, clientUserId, workerUserId, amountInr) {
    assertChainWritable();
    const client = await accountForUser(clientUserId);
    // Pay the worker's payout address — their linked external wallet if they have one,
    // otherwise their custodial wallet (Phase 9).
    const workerAddr = await payoutAddressFor(workerUserId);
    const amount = toTokenUnits(amountInr);
    await ensureStablecoin(client.address, amount);
    await ensureApproval(client, amount);
    await ensureGas(client.address); // fundPhase records msg.sender as the client
    const hash = await walletFor(client).writeContract({
      address: ESCROW_ADDRESS, abi: phaseEscrowAbi, functionName: "fundPhase", args: [keyFor(phaseId), workerAddr, amount], chain, account: client,
    });
    return waitFor(hash);
  },

  /** Attestor relays delivery + the off-chain verification deadline (unix seconds). */
  markDelivered: (phaseId, releaseEligibleAfter) => relayerCall("markDelivered", [keyFor(phaseId), BigInt(releaseEligibleAfter)]),
  /** Client approves — the attestor relays it and the contract releases to the worker. */
  approveRelease: (phaseId) => relayerCall("approveRelease", [keyFor(phaseId)]),
  /** Attestor triggers auto-release (contract enforces it can't fire early). */
  autoRelease: (phaseId) => relayerCall("autoRelease", [keyFor(phaseId)]),
  raiseDispute: (phaseId) => relayerCall("raiseDispute", [keyFor(phaseId)]),
  resolveDispute: (phaseId, workerBps) => relayerCall("resolveDispute", [keyFor(phaseId), BigInt(workerBps)]),
  refundToClient: (phaseId) => relayerCall("refundToClient", [keyFor(phaseId)]),

  async readEscrow(phaseId): Promise<EscrowView> {
    const r = (await publicClient.readContract({
      address: ESCROW_ADDRESS, abi: phaseEscrowAbi, functionName: "getEscrow", args: [keyFor(phaseId)],
    })) as [string, string, bigint, number, bigint];
    return {
      client: r[0], worker: r[1], amount: fromTokenUnits(r[2]),
      status: ESCROW_STATUS_NAMES[r[3]] ?? "NONE", releaseEligibleAfter: Number(r[4]),
    };
  },

  /** Worker locks a refundable delivery stake for a hire (signed by the worker). */
  async lockStake(hireId, workerUserId, clientUserId, amountInr) {
    assertChainWritable();
    const worker = await accountForUser(workerUserId);
    const client = await accountForUser(clientUserId);
    const amount = toTokenUnits(amountInr);
    await ensureStablecoin(worker.address, amount);
    await ensureApproval(worker, amount);
    await ensureGas(worker.address); // the stake is locked by the worker themselves
    const hash = await walletFor(worker).writeContract({
      address: ESCROW_ADDRESS, abi: phaseEscrowAbi, functionName: "lockStake", args: [keyFor(hireId), client.address, amount], chain, account: worker,
    });
    return waitFor(hash);
  },
  refundStake: (hireId) => relayerCall("refundStake", [keyFor(hireId)]),
  forfeitStake: (hireId) => relayerCall("forfeitStake", [keyFor(hireId)]),

  async balanceOfInr(address) {
    return fromTokenUnits(await balanceOf(address as `0x${string}`));
  },

  async mintInr(address, amountInr) {
    assertChainWritable();
    return mint(address as `0x${string}`, toTokenUnits(amountInr));
  },

  /**
   * Mocked fiat OFF-RAMP: on testnet there's no bank, so the tokens move out of the
   * custodial wallet to the platform relayer (the "off-ramp sink") — the balance
   * really drops. TODO(production): a real off-ramp provider.
   */
  async withdrawAll(userId) {
    assertChainWritable();
    await provisionWallet(userId);
    const account = await accountForUser(userId);
    const bal = await balanceOf(account.address);
    if (bal === BigInt(0)) return null;
    await ensureGas(account.address); // the transfer out is signed by the user
    const txHash = await walletFor(account).writeContract({
      address: TOKEN_ADDRESS, abi: erc20Abi, functionName: "transfer", args: [relayerAccount().address, bal], chain, account,
    });
    await waitFor(txHash);
    return { txHash, amountInr: fromTokenUnits(bal) };
  },
};
