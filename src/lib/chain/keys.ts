import { keccak256, toHex } from "viem";

/** Deterministic bytes32 key for a phase / hire cuid — identical on-chain and in demo mode. */
export function keyFor(id: string): `0x${string}` {
  return keccak256(toHex(id));
}
