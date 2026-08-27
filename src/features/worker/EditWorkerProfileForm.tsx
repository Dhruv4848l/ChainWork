"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui";
import { saveWorkerProfileAction, type ActionState } from "./actions";

/*
  WK-03 Edit Profile. Edits every field the WK-02 profile displays: name, headline,
  bio, location, experience, availability, languages, and skills with a cyclable
  proficiency level. Skills submit as repeated `skill` = "<skillId>:<PROFICIENCY>".
*/
const LEVELS = ["BEGINNER", "INTERMEDIATE", "SKILLED", "EXPERT"] as const;
const LEVEL_LABEL: Record<string, string> = {
  BEGINNER: "Beginner",
  INTERMEDIATE: "Intermediate",
  SKILLED: "Skilled",
  EXPERT: "Expert",
};
const AVAIL = ["Available Now", "Available This Week", "Flexible"];

type SkillRow = { skillId: string; name: string; proficiency: string };

export function EditWorkerProfileForm({
  initial,
  currentSkills,
  allSkills,
}: {
  initial: {
    name: string;
    headline: string;
    bio: string;
    location: string;
    experienceYears: number;
    rateHourly: string;
    rateWeekly: string;
    availability: string;
    languages: string;
  };
  currentSkills: SkillRow[];
  allSkills: { id: string; name: string }[];
}) {
  const [skills, setSkills] = useState<SkillRow[]>(currentSkills);
  const [availability, setAvailability] = useState(initial.availability || AVAIL[1]);
  const [state, formAction, pending] = useActionState(saveWorkerProfileAction, {} as ActionState);

  const available = allSkills.filter((s) => !skills.some((x) => x.skillId === s.id));

  function cycle(skillId: string) {
    setSkills((prev) =>
      prev.map((s) =>
        s.skillId === skillId
          ? { ...s, proficiency: LEVELS[(LEVELS.indexOf(s.proficiency as never) + 1) % LEVELS.length] }
          : s
      )
    );
  }
  function remove(skillId: string) {
    setSkills((prev) => prev.filter((s) => s.skillId !== skillId));
  }
  function add(id: string) {
    const s = allSkills.find((x) => x.id === id);
    if (s) setSkills((prev) => [...prev, { skillId: s.id, name: s.name, proficiency: "SKILLED" }]);
  }

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-4">
      <input type="hidden" name="availability" value={availability} />
      {skills.map((s) => (
        <input key={s.skillId} type="hidden" name="skill" value={`${s.skillId}:${s.proficiency}`} />
      ))}

      <Field label="Full name" name="name" defaultValue={initial.name} />
      <Field label="Headline" name="headline" defaultValue={initial.headline} placeholder="e.g. Licensed electrician · 8 yrs" />
      <div>
        <FieldLabel>Bio</FieldLabel>
        <textarea
          name="bio"
          defaultValue={initial.bio}
          rows={3}
          placeholder="What you do and what clients can expect"
          className={fieldCls + " resize-y"}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Location" name="location" defaultValue={initial.location} />
        <Field label="Years of experience" name="experienceYears" type="number" defaultValue={String(initial.experienceYears)} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Charge per hour (₹)" name="rateHourly" type="number" defaultValue={initial.rateHourly} placeholder="e.g. 700" />
        <Field label="Charge per week (₹)" name="rateWeekly" type="number" defaultValue={initial.rateWeekly} placeholder="e.g. 26000" />
      </div>
      <Field label="Languages (comma-separated)" name="languages" defaultValue={initial.languages} />

      {/* Skills */}
      <div>
        <FieldLabel>Skills &amp; proficiency — tap a chip to cycle its level</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {skills.map((s) => (
            <span
              key={s.skillId}
              className="inline-flex items-center gap-2 rounded-full border border-bronze/30 bg-bronze/[0.08] px-3.5 py-2 text-[12.5px] font-medium text-ink"
            >
              <button type="button" onClick={() => cycle(s.skillId)} className="flex items-center gap-2">
                {s.name}
                <span className="text-[10px] font-bold uppercase tracking-wide text-bronze">
                  {LEVEL_LABEL[s.proficiency]}
                </span>
              </button>
              <button type="button" onClick={() => remove(s.skillId)} className="text-ink3 hover:text-ember">
                ✕
              </button>
            </span>
          ))}
          {available.length > 0 && (
            <select
              onChange={(e) => {
                if (e.target.value) add(e.target.value);
                e.target.value = "";
              }}
              defaultValue=""
              className="rounded-full border border-dashed border-line-strong bg-transparent px-4 py-2 text-[12.5px] text-ink3 focus:border-bronze focus:outline-none"
            >
              <option value="">+ Add skill</option>
              {available.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Availability */}
      <div>
        <FieldLabel>Availability</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {AVAIL.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAvailability(a)}
              className={`rounded-full border px-4 py-2.5 text-[12.5px] font-semibold transition-colors ${
                availability === a
                  ? "border-bronze bg-bronze/10 text-bronze"
                  : "border-line-strong text-ink2 hover:border-bronze"
              }`}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      {state.error && (
        <p className="rounded-lg border border-ember/40 bg-ember/10 px-3 py-2 text-sm text-ember">{state.error}</p>
      )}

      <div className="mt-2 flex justify-end gap-3">
        <a href="/dashboard/worker/profile">
          <Button type="button" variant="secondary">Cancel</Button>
        </a>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving…" : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}

const fieldCls =
  "w-full rounded-[10px] border border-line-strong bg-bg px-4 py-3 text-sm text-ink placeholder:text-ink3 focus:border-bronze focus:outline-none focus:ring-2 focus:ring-bronze";

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-ink3">
      {children}
    </label>
  );
}

function Field({
  label,
  name,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; name: string }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <input name={name} {...props} className={fieldCls} />
    </div>
  );
}
