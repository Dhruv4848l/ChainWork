import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

/*
  Lets the payment service see the chain transaction a money operation produces
  without threading callbacks through every adapter signature. The service runs the
  operation inside `observeChainTx(observer, fn)`; the adapter reports its PRIMARY
  transaction (the escrow call itself — not gas top-ups or approvals):
    - onSubmitted(hash)  as soon as it is broadcast → the payment becomes SUBMITTED with
                         its hash recorded, so the reconciler can finish it even if this
                         request dies while waiting for the confirmation;
    - onMined(receipt)   once confirmed → block number and gas for the receipt (P2).
*/

export interface MinedTx {
  hash: `0x${string}`;
  blockNumber: bigint;
  gasUsed: bigint;
  effectiveGasPrice: bigint;
}

export interface ChainTxObserver {
  onSubmitted(hash: `0x${string}`): Promise<void>;
  onMined(tx: MinedTx): void;
}

const store = new AsyncLocalStorage<ChainTxObserver>();

export function observeChainTx<T>(observer: ChainTxObserver, fn: () => Promise<T>): Promise<T> {
  return store.run(observer, fn);
}

export function currentChainTxObserver(): ChainTxObserver | undefined {
  return store.getStore();
}
