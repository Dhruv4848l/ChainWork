"use client";

import { useActionState, useTransition } from "react";
import { Button } from "@/components/ui";
import {
  fundEscrowTestAction,
  logoutAction,
  type FormState,
} from "./actions";

/*
  Small client controls for the Phase-2 placeholder dashboards:
  - FundDemoButton exercises the KYC gate. If the user isn't VERIFIED the server
    action redirects to the KYC soft-block; if they are, it returns a success note.
  - LogoutButton clears the session.
  (The real dashboards are built in Phases 4–5.)
*/
export function FundDemoButton() {
  const [state, formAction, pending] = useActionState(
    fundEscrowTestAction,
    {} as FormState
  );
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <Button type="submit" variant="success" disabled={pending}>
        {pending ? "Checking…" : "Fund escrow (test)"}
      </Button>
      {state.ok && state.message && (
        <p className="rounded-lg border border-emerald/40 bg-emerald/10 px-3 py-2 text-sm text-emerald">
          {state.message}
        </p>
      )}
    </form>
  );
}

export function LogoutButton() {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      disabled={pending}
      onClick={() => start(() => logoutAction())}
    >
      Log out
    </Button>
  );
}
