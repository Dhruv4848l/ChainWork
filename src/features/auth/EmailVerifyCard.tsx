"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { resendEmailAction, continueToOnboardingAction } from "./actions";

/*
  AUTH-04 — email verification prompt. Email is NOT required to browse or to reach
  onboarding; the user can continue and verify later (it IS required before posting
  or applying, enforced elsewhere).

  The card POLLS while waiting: the emailed link is usually opened in another tab
  (or on the phone), so this screen refreshes itself every few seconds and, the
  moment `emailVerified` flips true, shows success and auto-advances to onboarding.
*/
export function EmailVerifyCard({
  emailHint,
  hasRealEmail,
  emailVerified,
}: {
  emailHint: string;
  hasRealEmail: boolean;
  emailVerified: boolean;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const advanced = useRef(false);

  // While unverified, re-fetch the server component every 4s (pause when hidden)
  // so a link clicked in another tab is noticed here.
  useEffect(() => {
    if (emailVerified) return;
    const id = setInterval(() => {
      if (!document.hidden) router.refresh();
    }, 4000);
    return () => clearInterval(id);
  }, [emailVerified, router]);

  // Verified → brief success beat, then continue to profile setup automatically.
  useEffect(() => {
    if (!emailVerified || advanced.current) return;
    advanced.current = true;
    const t = setTimeout(() => startTransition(() => continueToOnboardingAction()), 1200);
    return () => clearTimeout(t);
  }, [emailVerified]);

  function resend() {
    startTransition(async () => {
      const res = await resendEmailAction();
      setMsg(res.error ?? res.message ?? null);
    });
  }
  function proceed() {
    startTransition(() => continueToOnboardingAction());
  }

  if (emailVerified) {
    return (
      <div className="w-full max-w-md rounded-2xl border border-line bg-card p-9 text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-emerald/50 text-2xl text-emerald">
          ✓
        </div>
        <h1 className="font-display text-3xl text-ink">Email verified</h1>
        <p className="mb-6 mt-2 text-sm leading-relaxed text-ink2">
          Taking you to profile setup…
        </p>
        <Button variant="primary" onClick={proceed} disabled={pending} className="w-full">
          Continue now
        </Button>
      </div>
    );
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
            We sent a verification link to {emailHint}. This page moves on
            automatically once you click it. You can also continue without it —
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
