import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ADMIN_DEV_TOTP_SECRET, totpSecretFor } from "./totpPolicy";

/*
  Admin 2FA regression tests (security fix, 2026-10-03). Production accepted "000000" as a
  2FA code and fell back to a dev secret published in the repo, so the public seed password
  was enough to enter the live admin console.
*/
const ENROLLED = "KRUGS4ZANFZSAYJAONSWG4TFOQQGC3TE"; // 32-char base32

test("production: an enrolled admin is checked against their own secret", () => {
  assert.equal(totpSecretFor(ENROLLED, "production"), ENROLLED);
});

test("production: no enrolled secret means no login — never the shared dev secret", () => {
  assert.equal(totpSecretFor(null, "production"), null);
  assert.equal(totpSecretFor("SHORTSECRET", "production"), null);
  assert.equal(totpSecretFor(ADMIN_DEV_TOTP_SECRET, "production"), null, "the published dev secret is never an enrolment");
});

test("development: an admin without a secret uses the dev secret so the console is testable", () => {
  assert.equal(totpSecretFor(null, "development"), ADMIN_DEV_TOTP_SECRET);
  assert.equal(totpSecretFor(ENROLLED, "development"), ENROLLED);
});

test("admin login has no hard-coded bypass code", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "src/features/admin/actions.ts"), "utf8");
  const login = src.slice(src.indexOf("export async function adminLoginAction"), src.indexOf("export async function adminLogoutAction"));
  assert.ok(login.length > 0, "adminLoginAction not found");
  assert.doesNotMatch(login, /["'`]\d{6}["'`]/, "a literal 6-digit code in the admin login is a 2FA bypass");
  assert.match(login, /verifyTotp\(/, "the login must verify the TOTP code");
});
