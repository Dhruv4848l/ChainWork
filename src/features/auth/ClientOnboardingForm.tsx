"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { completeClientOnboardingAction, type FormState } from "./actions";

/*
  AUTH-08 — client profile setup. Three quick fields, then on to the dashboard.
*/
export function ClientOnboardingForm({ isBusiness }: { isBusiness: boolean }) {
  const [state, formAction, pending] = useActionState(
    completeClientOnboardingAction,
    {} as FormState
  );

  return (
    <div className="w-full max-w-lg rounded-2xl border border-line bg-card p-9">
      <h1 className="font-display text-3xl text-ink">Set up your client profile</h1>
      <p className="mb-6 mt-1 text-sm text-ink2">
        Three quick details, then you can post your first job.
      </p>

      <form action={formAction} className="flex flex-col gap-4">
        <input
          name="displayName"
          placeholder={isBusiness ? "Company name" : "Display name"}
          className="w-full rounded-lg border border-line-strong bg-bg px-4 py-3.5 text-[15px] text-ink placeholder:text-ink3 focus:border-bronze focus:outline-none focus:ring-2 focus:ring-bronze"
        />
        <input
          name="address"
          placeholder="Address (area + city — never shown publicly)"
          className="w-full rounded-lg border border-line-strong bg-bg px-4 py-3.5 text-[15px] text-ink placeholder:text-ink3 focus:border-bronze focus:outline-none focus:ring-2 focus:ring-bronze"
        />
        {isBusiness && (
          <div className="rounded-lg border border-dashed border-line-strong px-6 py-6 text-center text-sm text-ink2">
            Business accounts: upload registration document
            <span className="mt-1 block text-xs text-ink3">
              (mock upload — wire a real store in a later phase)
            </span>
          </div>
        )}

        {state.error && (
          <p className="rounded-lg border border-ember/40 bg-ember/10 px-3 py-2 text-sm text-ember">
            {state.error}
          </p>
        )}

        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving…" : "Finish — Go to Dashboard"}
        </Button>
      </form>
    </div>
  );
}
