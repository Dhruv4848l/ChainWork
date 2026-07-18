"use client";

import { useState } from "react";
import { Button, Card } from "@/components/ui";

/*
  CL-12 Settings with tabs. Clients can serve on juries too, under the same rules —
  but the Apply button stays disabled until eligibility is met (provisioning is
  admin-side, Phase 11).
*/
const TABS = ["Account", "Business & Billing", "Notifications", "Jury Duty", "Danger Zone"];

export function ClientSettingsTabs({
  account,
  isBusiness,
  companyName,
}: {
  account: { email: string; phone: string; kycTier: string; emailVerified: boolean };
  isBusiness: boolean;
  companyName?: string | null;
}) {
  const [tab, setTab] = useState("Account");

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

      {tab === "Business & Billing" && (
        <Card className="p-6 text-[13.5px] leading-relaxed text-ink2">
          {isBusiness
            ? `Registered as ${companyName ?? "a business"}. GST invoices are issued per released phase. Billing method and registration document are managed here (wired with the wallet layer in Phase 9).`
            : "You're registered as an individual. Switch to a business account to add a company name, registration document, and GST invoicing."}
        </Card>
      )}

      {tab === "Notifications" && (
        <Card className="p-6 text-[13.5px] leading-relaxed text-ink2">
          Choose how you hear about applicants, escrow events, deliveries, and disputes — SMS, push,
          or email. Payment reminders are capped per verification window.
        </Card>
      )}

      {tab === "Jury Duty" && (
        <Card className="p-6">
          <h3 className="mb-2 text-[17px] font-semibold text-ink">Jury Duty</h3>
          <p className="mb-5 text-[13.5px] font-light leading-relaxed text-ink2">
            Clients can serve on dispute panels too — the same eligibility rules as workers apply.
          </p>
          <div className="mb-5 flex flex-col gap-2.5">
            <Check ok={account.kycTier === "VERIFIED" || account.kycTier === "TRUSTED"} label="Verified+ KYC tier" />
            <Check ok={false} label="Rating ≥ 4.5 from counterparties" />
            <Check ok label="No active disputes" />
            <Check ok={false} label="Staked deposit (set at approval)" />
          </div>
          <button disabled className="cursor-not-allowed rounded-full border border-line-strong px-7 py-3 text-[13.5px] font-semibold text-ink3 opacity-60">
            Apply for Jury Duty — requirements left
          </button>
        </Card>
      )}

      {tab === "Danger Zone" && (
        <Card className="p-6">
          <p className="mb-4 text-[13.5px] text-ink2">Deactivating closes your account. Active hires and funded escrow must be resolved first.</p>
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
      <span className={`flex h-5 w-5 items-center justify-center rounded-full border text-[11px] ${ok ? "border-emerald/40 bg-emerald/10 text-emerald" : "border-line-strong text-ink3"}`}>
        {ok ? "✓" : "○"}
      </span>
      <span className={ok ? "text-ink" : "text-ink3"}>{label}</span>
    </div>
  );
}
