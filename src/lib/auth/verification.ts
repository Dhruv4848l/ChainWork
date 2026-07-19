import "server-only";
import bcrypt from "bcryptjs";
import { platformDb } from "@/lib/platformDb";
import { sendSms } from "@/lib/sms";
import type { VerificationPurpose } from "@/generated/platform";

/*
  Verification tokens for phone OTP, email verification, and password reset.
  We store only a HASH of each code/token.

  DELIVERY: phone OTP goes through the pluggable SMS service (src/lib/sms.ts) —
  set SMS_PROVIDER=twilio or fast2sms in .env for real texts; unset/mock logs the
  code to the server console. Email (verification + reset links) is still mocked
  to the console — TODO(production): wire a real email provider (Resend/SES).
*/

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour for email/reset links
const MIN_RESEND_INTERVAL_MS = 20 * 1000; // basic resend throttle

function sixDigitCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function randomToken(): string {
  // 32 hex chars, good enough for a dev link token
  return Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("");
}

/** Throttle: has a token of this purpose been issued very recently? */
async function issuedTooRecently(
  userId: string,
  purpose: VerificationPurpose
): Promise<boolean> {
  const last = await platformDb.verificationToken.findFirst({
    where: { userId, purpose },
    orderBy: { createdAt: "desc" },
  });
  if (!last) return false;
  return Date.now() - last.createdAt.getTime() < MIN_RESEND_INTERVAL_MS;
}

async function replaceToken(
  userId: string,
  purpose: VerificationPurpose,
  rawValue: string,
  ttlMs: number
) {
  // Invalidate any outstanding tokens of this purpose, then create the new one.
  await platformDb.verificationToken.deleteMany({ where: { userId, purpose } });
  await platformDb.verificationToken.create({
    data: {
      userId,
      purpose,
      tokenHash: await bcrypt.hash(rawValue, 10),
      expiresAt: new Date(Date.now() + ttlMs),
    },
  });
}

// ---- Phone OTP ----

export async function sendPhoneOtp(
  userId: string,
  phone: string
): Promise<{ ok: boolean; throttled?: boolean }> {
  if (await issuedTooRecently(userId, "PHONE_OTP")) {
    return { ok: false, throttled: true };
  }
  const code = sixDigitCode();
  await replaceToken(userId, "PHONE_OTP", code, OTP_TTL_MS);
  // Delivery goes through the pluggable SMS service (src/lib/sms.ts). With
  // SMS_PROVIDER unset/mock it logs the code to the console (dev behavior);
  // with twilio/fast2sms configured it sends a real text.
  await sendSms(phone, `Your ChainWork verification code is ${code}. It expires in 10 minutes.`, { otpCode: code });
  return { ok: true };
}

export async function verifyPhoneOtp(
  userId: string,
  code: string
): Promise<{ ok: boolean; error?: string }> {
  const token = await platformDb.verificationToken.findFirst({
    where: { userId, purpose: "PHONE_OTP", consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!token) return { ok: false, error: "No active code — request a new one." };
  if (token.expiresAt < new Date()) return { ok: false, error: "Code expired." };
  if (token.attempts >= 5) return { ok: false, error: "Too many attempts — request a new code." };

  const match = await bcrypt.compare(code, token.tokenHash);
  if (!match) {
    await platformDb.verificationToken.update({
      where: { id: token.id },
      data: { attempts: { increment: 1 } },
    });
    return { ok: false, error: "Incorrect code." };
  }

  await platformDb.$transaction([
    platformDb.verificationToken.update({
      where: { id: token.id },
      data: { consumedAt: new Date() },
    }),
    platformDb.user.update({
      where: { id: userId },
      data: { phoneVerified: true },
    }),
  ]);
  return { ok: true };
}

// ---- Email verification ----

export async function sendEmailVerification(
  userId: string,
  email: string
): Promise<{ ok: boolean; throttled?: boolean }> {
  if (await issuedTooRecently(userId, "EMAIL_VERIFY")) {
    return { ok: false, throttled: true };
  }
  const token = randomToken();
  await replaceToken(userId, "EMAIL_VERIFY", token, TOKEN_TTL_MS);
  const link = `/verify/email/confirm?uid=${userId}&token=${token}`;
  console.log(`\n[MOCK EMAIL] Verify ${email}: open ${link}\n`);
  return { ok: true };
}

export async function confirmEmailToken(
  userId: string,
  token: string
): Promise<{ ok: boolean; error?: string }> {
  const record = await platformDb.verificationToken.findFirst({
    where: { userId, purpose: "EMAIL_VERIFY", consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!record || record.expiresAt < new Date())
    return { ok: false, error: "This link is invalid or has expired." };
  if (!(await bcrypt.compare(token, record.tokenHash)))
    return { ok: false, error: "This link is invalid." };

  await platformDb.$transaction([
    platformDb.verificationToken.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    }),
    platformDb.user.update({
      where: { id: userId },
      data: { emailVerified: true },
    }),
  ]);
  return { ok: true };
}

// ---- Password reset (token issue + consume) ----

export async function sendPasswordReset(
  userId: string,
  destination: string
): Promise<void> {
  const token = randomToken();
  await replaceToken(userId, "PASSWORD_RESET", token, TOKEN_TTL_MS);
  const link = `/reset-password?uid=${userId}&token=${token}`;
  console.log(`\n[MOCK] Password reset for ${destination}: open ${link}\n`);
}

export async function consumePasswordReset(
  userId: string,
  token: string
): Promise<boolean> {
  const record = await platformDb.verificationToken.findFirst({
    where: { userId, purpose: "PASSWORD_RESET", consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!record || record.expiresAt < new Date()) return false;
  if (!(await bcrypt.compare(token, record.tokenHash))) return false;
  await platformDb.verificationToken.update({
    where: { id: record.id },
    data: { consumedAt: new Date() },
  });
  return true;
}
