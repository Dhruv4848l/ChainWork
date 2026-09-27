import type { EscrowStatus } from "./escrowRules";

export type TxHash = `0x${string}`;

export interface EscrowView {
  client: string;
  worker: string;
  /** ₹ still held in escrow (0 once released/resolved/refunded). */
  amount: number;
  status: EscrowStatus;
  /** Unix seconds; 0 until delivery. */
  releaseEligibleAfter: number;
}

/**
 * Everything the app asks of "the chain". Two implementations:
 *  - viemAdapter  — the real PhaseEscrow + stablecoin (testnet / mainnet modes)
 *  - demoAdapter  — a DB simulation with identical rules (demo mode, dummy money)
 * Callers never branch on the mode; src/lib/chain/escrow.ts picks the adapter.
 */
export interface ChainAdapter {
  readonly kind: "viem" | "demo";

  // ---- escrow (per phase) ----
  fundPhase(phaseId: string, clientUserId: string, workerUserId: string, amountInr: number): Promise<TxHash>;
  markDelivered(phaseId: string, releaseEligibleAfter: number): Promise<TxHash>;
  approveRelease(phaseId: string): Promise<TxHash>;
  autoRelease(phaseId: string): Promise<TxHash>;
  raiseDispute(phaseId: string): Promise<TxHash>;
  resolveDispute(phaseId: string, workerBps: number): Promise<TxHash>;
  refundToClient(phaseId: string): Promise<TxHash>;
  readEscrow(phaseId: string): Promise<EscrowView>;

  // ---- delivery stake (per hire) ----
  lockStake(hireId: string, workerUserId: string, clientUserId: string, amountInr: number): Promise<TxHash>;
  refundStake(hireId: string): Promise<TxHash>;
  forfeitStake(hireId: string): Promise<TxHash>;

  // ---- wallet (stablecoin) ----
  balanceOfInr(address: string): Promise<number>;
  /** Mock fiat on-ramp: credit `amountInr` to `address`. */
  mintInr(address: string, amountInr: number): Promise<TxHash>;
  /** Mock fiat off-ramp: move the user's whole custodial balance out. null when 0. */
  withdrawAll(userId: string): Promise<{ txHash: TxHash; amountInr: number } | null>;

  // ---- reconciliation ----
  /** The mined receipt of `hash`; null if unknown / not mined (always null in demo mode). */
  txReceipt(hash: TxHash): Promise<TxReceiptView | null>;
}

export interface TxReceiptView {
  status: "success" | "reverted";
  blockNumber: bigint;
  gasUsed: bigint;
  effectiveGasPrice: bigint;
}
