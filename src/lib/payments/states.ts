/*
  Payment-attempt state machine (payment plan P1.3). Plain data — no DB — so the
  rules are unit-tested and shared by the service and the reconciler.

    INITIATED ──► SUBMITTED ──► CONFIRMED
        │             │
        ├──► FAILED ◄─┤          (reverted, rule refusal, RPC/gas error, never sent)
        ├──► CANCELLED           (the payer rejected it in their wallet)
        └──► EXPIRED             (the price quote ran out before signing — P6)

  CONFIRMED / FAILED / CANCELLED / EXPIRED are final: a receipt is issued for each (P2).
*/

export type PaymentStatus = "INITIATED" | "SUBMITTED" | "CONFIRMED" | "FAILED" | "CANCELLED" | "EXPIRED";

export const PAYMENT_TRANSITIONS: Record<PaymentStatus, readonly PaymentStatus[]> = {
  INITIATED: ["SUBMITTED", "CONFIRMED", "FAILED", "CANCELLED", "EXPIRED"],
  SUBMITTED: ["CONFIRMED", "FAILED"],
  CONFIRMED: [],
  FAILED: [],
  CANCELLED: [],
  EXPIRED: [],
};

export const FINAL_PAYMENT_STATUSES: readonly PaymentStatus[] = ["CONFIRMED", "FAILED", "CANCELLED", "EXPIRED"];

export function isFinalPaymentStatus(s: PaymentStatus): boolean {
  return FINAL_PAYMENT_STATUSES.includes(s);
}

export function canTransitionPayment(from: PaymentStatus, to: PaymentStatus): boolean {
  return PAYMENT_TRANSITIONS[from].includes(to);
}

export class PaymentStateError extends Error {
  constructor(from: PaymentStatus, to: PaymentStatus) {
    super(`Payment cannot move ${from} → ${to}`);
    this.name = "PaymentStateError";
  }
}

export function assertPaymentTransition(from: PaymentStatus, to: PaymentStatus): void {
  if (!canTransitionPayment(from, to)) throw new PaymentStateError(from, to);
}
