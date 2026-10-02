/*
  Delivery-stake rules (payment plan P3.6 / F5) — pure, unit-tested (stakeRules.test.ts).

  A contract worth at least `delivery_stake_threshold_inr` requires the worker to lock a
  refundable stake of `delivery_stake_pct` % of its value before the client can fund the
  first phase. It is returned when the hire completes and forfeited to the client if the
  worker ghosts a phase (auto-cancel).
*/

export function stakeRequired(totalValueInr: number, thresholdInr: number): boolean {
  return thresholdInr > 0 && totalValueInr >= thresholdInr;
}

/** Whole rupees, rounded up so the stake is never below the configured share. */
export function stakeAmountInr(totalValueInr: number, pct: number): number {
  if (!(pct > 0)) return 0;
  return Math.ceil((totalValueInr * pct) / 100);
}

export type StakeState = "NOT_REQUIRED" | "AWAITING" | "LOCKED" | "REFUNDED" | "FORFEITED";

/** Where a hire stands on its stake; only AWAITING blocks funding. */
export function stakeState(required: boolean, recorded: "LOCKED" | "REFUNDED" | "FORFEITED" | null): StakeState {
  if (recorded) return recorded;
  return required ? "AWAITING" : "NOT_REQUIRED";
}
