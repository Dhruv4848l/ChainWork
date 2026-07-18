import Link from "next/link";
import { Card, StatusBadge, ThemeToggle } from "@/components/ui";
import { FundDemoButton, LogoutButton } from "./DashboardDemo";
import type { CurrentUser } from "@/lib/auth/currentUser";

/*
  Temporary authed landing for Phase 2. Confirms the session works, shows the
  user's role + KYC status, and exercises the KYC gate. Replaced by the real
  Worker (Phase 4) and Client (Phase 5) dashboards.
*/
const KYC_TONE: Record<string, "draft" | "warning" | "success"> = {
  UNVERIFIED: "draft",
  BASIC: "warning",
  VERIFIED: "success",
  TRUSTED: "success",
};

export function DashboardPlaceholder({ user }: { user: CurrentUser }) {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <div className="mb-8 flex items-center justify-between">
        <span className="font-display text-lg tracking-[0.3em] text-bronze">
          CHAINWORK
        </span>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <LogoutButton />
        </div>
      </div>

      <h1 className="font-display text-4xl text-ink">Welcome, {user.name}</h1>
      <p className="mt-2 text-sm text-ink2">
        You&apos;re signed in as a{" "}
        <span className="font-semibold text-ink">
          {user.role === "WORKER" ? "Worker" : "Client"}
        </span>
        . This placeholder confirms auth works — the real dashboard arrives in{" "}
        {user.role === "WORKER" ? "Phase 4" : "Phase 5"}.
      </p>

      <Card className="mt-8 flex flex-col gap-4 p-6">
        <Row label="Name" value={user.name} />
        <Row label="Phone verified" value={user.phoneVerified ? "Yes" : "No"} />
        <Row label="Email verified" value={user.emailVerified ? "Yes" : "No"} />
        <div className="flex items-center justify-between">
          <span className="text-sm text-ink2">KYC tier</span>
          <StatusBadge tone={KYC_TONE[user.kycTier] ?? "draft"}>
            {user.kycTier}
          </StatusBadge>
        </div>
      </Card>

      <Card className="mt-6 flex flex-col gap-3 p-6">
        <h2 className="font-display text-xl text-ink">KYC gate demo</h2>
        <p className="text-sm text-ink2">
          Money movement is blocked until you&apos;re VERIFIED. Try it: if you&apos;re
          not verified, this bounces you to the KYC screen and brings you right back
          after.
        </p>
        <FundDemoButton />
        <Link href="/kyc" className="text-sm text-bronze hover:underline">
          Go to identity verification →
        </Link>
      </Card>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-ink2">{label}</span>
      <span className="text-sm font-medium text-ink">{value}</span>
    </div>
  );
}
