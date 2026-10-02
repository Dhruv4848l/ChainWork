import test from "node:test";
import assert from "node:assert/strict";
import { isUserRejection, walletErrorMessage } from "./walletErrors";

test("maps the common EIP-1193 codes to plain language, even when nested", () => {
  assert.match(walletErrorMessage({ code: 4001, message: "User rejected the request." }), /cancelled/);
  assert.match(walletErrorMessage({ message: "wrapped", cause: { cause: { code: -32002 } } }), /already has a request waiting/);
  assert.match(walletErrorMessage({ code: 4902 }, { networkName: "Polygon Amoy" }), /doesn't know Polygon Amoy/);
  assert.match(walletErrorMessage({ shortMessage: "insufficient funds for gas * price + value" }), /enough balance/);
  assert.match(walletErrorMessage({ name: "ConnectorNotFoundError" }), /No browser wallet/);
  assert.match(walletErrorMessage(new Error("something odd")), /couldn't complete/);
});

test("recognises a deliberate cancel", () => {
  assert.equal(isUserRejection({ cause: { code: 4001 } }), true);
  assert.equal(isUserRejection({ code: -32603 }), false);
});
