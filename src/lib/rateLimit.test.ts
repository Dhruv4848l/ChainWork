import { test } from "node:test";
import assert from "node:assert/strict";
import { rateLimit, rateLimitReset, _resetAllRateLimits } from "./rateLimit";

/* Phase 13 — brute-force guard on the auth surfaces. */

test("allows up to the limit, then blocks", () => {
  _resetAllRateLimits();
  const key = "login:a@x.com";
  for (let i = 0; i < 5; i++) assert.equal(rateLimit(key, 5, 60_000).allowed, true, `attempt ${i + 1}`);
  const blocked = rateLimit(key, 5, 60_000);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterMs > 0, "reports a retry-after");
});

test("a successful auth resets the counter", () => {
  _resetAllRateLimits();
  const key = "login:b@x.com";
  rateLimit(key, 5, 60_000);
  rateLimit(key, 5, 60_000);
  rateLimitReset(key); // simulate a correct password
  // Budget is full again.
  for (let i = 0; i < 5; i++) assert.equal(rateLimit(key, 5, 60_000).allowed, true);
});

test("the window expires and refreshes the budget", () => {
  _resetAllRateLimits();
  const key = "login:c@x.com";
  for (let i = 0; i < 5; i++) rateLimit(key, 5, 1); // 1ms window
  // After the window, a fresh attempt is allowed again.
  const later = Date.now() + 5;
  while (Date.now() < later) { /* spin briefly past the 1ms window */ }
  assert.equal(rateLimit(key, 5, 1).allowed, true);
});

test("keys are independent", () => {
  _resetAllRateLimits();
  for (let i = 0; i < 5; i++) rateLimit("login:x", 5, 60_000);
  assert.equal(rateLimit("login:x", 5, 60_000).allowed, false);
  assert.equal(rateLimit("login:y", 5, 60_000).allowed, true, "different key unaffected");
});
