import "server-only";
import { generateSync, verifySync } from "otplib";

/*
  TOTP (RFC 6238) for admin 2FA — a real check via otplib (v13 API). Which secret applies
  (and that production has no shared fallback) lives in totpPolicy.ts. There is no bypass
  code: a login needs the code from the admin's own authenticator.
*/
export { ADMIN_DEV_TOTP_SECRET, totpSecretFor } from "./totpPolicy";

export function verifyTotp(secret: string, token: string): boolean {
  try {
    return verifySync({ token: token.replace(/\s/g, ""), secret }).valid;
  } catch {
    return false;
  }
}

/** The current valid code — logged to the server console in dev so 2FA is testable. */
export function currentTotp(secret: string): string {
  return generateSync({ secret });
}
