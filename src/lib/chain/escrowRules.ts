/*
  The PhaseEscrow contract's state rules, as plain data (no chain, no DB).

  The demo payment mode (src/lib/chain/demoAdapter.ts) simulates the contract off-chain;
  it MUST refuse exactly what the contract refuses, or demo money would behave
  differently from testnet money. Every rule here mirrors a `revert` in
  contracts/contracts/PhaseEscrow.sol; escrowRules.test.ts pins them down.
*/

export type EscrowStatus = "NONE" | "FUNDED" | "DELIVERED" | "RELEASED" | "DISPUTED" | "RESOLVED" | "REFUNDED";
export type StakeStatus = "NONE" | "LOCKED" | "REFUNDED" | "FORFEITED";

/** Index order matches the Solidity enum — used to decode `getEscrow` reads. */
export const ESCROW_STATUS_NAMES: readonly EscrowStatus[] = [
  "NONE", "FUNDED", "DELIVERED", "RELEASED", "DISPUTED", "RESOLVED", "REFUNDED",
];

export type EscrowOp =
  | "fundPhase" | "markDelivered" | "approveRelease" | "autoRelease"
  | "raiseDispute" | "resolveDispute" | "refundToClient" | "settlement";

/** Which statuses each escrow operation may start from (anything else reverts WrongStatus). */
export const ESCROW_ALLOWED_FROM: Record<EscrowOp, readonly EscrowStatus[]> = {
  // PhaseEscrow v3: a REFUNDED slot holds nothing and may be funded again.
  fundPhase: ["NONE", "REFUNDED"],
  markDelivered: ["FUNDED"],
  approveRelease: ["FUNDED", "DELIVERED"],
  autoRelease: ["DELIVERED"],
  raiseDispute: ["FUNDED", "DELIVERED"],
  resolveDispute: ["DISPUTED"],
  refundToClient: ["FUNDED", "DELIVERED"],
  settlement: ["FUNDED", "DELIVERED", "DISPUTED"],
};

/** Where each operation leaves the escrow. */
export const ESCROW_RESULT: Record<EscrowOp, EscrowStatus> = {
  fundPhase: "FUNDED",
  markDelivered: "DELIVERED",
  approveRelease: "RELEASED",
  autoRelease: "RELEASED",
  raiseDispute: "DISPUTED",
  resolveDispute: "RESOLVED",
  refundToClient: "REFUNDED",
  settlement: "RESOLVED",
};

export type StakeOp = "lockStake" | "refundStake" | "forfeitStake";

export const STAKE_ALLOWED_FROM: Record<StakeOp, readonly StakeStatus[]> = {
  lockStake: ["NONE"],
  refundStake: ["LOCKED"],
  forfeitStake: ["LOCKED"],
};

export const STAKE_RESULT: Record<StakeOp, StakeStatus> = {
  lockStake: "LOCKED",
  refundStake: "REFUNDED",
  forfeitStake: "FORFEITED",
};

export const BPS_DENOMINATOR = 10_000;

/** Named like the contract's custom errors so logs read the same in every mode. */
export class EscrowRuleError extends Error {
  constructor(
    public readonly code: "WrongStatus" | "TooEarly" | "InvalidBps" | "InvalidAmount" | "InsufficientBalance",
    detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "EscrowRuleError";
  }
}

export function assertEscrowOp(op: EscrowOp, current: EscrowStatus): EscrowStatus {
  if (!ESCROW_ALLOWED_FROM[op].includes(current)) {
    throw new EscrowRuleError("WrongStatus", `${op} is not allowed from ${current}`);
  }
  return ESCROW_RESULT[op];
}

export function assertStakeOp(op: StakeOp, current: StakeStatus): StakeStatus {
  if (!STAKE_ALLOWED_FROM[op].includes(current)) {
    throw new EscrowRuleError("WrongStatus", `${op} is not allowed from ${current}`);
  }
  return STAKE_RESULT[op];
}

/** autoRelease reverts TooEarly before the stored deadline (unix seconds). */
export function assertReleaseEligible(releaseEligibleAfter: number, nowSeconds: number): void {
  if (nowSeconds < releaseEligibleAfter) {
    throw new EscrowRuleError("TooEarly", `eligible at ${releaseEligibleAfter}, now ${nowSeconds}`);
  }
}

/**
 * The contract's split: toWorker = amount * bps / 10000 (rounded DOWN), the client
 * gets the remainder, so nothing is ever lost or created. Amounts are in paise
 * (integers) to keep the maths exact.
 */
export function splitPaise(amountPaise: number, workerBps: number): { toWorker: number; toClient: number } {
  if (!Number.isInteger(workerBps) || workerBps < 0 || workerBps > BPS_DENOMINATOR) {
    throw new EscrowRuleError("InvalidBps", String(workerBps));
  }
  const toWorker = Math.floor((amountPaise * workerBps) / BPS_DENOMINATOR);
  return { toWorker, toClient: amountPaise - toWorker };
}

/** ₹ amount (up to 2 decimals) → integer paise, rejecting non-positive values. */
export function toPaise(amountInr: number): number {
  const paise = Math.round(amountInr * 100);
  if (!Number.isFinite(paise) || paise <= 0) throw new EscrowRuleError("InvalidAmount", String(amountInr));
  return paise;
}
