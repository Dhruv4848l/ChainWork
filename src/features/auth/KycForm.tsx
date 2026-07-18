"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { submitKycAction, type FormState } from "./actions";
import type { KycTier } from "@/generated/platform";

/*
  AUTH-09 — identity verification. Shows the tier progress bar
  (Unverified → Basic → Verified → Trusted) and a mock document checklist. Submit
  auto-approves to VERIFIED (mock) and returns the user to whatever money action
  they were mid-way through (returnTo), matching "your draft is saved".
*/
const TIERS: KycTier[] = ["UNVERIFIED", "BASIC", "VERIFIED", "TRUSTED"];
const TIER_LABEL: Record<KycTier, string> = {
  UNVERIFIED: "Unverified",
  BASIC: "Basic",
  VERIFIED: "Verified",
  TRUSTED: "Trusted",
};
const DOCS = [
  { name: "Government ID", hint: "Aadhaar / PAN / passport" },
  { name: "Live selfie", hint: "Liveness check" },
  { name: "Address proof", hint: "Optional — unlocks Trusted tier" },
];

export function KycForm({
  currentTier,
  reason,
  returnTo,
}: {
  currentTier: KycTier;
  reason?: string;
  returnTo?: string;
}) {
  const [state, formAction, pending] = useActionState(submitKycAction, {} as FormState);
  const currentIndex = TIERS.indexOf(currentTier);
  const softBlock = reason === "money";

  return (
    <div className="w-full max-w-xl rounded-2xl border border-line bg-card p-9">
      <h1 className="font-display text-3xl text-ink">Verify your identity</h1>
      <p className="mb-7 mt-2 text-sm leading-relaxed text-ink2">
        {softBlock
          ? "One more step before this job's pay is locked in — verify your identity. Takes about 3 minutes. Your progress is saved."
          : "Verify your identity to unlock funding escrow and receiving payouts. Takes about 3 minutes."}
      </p>

      {/* Tier progress */}
      <div className="mb-8 flex items-center">
        {TIERS.map((t, i) => {
          const reached = i <= currentIndex;
          const isTarget = t === "VERIFIED";
          return (
            <div key={t} className="flex flex-1 flex-col items-center gap-2">
              <div className="relative flex w-full items-center justify-center">
                {i > 0 && (
                  <span
                    className={`absolute left-0 top-1/2 h-0.5 w-1/2 -translate-y-1/2 ${
                      reached ? "bg-bronze" : "bg-line-strong"
                    }`}
                  />
                )}
                {i < TIERS.length - 1 && (
                  <span
                    className={`absolute right-0 top-1/2 h-0.5 w-1/2 -translate-y-1/2 ${
                      i < currentIndex ? "bg-bronze" : "bg-line-strong"
                    }`}
                  />
                )}
                <span
                  className={`z-10 h-3.5 w-3.5 rounded-full border-2 ${
                    reached
                      ? "border-bronze bg-bronze"
                      : "border-line-strong bg-card"
                  }`}
                />
              </div>
              <span
                className={`text-[10px] font-semibold uppercase tracking-wider ${
                  reached ? "text-bronze" : isTarget ? "text-amber" : "text-ink3"
                }`}
              >
                {TIER_LABEL[t]}
              </span>
            </div>
          );
        })}
      </div>

      {currentIndex >= TIERS.indexOf("VERIFIED") ? (
        <div className="rounded-lg border border-emerald/40 bg-emerald/10 px-4 py-4 text-sm text-emerald">
          You&apos;re already {TIER_LABEL[currentTier]} — money movement is unlocked.
        </div>
      ) : (
        <form action={formAction} className="flex flex-col gap-3">
          {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
          {DOCS.map((d) => (
            <div
              key={d.name}
              className="flex items-center justify-between rounded-lg border border-line bg-bg px-5 py-4"
            >
              <div>
                <div className="text-[15px] font-medium text-ink">{d.name}</div>
                <div className="text-xs text-ink3">{d.hint}</div>
              </div>
              <label className="cursor-pointer rounded-full border border-line-strong px-4 py-1.5 text-xs font-semibold text-ink2 hover:border-bronze">
                Upload
                <input type="file" className="hidden" />
              </label>
            </div>
          ))}

          {state.error && (
            <p className="rounded-lg border border-ember/40 bg-ember/10 px-3 py-2 text-sm text-ember">
              {state.error}
            </p>
          )}

          <Button type="submit" variant="primary" disabled={pending} className="mt-2">
            {pending ? "Submitting…" : "Submit for Review"}
          </Button>
          <p className="text-center text-xs leading-relaxed text-ink3">
            Mock verification — approves instantly for this build. A real KYC/AML
            provider plugs in here before production.
          </p>
        </form>
      )}
    </div>
  );
}
