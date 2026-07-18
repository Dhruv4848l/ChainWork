"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { adminLoginAction, type AdminActionState } from "./actions";

/*
  AUTH-11 admin login. Restricted access — email + password + mandatory 2FA, no
  signup. Visually and functionally distinct from the consumer auth.
*/
const inputCls =
  "w-full rounded-[10px] border border-line-strong bg-bg px-4 py-3.5 text-[15px] text-ink placeholder:text-ink3 focus:border-bronze focus:outline-none focus:ring-2 focus:ring-bronze";

export function AdminLoginForm() {
  const [state, action, pending] = useActionState(adminLoginAction, {} as AdminActionState);
  return (
    <div className="w-full max-w-sm rounded-2xl border border-line-strong bg-card p-10">
      <div className="mb-1.5 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-ink3">
        ChainWork Operations
      </div>
      <h1 className="mb-7 text-center text-[22px] font-semibold text-ink">Restricted Access</h1>
      <form action={action} className="flex flex-col gap-3">
        <input name="email" type="email" placeholder="Work email" autoComplete="username" className={inputCls} />
        <input name="password" type="password" placeholder="Password" autoComplete="current-password" className={inputCls} />
        <input name="code" inputMode="numeric" placeholder="2FA code (required)" className={inputCls} />
        {state.error && (
          <p className="rounded-lg border border-ember/40 bg-ember/10 px-3 py-2 text-sm text-ember">{state.error}</p>
        )}
        <Button type="submit" variant="primary" disabled={pending} className="mt-1.5">
          {pending ? "Verifying…" : "Sign In"}
        </Button>
      </form>
      <p className="mt-5 text-center text-xs leading-relaxed text-ink3">
        Accounts are provisioned internally. There is no signup. This console runs on a separate
        system and database.
      </p>
    </div>
  );
}
