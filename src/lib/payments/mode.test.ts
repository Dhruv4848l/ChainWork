import test from "node:test";
import assert from "node:assert/strict";
import { resolvePaymentMode, assertPaymentConfig, paymentModeInfo, PaymentConfigError } from "./mode";

test("PAYMENT_MODE wins when set", () => {
  assert.equal(resolvePaymentMode({ PAYMENT_MODE: "demo" }), "demo");
  assert.equal(resolvePaymentMode({ PAYMENT_MODE: "TESTNET", MOCK_BLOCKCHAIN: "true" }), "testnet");
});

test("legacy MOCK_BLOCKCHAIN=true maps to demo", () => {
  assert.equal(resolvePaymentMode({ MOCK_BLOCKCHAIN: "true" }), "demo");
  assert.equal(resolvePaymentMode({ MOCK_BLOCKCHAIN: "false" }), "testnet");
});

test("removing every flag falls back to testnet, never mainnet", () => {
  assert.equal(resolvePaymentMode({}), "testnet");
});

test("an unknown PAYMENT_MODE is rejected", () => {
  assert.throws(() => resolvePaymentMode({ PAYMENT_MODE: "live" }), PaymentConfigError);
});

test("mainnet is locked without an audit reference", () => {
  assert.throws(() => assertPaymentConfig({ PAYMENT_MODE: "mainnet", CHAIN_ID: "137" }), PaymentConfigError);
  assert.equal(
    assertPaymentConfig({ PAYMENT_MODE: "mainnet", CHAIN_ID: "137", MAINNET_AUDIT_APPROVED: "audit-2027-01" }),
    "mainnet",
  );
});

test("a real-value chain id is refused outside mainnet mode", () => {
  assert.throws(() => assertPaymentConfig({ PAYMENT_MODE: "testnet", CHAIN_ID: "1" }), PaymentConfigError);
  assert.throws(() => assertPaymentConfig({ MOCK_BLOCKCHAIN: "true", CHAIN_ID: "137" }), PaymentConfigError);
  assert.equal(assertPaymentConfig({ PAYMENT_MODE: "testnet", CHAIN_ID: "80002" }), "testnet");
  assert.equal(assertPaymentConfig({ PAYMENT_MODE: "testnet" }), "testnet"); // defaults to 31337
});

test("demo and testnet receipts carry a watermark; mainnet does not", () => {
  assert.match(paymentModeInfo("demo").watermark ?? "", /DEMO/);
  assert.match(paymentModeInfo("testnet").watermark ?? "", /TESTNET/);
  assert.equal(paymentModeInfo("mainnet").watermark, null);
});
