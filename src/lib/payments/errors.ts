/*
  Turn any error from a money operation into a stable code + a plain-language reason,
  for the payment record, the failed receipt (P2) and the UI.

  Deliberately dependency-light: it inspects error names/codes/messages rather than
  importing viem's error classes, so it works for viem errors, EIP-1193 wallet errors
  (P4), the demo adapter's EscrowRuleError and our own config errors alike.
*/

export type PaymentFailureCode =
  | "USER_REJECTED"      // the payer declined in their wallet → CANCELLED
  | "WRONG_STATUS"       // escrow isn't in a state that allows this
  | "TOO_EARLY"          // auto-release before the deadline
  | "INSUFFICIENT_BALANCE"
  | "INSUFFICIENT_GAS"
  | "INVALID_AMOUNT"
  | "REVERTED"           // the contract refused it for another reason
  | "CHAIN_CONFIG"       // the platform's chain setup is unsafe/incomplete
  | "RPC_UNAVAILABLE"    // couldn't reach the network
  | "TIMEOUT"            // sent, but no confirmation in time (the reconciler decides)
  | "UNKNOWN";

export interface ClassifiedError {
  code: PaymentFailureCode;
  /** Shown to users and printed on failed receipts. */
  reason: string;
  /** CANCELLED instead of FAILED. */
  cancelled: boolean;
  /** Outcome unknown — leave the payment SUBMITTED for the reconciler. */
  pending: boolean;
}

const REASONS: Record<PaymentFailureCode, string> = {
  USER_REJECTED: "You cancelled the request in your wallet. No money was moved.",
  WRONG_STATUS: "This payment step isn't allowed in the phase's current state. No money was moved.",
  TOO_EARLY: "The verification window hasn't ended yet, so this can't auto-release. No money was moved.",
  INSUFFICIENT_BALANCE: "There isn't enough balance to cover this payment. No money was moved.",
  INSUFFICIENT_GAS: "The network fee couldn't be paid. No money was moved — please try again shortly.",
  INVALID_AMOUNT: "The amount is invalid. No money was moved.",
  REVERTED: "The escrow contract rejected this transaction. No money was moved.",
  CHAIN_CONFIG: "Payments are temporarily unavailable while the platform's chain setup is fixed. No money was moved.",
  RPC_UNAVAILABLE: "The payment network couldn't be reached. No money was moved — please try again.",
  TIMEOUT: "The transaction was sent but not confirmed yet. It will update automatically once the network confirms it.",
  UNKNOWN: "The payment couldn't be completed. No money was moved.",
};

export function failureReason(code: PaymentFailureCode): string {
  return REASONS[code];
}

interface ErrLike {
  name?: string;
  code?: number | string;
  message?: string;
  shortMessage?: string;
  details?: string;
  cause?: unknown;
}

/** Collect the error and its cause chain (viem nests the useful part). */
function chain(e: unknown): ErrLike[] {
  const out: ErrLike[] = [];
  let cur: unknown = e;
  for (let i = 0; cur && typeof cur === "object" && i < 8; i++) {
    out.push(cur as ErrLike);
    cur = (cur as ErrLike).cause;
  }
  return out;
}

export function classifyPaymentError(e: unknown): ClassifiedError {
  const errs = chain(e);
  const text = errs.map((x) => `${x.name ?? ""} ${x.shortMessage ?? ""} ${x.message ?? ""} ${x.details ?? ""}`).join(" | ");
  const has = (re: RegExp) => re.test(text);
  const make = (code: PaymentFailureCode, extra: Partial<ClassifiedError> = {}): ClassifiedError => ({
    code, reason: REASONS[code], cancelled: false, pending: false, ...extra,
  });

  // EIP-1193 user rejection (4001) / viem UserRejectedRequestError
  if (errs.some((x) => x.code === 4001 || x.name === "UserRejectedRequestError") || has(/user rejected|user denied/i)) {
    return make("USER_REJECTED", { cancelled: true });
  }
  if (errs.some((x) => x.name === "ChainConfigError" || x.name === "PaymentConfigError")) return make("CHAIN_CONFIG");

  // Our own rule errors (demo adapter) and the contract's custom errors (viem decodes names)
  if (has(/WrongStatus/)) return make("WRONG_STATUS");
  if (has(/TooEarly/)) return make("TOO_EARLY");
  if (has(/InsufficientBalance|ERC20InsufficientBalance|transfer amount exceeds balance/i)) return make("INSUFFICIENT_BALANCE");
  if (has(/InvalidAmount|InvalidBps/)) return make("INVALID_AMOUNT");
  if (has(/insufficient funds|out of gas|relayer is out of gas/i)) return make("INSUFFICIENT_GAS");

  if (errs.some((x) => x.name === "WaitForTransactionReceiptTimeoutError") || has(/timed out while waiting for transaction/i)) {
    return make("TIMEOUT", { pending: true });
  }
  if (errs.some((x) => x.name === "ContractFunctionRevertedError" || x.name === "ContractFunctionExecutionError") || has(/revert/i)) {
    return make("REVERTED");
  }
  if (errs.some((x) => x.name === "HttpRequestError" || x.name === "TimeoutError") || has(/ECONNREFUSED|fetch failed|ENOTFOUND|socket hang up/i)) {
    return make("RPC_UNAVAILABLE");
  }
  return make("UNKNOWN");
}
