import "server-only";
import { redirect } from "next/navigation";
import type { Role, KycTier } from "@/generated/platform";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/currentUser";

/*
  Server-side guards. Call these at the top of protected server components,
  server actions, and route handlers. They redirect (never silently pass) when
  the requirement isn't met.
*/

/** Require any logged-in user. Redirects to /login (preserving where they wanted to go). */
export async function requireUser(returnTo?: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`);
  }
  return user;
}

/** Require a specific role. Sends the wrong role to their own dashboard. */
export async function requireRole(role: Role, returnTo?: string): Promise<CurrentUser> {
  const user = await requireUser(returnTo);
  if (user.role !== role) {
    redirect(user.role === "WORKER" ? "/dashboard/worker" : "/dashboard/client");
  }
  return user;
}

// ---------------------------------------------------------------------------
// The KYC gate — the single chokepoint that blocks money movement until a user
// is at least VERIFIED. Every money-handling action (funding escrow, receiving a
// payout, locking a stake) must call assertKycVerified() BEFORE doing anything.
// Reused by Phases 5, 7, 9. See CLAUDE.md.
// ---------------------------------------------------------------------------

const KYC_ORDER: Record<KycTier, number> = {
  UNVERIFIED: 0,
  BASIC: 1,
  VERIFIED: 2,
  TRUSTED: 3,
};

/** True if the user's tier is at least VERIFIED. */
export function isKycVerified(user: { kycTier: KycTier }): boolean {
  return KYC_ORDER[user.kycTier] >= KYC_ORDER.VERIFIED;
}

/**
 * KYC gate for money movement. If the user isn't VERIFIED, redirect to the KYC
 * soft-block screen — preserving the in-progress action via `returnTo` so they
 * land right back where they were after verifying ("your draft is saved").
 */
export async function assertKycVerified(
  user: { kycTier: KycTier },
  returnTo: string
): Promise<void> {
  if (!isKycVerified(user)) {
    redirect(`/kyc?reason=money&returnTo=${encodeURIComponent(returnTo)}`);
  }
}
