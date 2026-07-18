"use client";

import { useState, useTransition } from "react";
import { Button, Card } from "@/components/ui";

/*
  WK-16 Settings with tabs, including the Jury Duty opt-in. Eligibility is checked
  against the worker's real profile data. "Apply for Jury Duty" is a stub — the
  actual juror provisioning happens admin-side (ADM-13) in Phase 11.
*/
const TABS = ["Account", "Notifications", "Payout Methods", "Jury Duty", "Danger Zone"];

export function SettingsTabs({
  account,
  jury,
}: {
  account: { email: string; phone: string; kycTier: string; emailVerified: boolean };
  jury: { kycOk: boolean; ratingOk: boolean; jobsOk: boolean; rating: number; jobs: number };
}) {
  const [tab, setTab] = useState("Account");
  const [applied, setApplied] = useState(false);
  const [, start] = useTransition();

  return (
    <div className="max-w-3xl">
      <div className="mb-4.5 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full border px-5 py-2.5 text-xs font-semibold uppercase tracking-wide transition-colors ${
              tab === t ? "border-bronze bg-bronze/10 text-bronze" : "border-line-strong text-ink2 hover:border-bronze"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Account" && (
        <Card className="flex flex-col gap-3.5 p-6">
          {[
            ["Email", account.email, account.emailVerified ? "Verified" : "Verify"],
            ["Phone", account.phone, "Change"],
            ["KYC tier", account.kycTier, account.kycTier === "TRUSTED" ? "Max" : "Upgrade"],
            ["Password", "••••••••", "Change"],
          ].map(([k, v, action]) => (
            <div key={k} className="flex items-center justify-between border-b border-hair py-1.5 last:border-b-0">
              <span>
                <span className="block text-sm font-medium text-ink">{k}</span>
                <span className="block text-xs text-ink3">{v}</span>
              </span>
              <Button variant="secondary" size="sm">{action}</Button>
            </div>
          ))}
        </Card>
      )}

      {tab === "Jury Duty" && (
        <Card className="p-6">
          <h3 className="mb-2 text-[17px] font-semibold text-ink">Jury Duty</h3>
          <p className="mb-5 text-[13.5px] font-light leading-relaxed text-ink2">
            Verified members can serve on dispute panels — reviewing evidence and voting on
            outcomes. Jurors stake a small deposit per case and earn a fee for majority verdicts.
          </p>
          <div className="mb-5 flex flex-col gap-2.5">
            <Check ok={jury.kycOk} label="Verified+ KYC tier" />
            <Check ok={jury.ratingOk} label={`Rating ≥ 4.5 (you: ${jury.rating.toFixed(1)})`} />
            <Check ok={jury.jobsOk} label={`25+ completed jobs (you: ${jury.jobs})`} />
            <Check ok label="No active disputes" />
            <Check ok={false} label="Staked deposit (set at approval)" />
          </div>
          {applied ? (
            <p className="rounded-lg border border-emerald/40 bg-emerald/10 px-3 py-2 text-sm text-emerald">
              Application noted. Juror provisioning happens admin-side (ADM-13) in Phase 11.
            </p>
          ) : (
            <Button
              variant="primary"
              disabled={!(jury.kycOk && jury.ratingOk && jury.jobsOk)}
              onClick={() => start(() => setApplied(true))}
            >
              Apply for Jury Duty
            </Button>
          )}
          <p className="mt-4 text-xs leading-relaxed text-ink3">
            On approval you&apos;ll receive a separate Jury credential for the operations console —
            jury work runs on a separate, isolated system from your everyday account.
          </p>
        </Card>
      )}

      {(tab === "Notifications" || tab === "Payout Methods") && (
        <Card className="p-6 text-[13.5px] leading-relaxed text-ink2">
          {tab === "Notifications"
            ? "Choose how you hear about applications, escrow events, payouts, and jury assignments — SMS, push, or email. Payment reminders are capped at 2 per verification window."
            : "Withdrawals land in your bank account or UPI. Your ChainWork wallet holds funds as a stablecoin on-chain, shown to you in rupees. (Wired in Phase 9.)"}
        </Card>
      )}

      {tab === "Danger Zone" && (
        <Card className="p-6">
          <p className="mb-4 text-[13.5px] text-ink2">Deactivating hides your profile and stops new job matches. Active hires must be resolved first.</p>
          <button className="rounded-full border border-ember/50 px-6 py-3 text-[13px] font-semibold text-ember hover:bg-ember/[0.08]">
            Deactivate Account
          </button>
        </Card>
      )}
    </div>
  );
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-3 text-[13.5px]">
      <span
        className={`flex h-5 w-5 items-center justify-center rounded-full border text-[11px] ${
          ok ? "border-emerald/40 bg-emerald/10 text-emerald" : "border-line-strong text-ink3"
        }`}
      >
        {ok ? "✓" : "○"}
      </span>
      <span className={ok ? "text-ink" : "text-ink3"}>{label}</span>
    </div>
  );
}
