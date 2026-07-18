"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui";
import { applyToJobAction, type ActionState } from "./actions";

/*
  WK-05 apply flow. Real: creates a JobApplication (not a money action) so the
  post→apply→hire loop works end to end (verified in Phase 5).
*/
export function ApplyForm({
  jobId,
  roles,
}: {
  jobId: string;
  roles: { id: string; roleName: string; rate: number }[];
}) {
  const [open, setOpen] = useState(false);
  const [roleId, setRoleId] = useState(roles[0]?.id ?? "");
  const [state, formAction, pending] = useActionState(applyToJobAction, {} as ActionState);
  const role = roles.find((r) => r.id === roleId) ?? roles[0];

  if (!open) {
    return (
      <div className="flex gap-3">
        <Button variant="primary" onClick={() => setOpen(true)}>Apply Now</Button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-bronze/35 bg-card2 p-6">
      <h3 className="mb-4 text-[17px] font-semibold text-ink">Apply to this job</h3>
      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="jobId" value={jobId} />
        <input type="hidden" name="roleLineItemId" value={roleId} />

        {roles.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {roles.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRoleId(r.id)}
                className={`rounded-full border px-4 py-2 text-[12.5px] font-medium ${
                  roleId === r.id ? "border-bronze bg-bronze/10 text-bronze" : "border-line-strong text-ink2"
                }`}
              >
                {r.roleName}
              </button>
            ))}
          </div>
        )}

        <textarea
          name="coverNote"
          rows={3}
          placeholder="Cover note — why you're a fit (2–3 lines is plenty)"
          className="rounded-[10px] border border-line-strong bg-bg px-4 py-3 text-sm text-ink placeholder:text-ink3 focus:border-bronze focus:outline-none focus:ring-2 focus:ring-bronze"
        />
        <input
          name="proposedRate"
          defaultValue={role ? `₹${role.rate}` : ""}
          className="rounded-[10px] border border-line-strong bg-bg px-4 py-3 text-sm text-ink focus:border-bronze focus:outline-none focus:ring-2 focus:ring-bronze"
        />
        <span className="text-xs text-ink3">Pre-filled from the job&apos;s rate — negotiable.</span>

        {state.error && (
          <p className="rounded-lg border border-ember/40 bg-ember/10 px-3 py-2 text-sm text-ember">{state.error}</p>
        )}

        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Submitting…" : "Submit Application"}
          </Button>
        </div>
      </form>
    </div>
  );
}
