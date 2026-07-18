"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { verifyOtpAction, resendOtpAction, type FormState } from "./actions";

/*
  AUTH-03 — 6-box phone OTP entry with auto-advance and a resend countdown that
  backs off (30s → 60s → 120s). The code (a mock) is printed to the SERVER console
  by sendPhoneOtp — look for the [MOCK SMS] line.
*/
const BACKOFFS = [30, 60, 120];

export function OtpForm({ phoneHint }: { phoneHint: string }) {
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const [state, formAction, pending] = useActionState(verifyOtpAction, {} as FormState);

  const [resendIn, setResendIn] = useState(30);
  const [resendCount, setResendCount] = useState(0);
  const [resendMsg, setResendMsg] = useState<string | null>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  function setDigit(i: number, v: string) {
    const clean = v.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[i] = clean;
    setDigits(next);
    if (clean && i < 5) refs.current[i + 1]?.focus();
  }

  function onKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[i] && i > 0) refs.current[i - 1]?.focus();
  }

  async function onResend() {
    const res = await resendOtpAction();
    setResendMsg(res.error ?? res.message ?? null);
    const nextWait = BACKOFFS[Math.min(resendCount, BACKOFFS.length - 1)];
    setResendCount((c) => c + 1);
    setResendIn(nextWait);
  }

  const code = digits.join("");

  return (
    <div className="w-full max-w-md rounded-2xl border border-line bg-card p-9 text-center">
      <h1 className="font-display text-3xl text-ink">Verify your phone</h1>
      <p className="mb-7 mt-1 text-sm text-ink2">
        We sent a 6-digit code to {phoneHint}
      </p>

      <form action={formAction}>
        <input type="hidden" name="code" value={code} />
        <div className="mb-6 flex justify-center gap-2.5">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => {
                refs.current[i] = el;
              }}
              inputMode="numeric"
              maxLength={1}
              value={d}
              onChange={(e) => setDigit(i, e.target.value)}
              onKeyDown={(e) => onKeyDown(i, e)}
              className="h-14 w-12 rounded-lg border border-line-strong bg-bg text-center text-2xl font-semibold text-ink focus:border-bronze focus:outline-none focus:ring-2 focus:ring-bronze"
            />
          ))}
        </div>

        {state.error && (
          <p className="mb-4 rounded-lg border border-ember/40 bg-ember/10 px-3 py-2 text-sm text-ember">
            {state.error}
          </p>
        )}

        <Button
          type="submit"
          variant="primary"
          disabled={pending || code.length !== 6}
          className="w-full"
        >
          {pending ? "Verifying…" : "Verify"}
        </Button>
      </form>

      <div className="mt-5 text-sm text-ink3">
        {resendIn > 0 ? (
          <span>Resend code in {resendIn}s</span>
        ) : (
          <button onClick={onResend} className="text-bronze hover:underline">
            Resend code
          </button>
        )}
      </div>
      {resendMsg && <p className="mt-2 text-xs text-ink3">{resendMsg}</p>}
      <p className="mt-2 text-xs text-ink3">
        Didn&apos;t get the SMS twice? Get a voice call instead (coming soon).
      </p>
    </div>
  );
}
