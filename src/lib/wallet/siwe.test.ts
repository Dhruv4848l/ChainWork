import test from "node:test";
import assert from "node:assert/strict";
import { privateKeyToAccount } from "viem/accounts";
import { verifyMessage } from "viem";
import { buildLinkMessage, checkLinkMessage, isExternalPayoutActive, payoutActiveFrom, payoutCooldownMs } from "./siwe";

const account = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const other = privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a");
const now = new Date("2026-10-02T06:00:00Z");
const base = { domain: "chainwork.app", uri: "https://chainwork.app", address: account.address, chainId: 80002, nonce: "abcdef1234567890", userId: "user_1" };
const msg = buildLinkMessage({ ...base, issuedAt: now });
const expect = (over: Partial<typeof base & { now: Date }> = {}) => ({ ...base, now: new Date(now.getTime() + 60_000), ...over });

test("a fresh message from our own server validates, and the signer verifies", async () => {
  assert.deepEqual(checkLinkMessage(msg, expect()), { ok: true });
  const signature = await account.signMessage({ message: msg });
  assert.equal(await verifyMessage({ address: account.address, message: msg, signature }), true);
  // An impostor's signature over the same message does not verify for the address.
  const forged = await other.signMessage({ message: msg });
  assert.equal(await verifyMessage({ address: account.address, message: msg, signature: forged }), false);
});

test("expired, other-domain, other-nonce, other-chain, other-user and other-address messages are refused", () => {
  assert.match((checkLinkMessage(msg, expect({ now: new Date(now.getTime() + 11 * 60_000) })) as { reason: string }).reason, /expired/);
  assert.equal(checkLinkMessage(msg, expect({ domain: "evil.example" })).ok, false);
  assert.equal(checkLinkMessage(msg, expect({ nonce: "zzzzzzzzzzzzzzzz" })).ok, false);
  assert.equal(checkLinkMessage(msg, expect({ chainId: 1 })).ok, false);
  assert.equal(checkLinkMessage(msg, expect({ userId: "user_2" })).ok, false);
  assert.equal(checkLinkMessage(msg, expect({ address: other.address })).ok, false);
  assert.equal(checkLinkMessage(msg, expect({ uri: "https://evil.example" })).ok, false);
});

test("an altered message is refused", () => {
  const tampered = msg.replace("does not move funds", "moves funds");
  assert.equal(checkLinkMessage(tampered, expect()).ok, false);
  assert.equal(checkLinkMessage("hello", expect()).ok, false);
});

test("payout safety hold: a new link waits, a legacy link is already active", () => {
  const day = 24 * 3_600_000;
  assert.equal(payoutCooldownMs("24"), day);
  assert.equal(payoutCooldownMs("not-a-number"), day);
  assert.equal(payoutCooldownMs("0"), 0);
  assert.equal(isExternalPayoutActive(now, new Date(now.getTime() + day - 1), day), false);
  assert.equal(isExternalPayoutActive(now, new Date(now.getTime() + day), day), true);
  assert.equal(isExternalPayoutActive(null, now, day), true);
  assert.equal(payoutActiveFrom(null, day), null);
});
