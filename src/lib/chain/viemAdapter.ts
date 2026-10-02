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
import { ESCROW_STATUS_NAMES, EscrowRuleError } from "./escrowRules";
import { keyFor } from "./keys";
import { withSignerLock } from "./signerLock";
import { currentChainTxObserver } from "@/lib/payments/observer";
import type { ChainAdapter, EscrowView, TxHash } from "./types";

/*
  The REAL chain: PhaseEscrow + the stablecoin, via viem (testnet / mainnet modes).
  Each write waits for a confirmation and returns the tx hash so callers can record it.

  Custodial model (dev/testnet): the platform relayer holds ATTESTOR + DISPUTE roles and
  mints the test stablecoin ONLY through the explicit mock fiat on-ramp (mintInr). Client/worker custodial accounts sign
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

interface ContractWrite {
  address: `0x${string}`;
  abi: readonly unknown[];
  functionName: string;
  args: readonly unknown[];
}

/**
 * Sign + broadcast one contract call and wait for it to be mined.
 * - The send is serialised per signing account (./signerLock.ts — W6).
 * - `primary` marks THE money transaction of the operation (not a gas top-up or an
 *   approval): it is reported to the payment service as soon as it is broadcast and
 *   again once mined (src/lib/payments/observer.ts).
 * - A mined-but-reverted receipt throws, so a failure can never look like success.
 */
async function write(account: Account, request: ContractWrite, primary = false): Promise<TxHash> {
  const hash = await withSignerLock(account.address, () =>
    walletFor(account).writeContract({ ...request, chain, account } as Parameters<ReturnType<typeof walletFor>["writeContract"]>[0]),
  );
  const observer = primary ? currentChainTxObserver() : undefined;
  if (observer) await observer.onSubmitted(hash);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`${request.functionName} transaction ${hash} reverted on-chain`);
  }
  observer?.onMined({ hash, blockNumber: receipt.blockNumber, gasUsed: receipt.gasUsed, effectiveGasPrice: receipt.effectiveGasPrice });
  return hash;
}

// ---- token helpers (mock on-ramp) ----
async function balanceOf(address: `0x${string}`): Promise<bigint> {
  return publicClient.readContract({ address: TOKEN_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [address] });
}

function mint(to: `0x${string}`, amount: bigint, primary = false): Promise<TxHash> {
  return write(relayerAccount(), { address: TOKEN_ADDRESS, abi: erc20Abi, functionName: "mint", args: [to, amount] }, primary);
}

/**
 * Payment plan P3.1 (W2): money is only ever spent from the real balance. A shortfall
 * is refused BEFORE any transaction is sent (no gas wasted, nothing moved) — the user
 * adds funds through the explicit on-ramp first. Mirrors demoAdapter's debit().
 */
async function assertBalance(address: `0x${string}`, needed: bigint) {
  const bal = await balanceOf(address);
  if (bal < needed) {
    throw new EscrowRuleError("InsufficientBalance", `${address} holds ${fromTokenUnits(bal)}, needs ${fromTokenUnits(needed)}`);
  }
}

async function ensureApproval(account: Account, needed: bigint) {
  const allowance = (await publicClient.readContract({
    address: TOKEN_ADDRESS, abi: erc20Abi, functionName: "allowance", args: [account.address, ESCROW_ADDRESS],
  })) as bigint;
  if (allowance >= needed) return;
  await ensureGas(account.address); // the approve is signed by the user
  await write(account, { address: TOKEN_ADDRESS, abi: erc20Abi, functionName: "approve", args: [ESCROW_ADDRESS, maxUint256] });
}

/** A relayer-signed PhaseEscrow call (attestor / dispute-resolver operations). */
function relayerCall(functionName: string, args: readonly unknown[]): Promise<TxHash> {
  assertChainWritable();
  return write(relayerAccount(), { address: ESCROW_ADDRESS, abi: phaseEscrowAbi, functionName, args }, true);
}

export const viemAdapter: ChainAdapter = {
  kind: "viem",

  /** Client funds a phase from their real balance: approve + fundPhase, signed by the client. */
  async fundPhase(phaseId, clientUserId, workerUserId, amountInr) {
    assertChainWritable();
    const client = await accountForUser(clientUserId);
    // Pay the worker's payout address — their linked external wallet if they have one,
    // otherwise their custodial wallet (Phase 9).
    const workerAddr = await payoutAddressFor(workerUserId);
    const amount = toTokenUnits(amountInr);
    await assertBalance(client.address, amount);
    await ensureApproval(client, amount);
    await ensureGas(client.address); // fundPhase records msg.sender as the client
    return write(client, { address: ESCROW_ADDRESS, abi: phaseEscrowAbi, functionName: "fundPhase", args: [keyFor(phaseId), workerAddr, amount] }, true);
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
    await assertBalance(worker.address, amount);
    await ensureApproval(worker, amount);
    await ensureGas(worker.address); // the stake is locked by the worker themselves
    return write(worker, { address: ESCROW_ADDRESS, abi: phaseEscrowAbi, functionName: "lockStake", args: [keyFor(hireId), client.address, amount] }, true);
  },
  refundStake: (hireId) => relayerCall("refundStake", [keyFor(hireId)]),
  forfeitStake: (hireId) => relayerCall("forfeitStake", [keyFor(hireId)]),

  async balanceOfInr(address) {
    return fromTokenUnits(await balanceOf(address as `0x${string}`));
  },

  async mintInr(address, amountInr) {
    assertChainWritable();
    return mint(address as `0x${string}`, toTokenUnits(amountInr), true);
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
    const txHash = await write(account, { address: TOKEN_ADDRESS, abi: erc20Abi, functionName: "transfer", args: [relayerAccount().address, bal] }, true);
    return { txHash, amountInr: fromTokenUnits(bal) };
  },

  async txReceipt(hash) {
    try {
      const r = await publicClient.getTransactionReceipt({ hash });
      return { status: r.status, blockNumber: r.blockNumber, gasUsed: r.gasUsed, effectiveGasPrice: r.effectiveGasPrice };
    } catch {
      return null; // not mined (yet), or unknown to this node
    }
  },
};
