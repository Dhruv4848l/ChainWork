/*
  Which TOTP secret an admin's 2FA code is checked against — pure, so it is unit-tested
  (totpPolicy.test.ts). Each admin enrols their own secret in an authenticator app
  (scripts/rotate-admin-credentials.mts). In DEVELOPMENT only, an admin without one falls
  back to a shared dev secret so the console is testable without an app. That secret is
  published in this repo, so in production there is no fallback: no enrolled secret, no login.
*/

// A valid base32 secret (20 bytes ≥ the 128-bit minimum otplib v13 requires). DEV ONLY.
export const ADMIN_DEV_TOTP_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";

/** The admin's own secret if properly enrolled (long enough, not the public dev one). */
function enrolled(secret: string | null): secret is string {
  return !!secret && secret.length >= 26 && secret !== ADMIN_DEV_TOTP_SECRET;
}

/** The secret to check this admin's code against, or null = not enrolled (login refused). */
export function totpSecretFor(secret: string | null, env: string | undefined = process.env.NODE_ENV): string | null {
  if (enrolled(secret)) return secret;
  return env === "production" ? null : ADMIN_DEV_TOTP_SECRET;
}
