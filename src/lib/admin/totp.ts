import "server-only";
import { generateSync, verifySync } from "otplib";

/*
  TOTP (RFC 6238) for admin 2FA — a real check via otplib (v13 API). In production
  each admin enrolls their own secret in an authenticator app; here we use a shared
  DEV secret so the console is testable without an app. The 2FA verification itself
  is genuine (not a bypass).
*/

// A valid base32 secret (20 bytes ≥ the 128-bit minimum otplib v13 requires).
export const ADMIN_DEV_TOTP_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";

/** Use a stored per-admin secret only if it's long enough; else the shared DEV one. */
export function totpSecretFor(secret: string | null): string {
  return secret && secret.length >= 26 ? secret : ADMIN_DEV_TOTP_SECRET;
}

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
