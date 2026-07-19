"use server";

import { redirect } from "next/navigation";
import { platformDb } from "@/lib/platformDb";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession } from "@/lib/auth/session";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { assertKycVerified } from "@/lib/auth/guards";
import { rateLimit, rateLimitReset } from "@/lib/rateLimit";
import {
  sendPhoneOtp,
  verifyPhoneOtp,
  sendEmailVerification,
  confirmEmailToken,
  sendPasswordReset,
  consumePasswordReset,
} from "@/lib/auth/verification";
import type { Role } from "@/generated/platform";

export interface FormState {
  error?: string;
  ok?: boolean;
  message?: string;
}

// A deterministic-enough fake custodial address for the dev/testnet wallet.
function fakeAddress(seed: string): string {
  let h = "";
  for (let i = 0; i < seed.length; i++) h += seed.charCodeAt(i).toString(16);
  return "0x" + (h + "0".repeat(40)).slice(0, 40);
}

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

// ---------------------------------------------------------------------------
// Signup
// ---------------------------------------------------------------------------
export async function signupAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const role = str(formData, "role") as Role;
  const name = str(formData, "name");
  const phone = str(formData, "phone");
  const email = str(formData, "email").toLowerCase();
  const password = str(formData, "password");
  const agreed = formData.get("agree") === "on";
  const clientType = str(formData, "clientType") || "INDIVIDUAL";
  const companyName = str(formData, "companyName");
  const businessRegNumber = str(formData, "businessRegNumber");

  if (role !== "WORKER" && role !== "CLIENT")
    return { error: "Please choose Find Work or Post a Job." };
  if (!name) return { error: "Enter your full name." };
  if (!/^\+?\d[\d\s-]{7,}$/.test(phone))
    return { error: "Enter a valid phone number." };
  if (password.length < 8)
    return { error: "Password must be at least 8 characters." };
  if (!agreed) return { error: "Please accept the Terms and Privacy Policy." };
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return { error: "Enter a valid email address (or leave it blank)." };

  const normalizedPhone = phone.replace(/[\s-]/g, "");

  // Uniqueness checks
  if (await platformDb.user.findUnique({ where: { phone: normalizedPhone } }))
    return { error: "An account with this phone already exists. Try logging in." };
  if (email && (await platformDb.user.findUnique({ where: { email } })))
    return { error: "An account with this email already exists." };

  // Email is optional at signup; synthesize a placeholder unique email if omitted,
  // so the unique column is satisfied. Users can add a real one later.
  const finalEmail = email || `${normalizedPhone}@phone.chainwork.local`;

  const user = await platformDb.user.create({
    data: {
      role,
      name,
      phone: normalizedPhone,
      email: finalEmail,
      emailVerified: false,
      passwordHash: await hashPassword(password),
      wallet: {
        create: { custodialAddress: fakeAddress("w-" + normalizedPhone) },
      },
      ...(role === "WORKER"
        ? { workerProfile: { create: {} } }
        : {
            clientProfile: {
              create: {
                clientType: clientType === "BUSINESS" ? "BUSINESS" : "INDIVIDUAL",
                companyName: companyName || null,
                businessRegNumber: businessRegNumber || null,
              },
            },
          }),
    },
  });

  // Log the user in immediately, then start phone verification (mandatory, first).
  await createSession({ sub: user.id, role: user.role });
  await sendPhoneOtp(user.id, normalizedPhone);
  redirect("/verify/phone");
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------
export async function loginAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const identifier = str(formData, "identifier");
  const password = str(formData, "password");
  const returnTo = str(formData, "returnTo");
  if (!identifier || !password)
    return { error: "Enter your phone/email and password." };

  const normalized = identifier.includes("@")
    ? identifier.toLowerCase()
    : identifier.replace(/[\s-]/g, "");

  // Brute-force guard: cap failed attempts per identifier (reset on success below).
  const rlKey = `login:${normalized}`;
  const rl = rateLimit(rlKey, 5, 15 * 60 * 1000); // 5 tries / 15 min
  if (!rl.allowed)
    return { error: `Too many attempts. Try again in ${Math.ceil(rl.retryAfterMs / 60000)} min.` };

  const user = await platformDb.user.findFirst({
    where: { OR: [{ email: normalized }, { phone: normalized }] },
  });
  // Same generic message whether the user exists or not (no account enumeration).
  if (!user || !(await verifyPassword(password, user.passwordHash)))
    return { error: "Incorrect phone/email or password." };
  rateLimitReset(rlKey); // a correct password clears the counter
  if (user.suspended)
    return { error: "This account is suspended. Contact support." };

  await createSession({ sub: user.id, role: user.role });

  // Route to the right next step.
  if (!user.phoneVerified) {
    await sendPhoneOtp(user.id, user.phone ?? "");
    redirect("/verify/phone");
  }
  if (returnTo) redirect(returnTo);
  if (!user.onboarded)
    redirect(user.role === "WORKER" ? "/onboarding/worker" : "/onboarding/client");
  redirect(user.role === "WORKER" ? "/dashboard/worker" : "/dashboard/client");
}

// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------
export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}

// ---------------------------------------------------------------------------
// Phone OTP
// ---------------------------------------------------------------------------
export async function resendOtpAction(): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const res = await sendPhoneOtp(user.id, user.phone ?? "");
  if (res.throttled)
    return { error: "Please wait a moment before requesting another code." };
  return { ok: true, message: "A new code is on its way." };
}

export async function verifyOtpAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // OTP boxes submit as a single joined "code" field.
  const code = str(formData, "code").replace(/\D/g, "");
  if (code.length !== 6) return { error: "Enter the 6-digit code." };

  const res = await verifyPhoneOtp(user.id, code);
  if (!res.ok) return { error: res.error ?? "Verification failed." };

  // Email verification comes next; kick off the (mock) email send.
  const hasRealEmail = !user.email.endsWith("@phone.chainwork.local");
  if (hasRealEmail) await sendEmailVerification(user.id, user.email);
  redirect("/verify/email");
}

// ---------------------------------------------------------------------------
// Email verification
// ---------------------------------------------------------------------------
export async function resendEmailAction(): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const res = await sendEmailVerification(user.id, user.email);
  if (res.throttled)
    return { error: "Please wait a moment before resending." };
  return { ok: true, message: "Verification email resent." };
}

export async function confirmEmailAction(
  uid: string,
  token: string
): Promise<{ ok: boolean; error?: string }> {
  return confirmEmailToken(uid, token);
}

/** Continue past email verification without completing it (browsing is allowed). */
export async function continueToOnboardingAction(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  redirect(user.role === "WORKER" ? "/onboarding/worker" : "/onboarding/client");
}

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------
export async function completeWorkerOnboardingAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "WORKER") redirect("/onboarding/client");

  const headline = str(formData, "headline");
  const location = str(formData, "location");
  const experienceYears = parseInt(str(formData, "experienceYears") || "0", 10);
  const availability = str(formData, "availability") || "Available This Week";
  const languages = str(formData, "languages")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const skillIds = formData.getAll("skills").map(String).filter(Boolean);

  await platformDb.workerProfile.update({
    where: { userId: user.id },
    data: {
      headline: headline || null,
      location: location || null,
      experienceYears: Number.isFinite(experienceYears) ? experienceYears : 0,
      availability,
      languages,
      skills: {
        deleteMany: {},
        create: skillIds.map((skillId) => ({ skillId, proficiency: "SKILLED" as const })),
      },
    },
  });
  await platformDb.user.update({ where: { id: user.id }, data: { onboarded: true } });
  redirect("/kyc?reason=onboarding");
}

export async function completeClientOnboardingAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "CLIENT") redirect("/onboarding/worker");

  const displayName = str(formData, "displayName");
  const address = str(formData, "address");

  await platformDb.clientProfile.update({
    where: { userId: user.id },
    data: { address: address || null },
  });
  if (displayName)
    await platformDb.user.update({
      where: { id: user.id },
      data: { name: displayName, onboarded: true },
    });
  else
    await platformDb.user.update({ where: { id: user.id }, data: { onboarded: true } });
  redirect("/dashboard/client");
}

// ---------------------------------------------------------------------------
// KYC (mocked auto-approval to VERIFIED)
// ---------------------------------------------------------------------------
export async function submitKycAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const returnTo = str(formData, "returnTo");

  // MOCK: a real KYC provider would verify the uploaded ID + liveness selfie and
  // return a decision asynchronously. Here we auto-approve to VERIFIED on submit.
  // TODO(production): integrate a real KYC/AML provider; set tier from its verdict.
  await platformDb.user.update({
    where: { id: user.id },
    data: { kycTier: "VERIFIED" },
  });

  // Return the user to the money action they were mid-way through, if any.
  if (returnTo) redirect(returnTo);
  redirect(user.role === "WORKER" ? "/dashboard/worker" : "/dashboard/client");
}

// ---------------------------------------------------------------------------
// KYC-gated demo money action (proves the gate works before real escrow exists)
// ---------------------------------------------------------------------------
export async function fundEscrowTestAction(
  _prev: FormState,
  _formData: FormData
): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const dashboard = user.role === "WORKER" ? "/dashboard/worker" : "/dashboard/client";
  // The gate: unverified users are bounced to the KYC soft-block, preserving intent.
  await assertKycVerified(user, dashboard);
  // If we got here, the user is VERIFIED. (Real escrow funding arrives in Phase 7.)
  return { ok: true, message: "KYC passed — escrow funding would proceed (Phase 7)." };
}

// ---------------------------------------------------------------------------
// Password reset (AUTH-05 / AUTH-06)
// ---------------------------------------------------------------------------
export async function forgotPasswordAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const identifier = str(formData, "identifier");
  if (!identifier) return { error: "Enter your phone or email." };
  const normalized = identifier.includes("@")
    ? identifier.toLowerCase()
    : identifier.replace(/[\s-]/g, "");
  const user = await platformDb.user.findFirst({
    where: { OR: [{ email: normalized }, { phone: normalized }] },
  });
  // Send only if found, but always return the same message (no account enumeration).
  if (user) await sendPasswordReset(user.id, { email: user.email, phone: user.phone });
  return {
    ok: true,
    message: "If that account exists, a reset link is on its way.",
  };
}

export async function resetPasswordAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const uid = str(formData, "uid");
  const token = str(formData, "token");
  const password = str(formData, "password");
  const confirm = str(formData, "confirm");
  if (password.length < 8)
    return { error: "Password must be at least 8 characters." };
  if (password !== confirm) return { error: "Passwords don't match." };
  if (!uid || !token) return { error: "This reset link is invalid." };

  const ok = await consumePasswordReset(uid, token);
  if (!ok) return { error: "This reset link is invalid or has expired." };

  await platformDb.user.update({
    where: { id: uid },
    data: { passwordHash: await hashPassword(password) },
  });
  redirect("/login");
}

// ---------------------------------------------------------------------------
// Dev-only quick login (skips OTP/password to save time in later phases)
// ---------------------------------------------------------------------------
export async function devLoginAction(email: string): Promise<void> {
  if (process.env.NODE_ENV === "production")
    throw new Error("Dev login is disabled in production.");
  const user = await platformDb.user.findUnique({ where: { email } });
  if (!user) throw new Error(`Seed user ${email} not found — run npm run db:seed.`);
  await createSession({ sub: user.id, role: user.role });
  redirect(user.role === "WORKER" ? "/dashboard/worker" : "/dashboard/client");
}
