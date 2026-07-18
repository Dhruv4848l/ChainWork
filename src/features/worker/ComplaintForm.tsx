"use client";

import { useState, useTransition } from "react";
import { Button, Card } from "@/components/ui";
import { submitComplaintAction } from "./actions";

/*
  WK-17 File a Complaint. Renders the form; submission is stubbed — the
  triage → jury pipeline is built in Phase 11.
*/
const CATEGORIES = ["Payment issue", "Work quality", "Behavior", "Safety", "Other"];

export function ComplaintForm({
  hires,
  defaultHireId,
}: {
  hires: { id: string; title: string }[];
  defaultHireId?: string;
}) {
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [hireId, setHireId] = useState(defaultHireId ?? hires[0]?.id ?? "");
  const [description, setDescription] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <Card className="mb-4 flex flex-col gap-3.5 p-6">
      <div>
        <Label>Related hire</Label>
        <select
          value={hireId}
          onChange={(e) => setHireId(e.target.value)}
          className="w-full rounded-[10px] border border-line-strong bg-bg px-4 py-3 text-sm text-ink focus:border-bronze focus:outline-none"
        >
          {hires.length === 0 && <option>No hires available</option>}
          {hires.map((h) => (
            <option key={h.id} value={h.id}>{h.title} · #{h.id.slice(-6)}</option>
          ))}
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
              className={`rounded-full border px-4 py-2 text-[12.5px] font-medium ${
                category === c ? "border-bronze bg-bronze/10 text-bronze" : "border-line-strong text-ink2"
              }`}
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
        placeholder="Describe what happened, factually — dates, amounts, what was agreed"
        className="rounded-[10px] border border-line-strong bg-bg px-4 py-3 text-sm text-ink placeholder:text-ink3 focus:border-bronze focus:outline-none focus:ring-2 focus:ring-bronze"
      />
      <div className="rounded-[10px] border border-dashed border-line-strong px-6 py-6 text-center text-[12.5px] text-ink3">
        Attach evidence — photos, receipts. Your hire&apos;s chat log is included automatically.
      </div>

      {msg && <p className="rounded-lg border border-bronze/40 bg-bronze/10 px-3 py-2 text-sm text-bronze">{msg}</p>}

      <Button
        variant="primary"
        disabled={pending || hires.length === 0}
        className="self-end"
        onClick={() => start(async () => { const r = await submitComplaintAction(hireId, category, description); setMsg(r.message ?? r.error ?? null); })}
      >
        Submit Complaint
      </Button>
    </Card>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-ink3">{children}</label>;
}
