"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui";
import {
  forgotPasswordAction,
  resetPasswordWithOtpAction,
  resetPasswordAction,
  type FormState,
} from "./actions";

const inputCls =
  "w-full rounded-lg border border-line-strong bg-bg px-4 py-3.5 text-[15px] text-ink placeholder:text-ink3 focus:border-bronze focus:outline-none focus:ring-2 focus:ring-bronze";

/*
  AUTH-05 — OTP-based password reset, two steps on one screen:
    1) identifier + channel (SMS / Email) → a 6-digit code goes out
    2) code + new password → verified and updated in one submit
  The generic "if that account exists" messaging is deliberate (no enumeration).
*/
export function ForgotPasswordForm() {
  const [identifier, setIdentifier] = useState("");
  const [channel, setChannel] = useState<"sms" | "email">("sms");
  const [requestState, requestAction, requestPending] = useActionState(forgotPasswordAction, {} as FormState);
  const [resetState, resetAction, resetPending] = useActionState(resetPasswordWithOtpAction, {} as FormState);

  const codeSent = !!requestState.ok;
  const done = !!resetState.ok;

  if (done) {
    return (
      <div className="w-full max-w-md rounded-2xl border border-line bg-card p-9 text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-emerald/50 text-2xl text-emerald">✓</div>
        <h1 className="font-display text-2xl text-ink">Password updated</h1>
        <p className="mb-6 mt-2 text-sm text-ink2">{resetState.message}</p>
        <Link href="/login">
          <Button variant="primary" className="w-full">Log in</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md rounded-2xl border border-line bg-card p-9">
      <h1 className="font-display text-2xl text-ink">Forgot password</h1>

      {!codeSent ? (
        <>
          <p className="mb-5 mt-1 text-sm text-ink2">
            Tell us where to send a one-time 6-digit code.
          </p>
          <form action={requestAction} className="flex flex-col gap-3">
            <input
              name="identifier"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="Phone or email"
              className={inputCls}
            />
            <input type="hidden" name="channel" value={channel} />
            <div className="flex rounded-full border border-line bg-bg p-1">
              {(["sms", "email"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setChannel(c)}
                  className={`flex-1 rounded-full px-4 py-2 text-[12.5px] font-semibold transition-colors ${
                    channel === c ? "bg-bronze text-[#1a1512]" : "text-ink2 hover:text-ink"
                  }`}
                >
                  {c === "sms" ? "Text me (SMS)" : "Email me"}
                </button>
              ))}
            </div>
            {requestState.error && <Msg tone="error">{requestState.error}</Msg>}
            <Button type="submit" variant="primary" disabled={requestPending}>
              {requestPending ? "Sending…" : "Send code"}
            </Button>
          </form>
        </>
      ) : (
        <>
          <p className="mb-5 mt-1 text-sm text-ink2">
            {requestState.message} Enter it below with your new password.
          </p>
          <form action={resetAction} className="flex flex-col gap-3">
            <input type="hidden" name="identifier" value={identifier} />
            <input
              name="code"
              inputMode="numeric"
              maxLength={6}
              placeholder="6-digit code"
              className={`${inputCls} text-center text-xl font-semibold tracking-[0.5em]`}
            />
            <input name="password" type="password" placeholder="New password (min 8 characters)" className={inputCls} />
            <input name="confirm" type="password" placeholder="Confirm new password" className={inputCls} />
            {resetState.error && <Msg tone="error">{resetState.error}</Msg>}
            <Button type="submit" variant="primary" disabled={resetPending}>
              {resetPending ? "Updating…" : "Set new password"}
            </Button>
          </form>
          <div className="mt-4 flex items-center justify-between text-sm">
            <form action={requestAction}>
              <input type="hidden" name="identifier" value={identifier} />
              <input type="hidden" name="channel" value={channel} />
              <button type="submit" disabled={requestPending} className="text-bronze hover:underline disabled:text-ink3">
                Resend code
              </button>
            </form>
            <button
              onClick={() => window.location.reload()}
              className="text-ink3 hover:text-ink2"
            >
              Change method
            </button>
          </div>
        </>
      )}

      <div className="mt-5 text-center">
        <Link href="/login" className="text-sm text-bronze hover:underline">
          Back to login
        </Link>
      </div>
    </div>
  );
}

/* AUTH-06 — set a new password from a reset link. */
export function ResetPasswordForm({ uid, token }: { uid: string; token: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, {} as FormState);
  return (
    <div className="w-full max-w-md rounded-2xl border border-line bg-card p-9">
      <h1 className="font-display text-2xl text-ink">Set a new password</h1>
      <form action={action} className="mt-4 flex flex-col gap-3">
        <input type="hidden" name="uid" value={uid} />
        <input type="hidden" name="token" value={token} />
        <input name="password" type="password" placeholder="New password" className={inputCls} />
        <input name="confirm" type="password" placeholder="Confirm new password" className={inputCls} />
        {state.error && <Msg tone="error">{state.error}</Msg>}
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Resetting…" : "Reset password"}
        </Button>
        <p className="text-center text-xs text-ink3">
          Resetting signs you out of all other devices.
        </p>
      </form>
    </div>
  );
}

function Msg({ tone, children }: { tone: "error" | "ok"; children: React.ReactNode }) {
  const cls =
    tone === "error"
      ? "border-ember/40 bg-ember/10 text-ember"
      : "border-emerald/40 bg-emerald/10 text-emerald";
  return (
    <p className={`rounded-lg border px-3 py-2 text-sm ${cls}`}>{children}</p>
  );
}
