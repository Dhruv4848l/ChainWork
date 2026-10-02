import "server-only";
import { createPublicClient, decodeEventLog, http, zeroAddress } from "viem";
import { RPC_URL, ESCROW_ADDRESS, activeChain, phaseEscrowAbi } from "./config";
import { keyFor } from "./keys";
import { meetsQuote } from "@/lib/payments/quoteMath";
import type { MinedTx } from "@/lib/payments/observer";

/*
  Server-side verification of a phase funding the payer sent from their OWN wallet
  (payment plan P6.5). Nothing in the DB moves until the mined transaction proves:

    - it succeeded, and emitted PhaseFunded from OUR escrow contract;
    - for THIS phase (bytes32 key), to the worker address quoted (= the payout address
      the contract will release to);
    - in the quoted asset (token address, or the zero address for the native coin);
    - for at least the quoted amount (1 % slippage tolerance).

  A forged / unrelated / tampered transaction fails one of these and is recorded as a
  failed payment with the reason. The chain is the source of truth — never the client.
*/

export class FundingVerificationError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "FundingVerificationError";
  }
}

const client = createPublicClient({ chain: activeChain(), transport: http(RPC_URL) });

export interface ExpectedFunding {
  txHash: `0x${string}`;
  phaseId: string;
  workerAddress: string;
  /** null = native coin. */
  assetAddress: string | null;
  /** Quoted base units. */
  assetAmount: string;
  /** How long to wait for the receipt before treating it as pending (default 60 s). */
  receiptTimeoutMs?: number;
}

const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export async function verifyPhaseFunding(x: ExpectedFunding): Promise<MinedTx & { from: string; paidRaw: bigint }> {
  // Not mined within a minute → viem's timeout error, classified as pending: the payment
  // stays SUBMITTED and the reconciler finishes it.
  const receipt = await client.waitForTransactionReceipt({ hash: x.txHash, timeout: x.receiptTimeoutMs ?? 60_000 });
  if (receipt.status !== "success") {
    throw new FundingVerificationError("REVERTED", "The transaction failed on-chain (reverted). No money was moved.");
  }

  const funded = receipt.logs
    .filter((l) => eq(l.address, ESCROW_ADDRESS))
    .map((l) => {
      try {
        return decodeEventLog({ abi: phaseEscrowAbi, data: l.data, topics: l.topics });
      } catch {
        return null;
      }
    })
    .find((d) => d?.eventName === "PhaseFunded");
  if (!funded) {
    throw new FundingVerificationError("NOT_A_FUNDING", "That transaction didn't fund a ChainWork escrow.");
  }
  const a = funded.args as unknown as { phaseId: `0x${string}`; client: string; worker: string; asset: string; amount: bigint };

  if (a.phaseId !== keyFor(x.phaseId)) {
    throw new FundingVerificationError("WRONG_PHASE", "That payment funded a different phase.");
  }
  if (!eq(a.worker, x.workerAddress)) {
    throw new FundingVerificationError("WRONG_WORKER", "That payment named a different worker address than the one quoted.");
  }
  if (!eq(a.asset, x.assetAddress ?? zeroAddress)) {
    throw new FundingVerificationError("WRONG_ASSET", "That payment was made in a different currency than the one quoted.");
  }
  if (!meetsQuote(a.amount, BigInt(x.assetAmount))) {
    throw new FundingVerificationError("UNDERPAID", "That payment was less than the quoted amount.");
  }

  const tx = await client.getTransaction({ hash: x.txHash });
  return {
    hash: x.txHash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed,
    effectiveGasPrice: receipt.effectiveGasPrice,
    from: tx.from,
    paidRaw: a.amount,
  };
}
