"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui";
import {
  forgotPasswordAction,
  resetPasswordAction,
  type FormState,
} from "./actions";

const inputCls =
  "w-full rounded-lg border border-line-strong bg-bg px-4 py-3.5 text-[15px] text-ink placeholder:text-ink3 focus:border-bronze focus:outline-none focus:ring-2 focus:ring-bronze";

/* AUTH-05 — request a reset link. */
export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(forgotPasswordAction, {} as FormState);
  return (
    <div className="w-full max-w-md rounded-2xl border border-line bg-card p-9">
      <h1 className="font-display text-2xl text-ink">Forgot password</h1>
      <p className="mb-5 mt-1 text-sm text-ink2">
        Enter your phone or email — we&apos;ll send a reset link.
      </p>
      <form action={action} className="flex flex-col gap-3">
        <input name="identifier" placeholder="Phone or email" className={inputCls} />
        {state.error && <Msg tone="error">{state.error}</Msg>}
        {state.ok && state.message && <Msg tone="ok">{state.message}</Msg>}
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Sending…" : "Send reset link"}
        </Button>
      </form>
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
