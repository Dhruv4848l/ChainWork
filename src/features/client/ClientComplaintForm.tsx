"use client";

import { useState, useTransition } from "react";
import { Button, Card } from "@/components/ui";
import { submitComplaintAction, proposeSettlementAction } from "./actions";

/*
  CL-13 File a Complaint. Rendered form; submission is stubbed — the triage → jury
  pipeline is built in Phase 11. "Propose Mutual Settlement instead" is a Phase-7 stub.
*/
const CATEGORIES = ["Work quality", "No-show", "Behavior", "Other"];

export function ClientComplaintForm({
  hires,
  defaultHireId,
}: {
  hires: { id: string; label: string }[];
  defaultHireId?: string;
}) {
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [hireId, setHireId] = useState(defaultHireId ?? hires[0]?.id ?? "");
  const [description, setDescription] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <Card className="flex flex-col gap-3.5 p-6">
      <div>
        <Label>Related hire</Label>
        <select
          value={hireId}
          onChange={(e) => setHireId(e.target.value)}
          className="w-full rounded-[10px] border border-line-strong bg-bg px-4 py-3 text-sm text-ink focus:border-bronze focus:outline-none"
        >
          {hires.length === 0 && <option>No hires available</option>}
          {hires.map((h) => <option key={h.id} value={h.id}>{h.label}</option>)}
        </select>
      </div>

      <div>
        <Label>Category</Label>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`rounded-full border px-4 py-2 text-[12.5px] font-medium ${category === c ? "border-bronze bg-bronze/10 text-bronze" : "border-line-strong text-ink2"}`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <textarea
        rows={4}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Describe what happened — the hire's chat log and check-in records attach automatically"
        className="rounded-[10px] border border-line-strong bg-bg px-4 py-3 text-sm text-ink placeholder:text-ink3 focus:border-bronze focus:outline-none focus:ring-2 focus:ring-bronze"
      />
      <div className="rounded-[10px] border border-dashed border-line-strong px-6 py-6 text-center text-[12.5px] text-ink3">
        Attach evidence — photos, documents.
      </div>

      {msg && <p className="rounded-lg border border-bronze/40 bg-bronze/10 px-3 py-2 text-sm text-bronze">{msg}</p>}

      <div className="flex items-center justify-between gap-3">
        <Button
          variant="secondary"
          size="sm"
          disabled={pending || !hireId}
          onClick={() => start(async () => setMsg((await proposeSettlementAction(hireId)).message ?? null))}
        >
          Propose Mutual Settlement instead
        </Button>
        <Button
          variant="primary"
          disabled={pending || hires.length === 0}
          onClick={() => start(async () => { const r = await submitComplaintAction(hireId, category, description); setMsg(r.message ?? r.error ?? null); })}
        >
          Submit Complaint
        </Button>
      </div>
    </Card>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-ink3">{children}</label>;
}
