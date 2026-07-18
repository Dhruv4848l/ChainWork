"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui";
import { completeWorkerOnboardingAction, type FormState } from "./actions";

/*
  AUTH-07 — worker profile setup. Captures the fields the worker profile displays:
  headline, location, experience, skills (multi-select from the taxonomy),
  languages, and availability. Skills are submitted as repeated `skills` inputs.
*/
type Skill = { id: string; name: string; category: string };

const AVAILABILITY = ["Available Now", "Available This Week", "Flexible"];

export function WorkerOnboardingForm({ skills }: { skills: Skill[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [availability, setAvailability] = useState(AVAILABILITY[1]);
  const [state, formAction, pending] = useActionState(
    completeWorkerOnboardingAction,
    {} as FormState
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div className="w-full max-w-xl rounded-2xl border border-line bg-card p-9">
      <h1 className="font-display text-3xl text-ink">Set up your worker profile</h1>
      <p className="mb-6 mt-1 text-sm text-ink2">
        This is what clients see when you apply. You can edit it all later.
      </p>

      <form action={formAction} className="flex flex-col gap-5">
        <input type="hidden" name="availability" value={availability} />
        {[...selected].map((id) => (
          <input key={id} type="hidden" name="skills" value={id} />
        ))}

        <LabeledInput name="headline" label="Headline" placeholder="e.g. Licensed electrician · 8 yrs" />
        <div className="grid grid-cols-2 gap-4">
          <LabeledInput name="location" label="Location" placeholder="City / area" />
          <LabeledInput name="experienceYears" label="Years of experience" type="number" placeholder="0" />
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-ink2">Your skills</p>
          <div className="flex flex-wrap gap-2">
            {skills.map((s) => {
              const on = selected.has(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggle(s.id)}
                  className={`rounded-full border px-4 py-2 text-[13px] font-medium transition-colors ${
                    on
                      ? "border-bronze bg-bronze/10 text-bronze"
                      : "border-line-strong text-ink2 hover:border-bronze"
                  }`}
                >
                  {s.name}
                </button>
              );
            })}
          </div>
        </div>

        <LabeledInput
          name="languages"
          label="Languages (comma-separated)"
          placeholder="Hindi, English, Kannada"
        />

        <div>
          <p className="mb-2 text-xs font-medium text-ink2">Availability</p>
          <div className="flex gap-2.5">
            {AVAILABILITY.map((a) => {
              const on = availability === a;
              return (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAvailability(a)}
                  className={`flex-1 rounded-lg border px-3 py-3 text-[13px] font-semibold transition-colors ${
                    on
                      ? "border-emerald bg-emerald/10 text-emerald"
                      : "border-line-strong text-ink2 hover:border-bronze"
                  }`}
                >
                  {a}
                </button>
              );
            })}
          </div>
        </div>

        {state.error && (
          <p className="rounded-lg border border-ember/40 bg-ember/10 px-3 py-2 text-sm text-ember">
            {state.error}
          </p>
        )}

        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving…" : "Finish — Continue"}
        </Button>
      </form>
    </div>
  );
}

function LabeledInput({
  label,
  name,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; name: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-ink2">{label}</span>
      <input
        name={name}
        {...props}
        className="w-full rounded-lg border border-line-strong bg-bg px-4 py-3 text-[15px] text-ink placeholder:text-ink3 focus:border-bronze focus:outline-none focus:ring-2 focus:ring-bronze"
      />
    </label>
  );
}
