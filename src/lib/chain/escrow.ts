import "server-only";
import { paymentMode } from "@/lib/payments/mode";
import { viemAdapter } from "./viemAdapter";
import { demoAdapter } from "./demoAdapter";
import type { ChainAdapter } from "./types";

/*
  The app's single entry point to "the chain". Callers import this module and never
  branch on the payment mode: `adapter()` picks the real chain (viemAdapter — testnet
  or mainnet) or the dummy-money simulation (demoAdapter — demo mode), which enforce
  the same PhaseEscrow rules. See src/lib/payments/mode.ts.

  (Before the payment plan this file held the viem code plus an
  `if (MOCK_BLOCKCHAIN) return fake hash` in every function; that stub recorded no
  state, so balances and escrow status were fiction. It lives on as the demo adapter.)
*/

export function adapter(): ChainAdapter {
  return paymentMode() === "demo" ? demoAdapter : viemAdapter;
}

export { keyFor } from "./keys";
export { toTokenUnits, fromTokenUnits } from "./viemAdapter";

export const fundPhase: ChainAdapter["fundPhase"] = (...a) => adapter().fundPhase(...a);
export const markDelivered: ChainAdapter["markDelivered"] = (...a) => adapter().markDelivered(...a);
export const approveRelease: ChainAdapter["approveRelease"] = (...a) => adapter().approveRelease(...a);
export const autoRelease: ChainAdapter["autoRelease"] = (...a) => adapter().autoRelease(...a);
export const raiseDispute: ChainAdapter["raiseDispute"] = (...a) => adapter().raiseDispute(...a);
export const resolveDispute: ChainAdapter["resolveDispute"] = (...a) => adapter().resolveDispute(...a);
export const refundToClient: ChainAdapter["refundToClient"] = (...a) => adapter().refundToClient(...a);
export const readEscrow: ChainAdapter["readEscrow"] = (...a) => adapter().readEscrow(...a);
export const lockStake: ChainAdapter["lockStake"] = (...a) => adapter().lockStake(...a);
export const refundStake: ChainAdapter["refundStake"] = (...a) => adapter().refundStake(...a);
export const forfeitStake: ChainAdapter["forfeitStake"] = (...a) => adapter().forfeitStake(...a);
export const balanceOfInr: ChainAdapter["balanceOfInr"] = (...a) => adapter().balanceOfInr(...a);
