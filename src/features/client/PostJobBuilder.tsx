"use client";

import { useActionState, useMemo, useState } from "react";
import { Button } from "@/components/ui";
import { postJobAction, type ActionState } from "./actions";
import { formatInr } from "@/lib/format";

/*
  CL-03 Post a Job — a 5-step builder (basics → roles → logistics → funding →
  review). All state is kept client-side and submitted at the end; role line items
  serialize to a JSON hidden field. Publishing creates a real Job + JobRoleLineItem
  records (escrow funding is a separate, stubbed step). A published job appears
  immediately in the Worker's Find Jobs.
*/
type Category = { id: string; name: string; skills: { id: string; name: string }[] };
type Role = { roleName: string; skillId: string; headcount: number; rate: number };

const STEPS = ["Job basics", "Role line items", "Location & logistics", "Escrow funding", "Review & publish"];
const inputCls =
  "w-full rounded-[10px] border border-line-strong bg-bg px-4 py-3 text-sm text-ink placeholder:text-ink3 focus:border-bronze focus:outline-none focus:ring-2 focus:ring-bronze";

export function PostJobBuilder({ categories }: { categories: Category[] }) {
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [location, setLocation] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [fundingMode, setFundingMode] = useState<"FUND_NOW" | "FUND_AT_HIRE">("FUND_NOW");
  const [roles, setRoles] = useState<Role[]>([{ roleName: "", skillId: "", headcount: 1, rate: 0 }]);

  const [state, formAction, pending] = useActionState(postJobAction, {} as ActionState);
  const category = categories.find((c) => c.id === categoryId);
  const total = useMemo(() => roles.reduce((s, r) => s + r.headcount * r.rate, 0), [roles]);

  function setRole(i: number, patch: Partial<Role>) {
    setRoles((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-2 flex items-center justify-between">
        <h1 className="m-0 text-[28px] font-semibold text-ink">Post a Job</h1>
        <span className="text-xs text-ink3">Step {step + 1} of {STEPS.length}</span>
      </div>
      <div className="mb-6 mt-4 flex gap-1.5">
        {STEPS.map((_, i) => (
          <div key={i} className={`h-[3px] flex-1 rounded-full ${i <= step ? "bg-bronze" : "bg-line-strong"}`} />
        ))}
      </div>

      <form action={formAction} className="rounded-2xl border border-line bg-card p-7">
        <h3 className="mb-1 text-lg font-semibold text-ink">{STEPS[step]}</h3>

        {/* Hidden inputs carry all state to the server action */}
        <input type="hidden" name="title" value={title} />
        <input type="hidden" name="description" value={description} />
        <input type="hidden" name="categoryId" value={categoryId} />
        <input type="hidden" name="location" value={location} />
        <input type="hidden" name="startDate" value={startDate} />
        <input type="hidden" name="endDate" value={endDate} />
        <input type="hidden" name="fundingMode" value={fundingMode} />
        <input type="hidden" name="roles" value={JSON.stringify(roles)} />

        {/* Step 1 — basics */}
        {step === 0 && (
          <div className="mt-4 flex flex-col gap-3">
            <input className={inputCls} placeholder="Job title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <textarea className={`${inputCls} resize-y`} rows={3} placeholder="Describe the work" value={description} onChange={(e) => setDescription(e.target.value)} />
            <select className={inputCls} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}

        {/* Step 2 — roles */}
        {step === 1 && (
          <div className="mt-4 flex flex-col gap-2.5">
            <p className="text-[13px] font-light text-ink2">One post can hire a whole crew — each role with its own headcount and per-person rate.</p>
            {roles.map((r, i) => (
              <div key={i} className="grid grid-cols-[1.4fr_1fr_0.7fr_1fr_auto] items-center gap-2 rounded-xl border border-line bg-bg px-3 py-2.5">
                <select className={inputCls} value={r.skillId} onChange={(e) => { const sk = category?.skills.find((s) => s.id === e.target.value); setRole(i, { skillId: e.target.value, roleName: sk?.name ?? r.roleName }); }}>
                  <option value="">Role / skill…</option>
                  {(category?.skills ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <input className={inputCls} placeholder="Role name" value={r.roleName} onChange={(e) => setRole(i, { roleName: e.target.value })} />
                <input className={inputCls} type="number" min={1} value={r.headcount} onChange={(e) => setRole(i, { headcount: parseInt(e.target.value || "1", 10) })} />
                <input className={inputCls} type="number" min={0} placeholder="₹ rate" value={r.rate || ""} onChange={(e) => setRole(i, { rate: parseInt(e.target.value || "0", 10) })} />
                <button type="button" onClick={() => setRoles((p) => p.filter((_, idx) => idx !== i))} className="px-2 text-ink3 hover:text-ember">✕</button>
              </div>
            ))}
            <button type="button" onClick={() => setRoles((p) => [...p, { roleName: "", skillId: "", headcount: 1, rate: 0 }])} className="self-start rounded-full border border-line-strong px-5 py-2 text-[12.5px] font-medium text-ink hover:border-bronze">
              + Add another role
            </button>
            <div className="mt-1.5 flex items-center justify-between border-t border-line pt-3.5">
              <span className="text-[13px] text-ink3">Total budget, auto-summed</span>
              <span className="text-xl font-semibold text-bronze">{formatInr(total)}</span>
            </div>
          </div>
        )}

        {/* Step 3 — logistics */}
        {step === 2 && (
          <div className="mt-4 flex flex-col gap-3">
            <p className="text-[13px] font-light text-ink2">Pinned area only — the exact address is shared after hire.</p>
            <input className={inputCls} placeholder="Area & city (e.g. Andheri West, Mumbai)" value={location} onChange={(e) => setLocation(e.target.value)} />
            <div className="flex gap-3">
              <label className="flex-1 text-[11px] font-semibold uppercase tracking-wider text-ink3">Start<input className={`${inputCls} mt-1.5`} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
              <label className="flex-1 text-[11px] font-semibold uppercase tracking-wider text-ink3">End<input className={`${inputCls} mt-1.5`} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label>
            </div>
          </div>
        )}

        {/* Step 4 — funding */}
        {step === 3 && (
          <div className="mt-4 flex flex-col gap-3">
            <FundOption active={fundingMode === "FUND_NOW"} onClick={() => setFundingMode("FUND_NOW")} title={`Fund escrow now — ${formatInr(total)}`} badge="Recommended" note="Gets the 'Funded' badge — funded jobs attract about twice the applicants. (Funding itself is wired in Phase 7.)" />
            <FundOption active={fundingMode === "FUND_AT_HIRE"} onClick={() => setFundingMode("FUND_AT_HIRE")} title="Fund at hire time" note="Escrow is required before any hire is confirmed — you'll fund per accepted applicant." />
          </div>
        )}

        {/* Step 5 — review */}
        {step === 4 && (
          <div className="mt-4 flex flex-col gap-2">
            {[
              ["Title", title || "—"],
              ["Category", category?.name ?? "—"],
              ["Roles", roles.map((r) => `${r.roleName || "?"} ×${r.headcount} @ ${formatInr(r.rate)}`).join(", ") || "—"],
              ["Total budget", formatInr(total)],
              ["Location", location || "—"],
              ["Dates", `${startDate || "—"} → ${endDate || "—"}`],
              ["Funding", fundingMode === "FUND_NOW" ? "Fund now" : "Fund at hire"],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-b border-hair py-2 text-[13.5px]">
                <span className="text-ink3">{k}</span>
                <span className="text-right text-ink">{v}</span>
              </div>
            ))}
          </div>
        )}

        {state.error && <p className="mt-4 rounded-lg border border-ember/40 bg-ember/10 px-3 py-2 text-sm text-ember">{state.error}</p>}

        <div className="mt-6 flex items-center justify-between gap-3">
          <Button type="button" variant="secondary" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
            Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button type="button" variant="primary" onClick={() => setStep((s) => s + 1)}>Next</Button>
          ) : (
            <div className="flex gap-2.5">
              <Button type="submit" name="publish" value="false" variant="secondary" disabled={pending}>Save Draft</Button>
              <Button type="submit" name="publish" value="true" variant="primary" disabled={pending}>{pending ? "Publishing…" : "Publish Job"}</Button>
            </div>
          )}
        </div>
      </form>
    </div>
  );
}

function FundOption({ active, onClick, title, badge, note }: { active: boolean; onClick: () => void; title: string; badge?: string; note: string }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-xl border px-5 py-4 text-left transition-colors ${active ? "border-bronze bg-bronze/[0.06]" : "border-line-strong hover:border-bronze"}`}>
      <span className="flex items-center justify-between">
        <span className="text-[15px] font-semibold text-ink">{title}</span>
        {badge && <span className="rounded-full border border-[#8FC7E8]/40 px-2.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-[#8FC7E8]">{badge}</span>}
      </span>
      <span className="mt-1.5 block text-[12.5px] text-ink2">{note}</span>
    </button>
  );
}
