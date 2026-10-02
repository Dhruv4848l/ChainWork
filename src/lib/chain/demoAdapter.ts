import "server-only";
import { randomBytes } from "node:crypto";
import { Prisma } from "@/generated/platform";
import { platformDb } from "@/lib/platformDb";
import { accountForUser } from "./keystore";
import { payoutAddressFor } from "./payout";
import { keyFor } from "./keys";
import {
  assertEscrowOp,
  assertStakeOp,
  assertReleaseEligible,
  splitPaise,
  toPaise,
  EscrowRuleError,
  type EscrowOp,
  type EscrowStatus,
  type StakeStatus,
} from "./escrowRules";
import type { ChainAdapter, EscrowView, TxHash } from "./types";

/*
  DEMO payment mode: dummy money, no chain.

  A DB-backed simulation of the stablecoin + PhaseEscrow contract (tables DemoAccount
  and DemoEscrow). It enforces the contract's own rules (./escrowRules.ts): no double
  funding, nothing moves after release, disputes freeze the phase, auto-release waits
  for the deadline, splits never lose a paisa. So an app flow that works in demo mode
  works the same on testnet.

  Money model:
  - A custodial address's first touch opens its DemoAccount with the Wallet.demoCredit
    grant as its balance, recorded as `lockedCredit`: spendable (spent first) but never
    withdrawable. Money received (a release, a refund) is ordinary, withdrawable demo
    balance.
  - Funding a phase moves the client's balance into the escrow row; release/refund/split
    move it back out to the recorded worker/client — exactly like the contract.
  - Every operation returns a fresh random 32-byte "tx hash". It is NOT on any chain;
    records made in demo mode carry mode=DEMO so they can never pass for real ones.
*/

type Tx = Prisma.TransactionClient;

const ZERO = "0x0000000000000000000000000000000000000000";

function demoTxHash(): TxHash {
  return `0x${randomBytes(32).toString("hex")}`;
}

const norm = (address: string) => address.toLowerCase();
const paiseOf = (d: Prisma.Decimal | number | string) => Math.round(Number(d) * 100);
const rupees = (paise: number) => new Prisma.Decimal(paise).div(100);

// ---------------------------------------------------------------------------
// Accounts (the stablecoin)
// ---------------------------------------------------------------------------

/** Open the account on first touch, seeding a custodial wallet's demo-credit grant. */
async function openAccount(tx: Tx, address: string): Promise<void> {
  const addr = norm(address);
  const existing = await tx.demoAccount.findUnique({ where: { address: addr }, select: { address: true } });
  if (existing) return;
  const wallet = await tx.wallet.findFirst({
    where: { custodialAddress: { equals: address, mode: "insensitive" } },
    select: { demoCredit: true },
  });
  const grant = wallet?.demoCredit ?? new Prisma.Decimal(0);
  await tx.demoAccount.upsert({
    where: { address: addr },
    create: { address: addr, balance: grant, lockedCredit: grant },
    update: {},
  });
}

/** Row-lock an account for the rest of the transaction (serialises concurrent debits). */
async function lockAccount(tx: Tx, address: string) {
  await openAccount(tx, address);
  const rows = await tx.$queryRaw<{ balance: Prisma.Decimal; lockedCredit: Prisma.Decimal }[]>`
    SELECT "balance", "lockedCredit" FROM "DemoAccount" WHERE "address" = ${norm(address)} FOR UPDATE`;
  return { balance: paiseOf(rows[0].balance), locked: paiseOf(rows[0].lockedCredit) };
}

async function credit(tx: Tx, address: string, paise: number): Promise<void> {
  if (paise <= 0) return;
  await openAccount(tx, address);
  await tx.demoAccount.update({ where: { address: norm(address) }, data: { balance: { increment: rupees(paise) } } });
}

/**
 * Debit `paise`, spending the locked demo credit first. A short balance is refused
 * (payment plan P3.1 / W2) — exactly like viemAdapter: money is only spent, never
 * conjured; topping up is the explicit on-ramp (mintInr).
 */
async function debit(tx: Tx, address: string, paise: number): Promise<void> {
  const acct = await lockAccount(tx, address);
  const locked = acct.locked;
  if (acct.balance < paise) throw new EscrowRuleError("InsufficientBalance", `${address} has ₹${acct.balance / 100}`);
  const fromLocked = Math.min(locked, paise);
  await tx.demoAccount.update({
    where: { address: norm(address) },
    data: { balance: { decrement: rupees(paise) }, lockedCredit: { decrement: rupees(fromLocked) } },
  });
}

// ---------------------------------------------------------------------------
// Escrow rows
// ---------------------------------------------------------------------------

/** How a DB phase status maps onto the contract status (for adopting legacy rows). */
function escrowStatusForPhase(status: string): EscrowStatus {
  switch (status) {
    case "FUNDED":
    case "IN_PROGRESS":
      return "FUNDED";
    case "DELIVERED":
    case "VERIFICATION_WINDOW_OPEN":
      return "DELIVERED";
    case "RELEASED":
      return "RELEASED";
    case "DISPUTED":
      return "DISPUTED";
    case "AUTO_CANCELLED":
      return "REFUNDED";
    default:
      return "NONE";
  }
}

/**
 * Phases funded under the old MOCK_BLOCKCHAIN stub have no DemoEscrow row (that stub
 * recorded nothing). Adopt them from the Phase row so existing demo data keeps
 * working. Idempotent.
 */
async function adoptLegacyPhase(phaseId: string): Promise<void> {
  const key = keyFor(phaseId);
  if (await platformDb.demoEscrow.findUnique({ where: { key }, select: { key: true } })) return;
  const phase = await platformDb.phase.findUnique({ where: { id: phaseId }, include: { hire: true } });
  if (!phase) return;
  const status = escrowStatusForPhase(phase.status);
  if (status === "NONE") return;
  const client = (await accountForUser(phase.hire.clientId)).address;
  const worker = await payoutAddressFor(phase.hire.workerId);
  const held = status === "FUNDED" || status === "DELIVERED" || status === "DISPUTED";
  await platformDb.demoEscrow.upsert({
    where: { key },
    create: {
      key, kind: "PHASE", refId: phaseId, client: norm(client), worker: norm(worker),
      amount: held ? phase.amount : 0, status,
      releaseEligibleAfter: phase.verificationDeadline ? Math.floor(phase.verificationDeadline.getTime() / 1000) : null,
    },
    update: {},
  });
}

/** Apply `op` to a phase escrow atomically; `effect` moves the money. */
async function transition(
  phaseId: string,
  op: EscrowOp,
  effect: (
    tx: Tx,
    row: { client: string; worker: string; paise: number; releaseEligibleAfter: number | null },
  ) => Promise<{ releaseEligibleAfter?: number } | void>,
): Promise<TxHash> {
  await adoptLegacyPhase(phaseId);
  const key = keyFor(phaseId);
  await platformDb.$transaction(async (tx) => {
    const row = await tx.demoEscrow.findUnique({ where: { key } });
    const current = (row?.status as EscrowStatus | undefined) ?? "NONE";
    const next = assertEscrowOp(op, current);
    if (!row) throw new EscrowRuleError("WrongStatus", `${op}: phase has no escrow`);
    const extra = (await effect(tx, {
      client: row.client, worker: row.worker, paise: paiseOf(row.amount), releaseEligibleAfter: row.releaseEligibleAfter,
    })) || {};
    const empties = next === "RELEASED" || next === "RESOLVED" || next === "REFUNDED";
    // Guarded on the status we read: a concurrent change makes this a WrongStatus revert.
    const res = await tx.demoEscrow.updateMany({
      where: { key, status: current },
      data: { status: next, ...(empties ? { amount: 0 } : {}), ...extra },
    });
    if (res.count !== 1) throw new EscrowRuleError("WrongStatus", `${op}: escrow changed concurrently`);
  });
  return demoTxHash();
}

async function stakeTransition(hireId: string, op: "refundStake" | "forfeitStake"): Promise<TxHash> {
  const key = keyFor(hireId);
  await platformDb.$transaction(async (tx) => {
    const row = await tx.demoEscrow.findUnique({ where: { key } });
    const current = (row?.status as StakeStatus | undefined) ?? "NONE";
    const next = assertStakeOp(op, current);
    if (!row) throw new EscrowRuleError("WrongStatus", `${op}: no stake`);
    await credit(tx, op === "refundStake" ? row.worker : row.client, paiseOf(row.amount));
    const res = await tx.demoEscrow.updateMany({ where: { key, status: current }, data: { status: next, amount: 0 } });
    if (res.count !== 1) throw new EscrowRuleError("WrongStatus", `${op}: stake changed concurrently`);
  });
  return demoTxHash();
}

// ---------------------------------------------------------------------------
// The adapter
// ---------------------------------------------------------------------------

export const demoAdapter: ChainAdapter = {
  kind: "demo",

  async fundPhase(phaseId, clientUserId, workerUserId, amountInr) {
    const paise = toPaise(amountInr);
    const client = (await accountForUser(clientUserId)).address;
    const worker = await payoutAddressFor(workerUserId);
    const key = keyFor(phaseId);
    await platformDb.$transaction(async (tx) => {
      const existing = await tx.demoEscrow.findUnique({ where: { key } });
      assertEscrowOp("fundPhase", (existing?.status as EscrowStatus | undefined) ?? "NONE");
      await debit(tx, client, paise);
      await tx.demoEscrow.create({
        data: { key, kind: "PHASE", refId: phaseId, client: norm(client), worker: norm(worker), amount: rupees(paise), status: "FUNDED" },
      });
    });
    return demoTxHash();
  },

  markDelivered: (phaseId, releaseEligibleAfter) =>
    transition(phaseId, "markDelivered", async () => ({ releaseEligibleAfter })),

  approveRelease: (phaseId) =>
    transition(phaseId, "approveRelease", (tx, e) => credit(tx, e.worker, e.paise)),

  autoRelease: (phaseId) =>
    transition(phaseId, "autoRelease", async (tx, e) => {
      assertReleaseEligible(e.releaseEligibleAfter ?? 0, Math.floor(Date.now() / 1000));
      await credit(tx, e.worker, e.paise);
    }),

  raiseDispute: (phaseId) => transition(phaseId, "raiseDispute", async () => {}),

  resolveDispute: (phaseId, workerBps) =>
    transition(phaseId, "resolveDispute", async (tx, e) => {
      const { toWorker, toClient } = splitPaise(e.paise, workerBps);
      await credit(tx, e.worker, toWorker);
      await credit(tx, e.client, toClient);
    }),

  refundToClient: (phaseId) =>
    transition(phaseId, "refundToClient", (tx, e) => credit(tx, e.client, e.paise)),

  async readEscrow(phaseId): Promise<EscrowView> {
    await adoptLegacyPhase(phaseId);
    const row = await platformDb.demoEscrow.findUnique({ where: { key: keyFor(phaseId) } });
    if (!row) return { client: ZERO, worker: ZERO, amount: 0, status: "NONE", releaseEligibleAfter: 0 };
    return {
      client: row.client, worker: row.worker, amount: Number(row.amount),
      status: row.status as EscrowStatus, releaseEligibleAfter: row.releaseEligibleAfter ?? 0,
    };
  },

  async lockStake(hireId, workerUserId, clientUserId, amountInr) {
    const paise = toPaise(amountInr);
    const worker = (await accountForUser(workerUserId)).address;
    const client = (await accountForUser(clientUserId)).address;
    const key = keyFor(hireId);
    await platformDb.$transaction(async (tx) => {
      const existing = await tx.demoEscrow.findUnique({ where: { key } });
      assertStakeOp("lockStake", (existing?.status as StakeStatus | undefined) ?? "NONE");
      await debit(tx, worker, paise);
      await tx.demoEscrow.create({
        data: { key, kind: "STAKE", refId: hireId, client: norm(client), worker: norm(worker), amount: rupees(paise), status: "LOCKED" },
      });
    });
    return demoTxHash();
  },

  refundStake: (hireId) => stakeTransition(hireId, "refundStake"),
  forfeitStake: (hireId) => stakeTransition(hireId, "forfeitStake"),

  async balanceOfInr(address) {
    await platformDb.$transaction((tx) => openAccount(tx, address));
    const acct = await platformDb.demoAccount.findUnique({ where: { address: norm(address) } });
    return acct ? Number(acct.balance) : 0;
  },

  async mintInr(address, amountInr) {
    const paise = toPaise(amountInr);
    await platformDb.$transaction((tx) => credit(tx, address, paise));
    return demoTxHash();
  },

  /** Withdraws only the withdrawable part — the locked demo-credit grant stays put. */
  async withdrawAll(userId) {
    const address = (await accountForUser(userId)).address;
    const moved = await platformDb.$transaction(async (tx) => {
      const { balance, locked } = await lockAccount(tx, address);
      const withdrawable = balance - locked;
      if (withdrawable <= 0) return 0;
      await tx.demoAccount.update({ where: { address: norm(address) }, data: { balance: { decrement: rupees(withdrawable) } } });
      return withdrawable;
    });
    if (moved === 0) return null;
    return { txHash: demoTxHash(), amountInr: moved / 100 };
  },

  // Demo operations are atomic DB transactions: there is no pending receipt to find.
  async txReceipt() {
    return null;
  },
};

/** Demo-only: the locked (non-withdrawable) part of an address's balance, in ₹. */
export async function demoLockedCreditInr(address: string): Promise<number> {
  const acct = await platformDb.demoAccount.findUnique({ where: { address: norm(address) } });
  return acct ? Number(acct.lockedCredit) : 0;
}
