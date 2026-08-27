import "server-only";
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  toHex,
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
} from "./config";
import { relayerAccount, accountForUser } from "./keystore";
import { ensureGas } from "./gas";
import { payoutAddressFor } from "./wallet";

/*
  High-level escrow operations against the PhaseEscrow contract. Each write waits
  for a confirmation and returns the tx hash so callers can record it.

  Custodial model (dev): the platform relayer (account 0) holds ATTESTOR + DISPUTE
  roles and mints the test stablecoin (mock fiat on-ramp). Client/worker custodial
  accounts sign their own party actions (fund, lockStake, settle). Those wallets are
  pre-funded with gas on the local Hardhat node and sponsored by the relayer on a
  real testnet — see ensureGas in ./gas.ts.
*/

const chain = activeChain();
const publicClient = createPublicClient({ chain, transport: http(RPC_URL) });

function walletFor(account: Account) {
  return createWalletClient({ account, chain, transport: http(RPC_URL) });
}

/** Deterministic bytes32 key for a phase / hire cuid. */
export function keyFor(id: string): `0x${string}` {
  return keccak256(toHex(id));
}

export function toTokenUnits(amountInr: number | string): bigint {
  return parseUnits(String(amountInr), TOKEN_DECIMALS);
}

export function fromTokenUnits(wei: bigint): number {
  return Number(formatUnits(wei, TOKEN_DECIMALS));
}

async function waitFor(hash: `0x${string}`) {
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

// ---- token helpers (mock on-ramp) ----
async function balanceOf(address: `0x${string}`): Promise<bigint> {
  return publicClient.readContract({ address: TOKEN_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [address] });
}

async function ensureStablecoin(address: `0x${string}`, needed: bigint) {
  const bal = await balanceOf(address);
  if (bal >= needed) return;
  // Mock fiat on-ramp: the relayer mints the shortfall to the user's wallet.
  const relayer = walletFor(relayerAccount());
  const hash = await relayer.writeContract({
    address: TOKEN_ADDRESS, abi: erc20Abi, functionName: "mint", args: [address, needed - bal], chain, account: relayerAccount(),
  });
  await waitFor(hash);
}

async function ensureApproval(account: Account, needed: bigint) {
  const allowance = (await publicClient.readContract({
    address: TOKEN_ADDRESS, abi: erc20Abi, functionName: "allowance", args: [account.address, ESCROW_ADDRESS],
  })) as bigint;
  if (allowance >= needed) return;
  await ensureGas(account.address); // the approve is signed by the user
  const wc = walletFor(account);
  const hash = await wc.writeContract({
    address: TOKEN_ADDRESS, abi: erc20Abi, functionName: "approve", args: [ESCROW_ADDRESS, maxUint256], chain, account,
  });
  await waitFor(hash);
}

// ---- escrow write ops ----

/** Client funds a phase: mint (mock on-ramp) + approve + fundPhase, signed by the client. */
export async function fundPhase(phaseId: string, clientUserId: string, workerUserId: string, amountInr: number) {
  const client = await accountForUser(clientUserId);
  // Pay the worker's payout address — their linked external wallet if they have one,
  // otherwise their custodial wallet (Phase 9).
  const workerAddr = await payoutAddressFor(workerUserId);
  const amount = toTokenUnits(amountInr);
  await ensureStablecoin(client.address, amount);
  await ensureApproval(client, amount);
  await ensureGas(client.address); // fundPhase records msg.sender as the client
  const wc = walletFor(client);
  const hash = await wc.writeContract({
    address: ESCROW_ADDRESS, abi: phaseEscrowAbi, functionName: "fundPhase", args: [keyFor(phaseId), workerAddr, amount], chain, account: client,
  });
  return waitFor(hash);
}

/** Attestor relays delivery + the off-chain verification deadline (unix seconds). */
export async function markDelivered(phaseId: string, releaseEligibleAfter: number) {
  const relayer = relayerAccount();
  const hash = await walletFor(relayer).writeContract({
    address: ESCROW_ADDRESS, abi: phaseEscrowAbi, functionName: "markDelivered", args: [keyFor(phaseId), BigInt(releaseEligibleAfter)], chain, account: relayer,
  });
  return waitFor(hash);
}

/** Client approves — the attestor relays it and the contract releases to the worker. */
export async function approveRelease(phaseId: string) {
  const relayer = relayerAccount();
  const hash = await walletFor(relayer).writeContract({
    address: ESCROW_ADDRESS, abi: phaseEscrowAbi, functionName: "approveRelease", args: [keyFor(phaseId)], chain, account: relayer,
  });
  return waitFor(hash);
}

/** Attestor triggers auto-release (contract enforces it can't fire early). */
export async function autoRelease(phaseId: string) {
  const relayer = relayerAccount();
  const hash = await walletFor(relayer).writeContract({
    address: ESCROW_ADDRESS, abi: phaseEscrowAbi, functionName: "autoRelease", args: [keyFor(phaseId)], chain, account: relayer,
  });
  return waitFor(hash);
}

export async function raiseDispute(phaseId: string) {
  const relayer = relayerAccount();
  const hash = await walletFor(relayer).writeContract({
    address: ESCROW_ADDRESS, abi: phaseEscrowAbi, functionName: "raiseDispute", args: [keyFor(phaseId)], chain, account: relayer,
  });
  return waitFor(hash);
}

export async function resolveDispute(phaseId: string, workerBps: number) {
  const relayer = relayerAccount();
  const hash = await walletFor(relayer).writeContract({
    address: ESCROW_ADDRESS, abi: phaseEscrowAbi, functionName: "resolveDispute", args: [keyFor(phaseId), BigInt(workerBps)], chain, account: relayer,
  });
  return waitFor(hash);
}

export async function refundToClient(phaseId: string) {
  const relayer = relayerAccount();
  const hash = await walletFor(relayer).writeContract({
    address: ESCROW_ADDRESS, abi: phaseEscrowAbi, functionName: "refundToClient", args: [keyFor(phaseId)], chain, account: relayer,
  });
  return waitFor(hash);
}

/** Worker locks a refundable delivery stake for a hire (signed by the worker). */
export async function lockStake(hireId: string, workerUserId: string, clientUserId: string, amountInr: number) {
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
}

export async function forfeitStake(hireId: string) {
  const relayer = relayerAccount();
  const hash = await walletFor(relayer).writeContract({
    address: ESCROW_ADDRESS, abi: phaseEscrowAbi, functionName: "forfeitStake", args: [keyFor(hireId)], chain, account: relayer,
  });
  return waitFor(hash);
}

// ---- reads ----

const STATUS_NAMES = ["NONE", "FUNDED", "DELIVERED", "RELEASED", "DISPUTED", "RESOLVED", "REFUNDED"] as const;

export async function readEscrow(phaseId: string) {
  const r = (await publicClient.readContract({
    address: ESCROW_ADDRESS, abi: phaseEscrowAbi, functionName: "getEscrow", args: [keyFor(phaseId)],
  })) as [string, string, bigint, number, bigint];
  return {
    client: r[0], worker: r[1], amount: fromTokenUnits(r[2]),
    status: STATUS_NAMES[r[3]] ?? "NONE", releaseEligibleAfter: Number(r[4]),
  };
}

export async function balanceOfInr(address: string): Promise<number> {
  return fromTokenUnits(await balanceOf(address as `0x${string}`));
}
