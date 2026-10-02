/*
  Gas recovery maths (payment plan P3.7) — pure, unit-tested (gasMath.test.ts).

  On a real testnet a custodial wallet starts with no native coin: every bit of gas it
  holds was sponsored by the relayer (./gas.ts ensureGas). When a withdrawal empties the
  wallet, the leftover is swept back to the relayer, minus the fee for the sweep itself.
*/

/** A plain native-coin transfer. */
export const NATIVE_TRANSFER_GAS = BigInt(21_000);

/**
 * How much native coin to send back, or 0 when it isn't worth it.
 * @param balanceWei   the wallet's native balance
 * @param gasPriceWei  current gas price
 * @param dustWei      don't bother sweeping less than this
 */
export function gasToRecover(balanceWei: bigint, gasPriceWei: bigint, dustWei: bigint): bigint {
  // 20 % headroom on the sweep's own fee so a small price bump can't make it revert.
  const fee = (NATIVE_TRANSFER_GAS * gasPriceWei * BigInt(12)) / BigInt(10);
  const left = balanceWei - fee;
  return left > dustWei ? left : BigInt(0);
}

/** The local Hardhat chain pre-funds every account with real dev ETH — nothing was sponsored. */
export function shouldRecoverGas(chainId: number): boolean {
  return chainId !== 31337;
}
