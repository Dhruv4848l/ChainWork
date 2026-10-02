import test from "node:test";
import assert from "node:assert/strict";
import { privateKeyToAccount } from "viem/accounts";
import { verifyTypedData } from "viem";
import { demoAuthTypedData } from "./demoAuth";

const payer = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const q = { id: "q1", phaseId: "p1", assetSymbol: "USDT", assetAmount: "17045455", amountInr: 1500, workerAddress: "0x90F79bf6EB2c4f870365E785982E1f101E93b906", expiresAt: "2026-10-02T13:00:00.000Z" };

test("a signed authorisation verifies for the quote it was made for, and only that", async () => {
  const td = demoAuthTypedData(q, 31337);
  const signature = await payer.signTypedData(td);
  assert.equal(await verifyTypedData({ address: payer.address, ...td, signature }), true);
  // Any tampering with the quote — amount, payee, chain — breaks it.
  for (const changed of [
    demoAuthTypedData({ ...q, assetAmount: "1" }, 31337),
    demoAuthTypedData({ ...q, workerAddress: "0x0000000000000000000000000000000000000001" }, 31337),
    demoAuthTypedData(q, 80002),
  ]) {
    assert.equal(await verifyTypedData({ address: payer.address, ...changed, signature }), false);
  }
});
