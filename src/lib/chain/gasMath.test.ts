import test from "node:test";
import assert from "node:assert/strict";
import { gasToRecover, shouldRecoverGas } from "./gasMath";

const gwei = BigInt(1_000_000_000);
const eth = BigInt(10) ** BigInt(18);

test("sweeps the balance minus the sweep's own fee (with headroom)", () => {
  const bal = eth / BigInt(20); // 0.05
  const price = BigInt(30) * gwei;
  const fee = (BigInt(21_000) * price * BigInt(12)) / BigInt(10);
  assert.equal(gasToRecover(bal, price, BigInt(0)), bal - fee);
});

test("leaves dust and anything that can't pay its own fee", () => {
  assert.equal(gasToRecover(BigInt(1000), BigInt(30) * gwei, BigInt(0)), BigInt(0));
  assert.equal(gasToRecover(eth / BigInt(1000), BigInt(30) * gwei, eth / BigInt(100)), BigInt(0));
});

test("never sweeps on the local Hardhat chain", () => {
  assert.equal(shouldRecoverGas(31337), false);
  assert.equal(shouldRecoverGas(80002), true);
});
