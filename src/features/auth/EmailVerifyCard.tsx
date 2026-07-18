"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { resendEmailAction, continueToOnboardingAction } from "./actions";

/*
  AUTH-04 — email verification prompt. Email is NOT required to browse or to reach
  onboarding; the user can continue and verify later (it IS required before posting
  or applying, enforced elsewhere). The mock verify link is printed to the server
  console by sendEmailVerification.
*/
export function EmailVerifyCard({
  emailHint,
  hasRealEmail,
}: {
  emailHint: string;
  hasRealEmail: boolean;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function resend() {
    startTransition(async () => {
      const res = await resendEmailAction();
      setMsg(res.error ?? res.message ?? null);
    });
  }
  function proceed() {
    startTransition(() => continueToOnboardingAction());
  }

  return (
    <div className="w-full max-w-md rounded-2xl border border-line bg-card p-9 text-center">
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-bronze/40 text-2xl text-bronze">
        ✉
      </div>
      <h1 className="font-display text-3xl text-ink">Check your email</h1>
      <p className="mb-6 mt-2 text-sm leading-relaxed text-ink2">
        {hasRealEmail ? (
          <>
            We sent a verification link to {emailHint}. You can browse without it —
            you&apos;ll need it before posting or applying.
          </>
        ) : (
          <>
            You signed up with just a phone number. You can add and verify an email
            later in Settings — it&apos;s required before posting or applying.
          </>
        )}
      </p>

      {hasRealEmail && (
        <Button
          variant="secondary"
          onClick={resend}
          disabled={pending}
          className="mb-3 w-full"
        >
          Resend link
        </Button>
      )}
      <Button variant="primary" onClick={proceed} disabled={pending} className="w-full">
        Continue to profile setup
      </Button>
      {msg && <p className="mt-3 text-xs text-ink3">{msg}</p>}
    </div>
  );
}
