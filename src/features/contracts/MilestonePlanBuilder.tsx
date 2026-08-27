"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { formatInr } from "@/lib/format";
import { createHireWithMilestonesAction } from "./actions";

/*
  The payment schedule the client builds before the hire exists.

  This is the screen that turns "₹X for a job" into "₹X across N phases" — which is
  what the whole escrow engine is built around: each phase is funded on its own,
  released on its own, and disputed on its own. The running total has to land
  exactly on the agreed value, because the server re-checks it and the phases are
  what the contract text is generated from.
*/

export interface MilestoneDraft {
  name: string;
  amount: number;
  dueDate: string;
}

/** Split `total` into `n` parts that sum exactly (remainder goes to the last phase). */
function evenSplit(total: number, n: number): number[] {
  const base = Math.floor((total / n) * 100) / 100;
  const parts = Array<number>(n).fill(base);
  const drift = Math.round((total - base * n) * 100) / 100;
  parts[n - 1] = Math.round((parts[n - 1] + drift) * 100) / 100;
  return parts;
}

function addDays(iso: string, days: number): string {
  const d = iso ? new Date(iso) : new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function MilestonePlanBuilder({
  applicationId,
  workerName,
  jobTitle,
  total,
  startDate,
  endDate,
  suggested,
}: {
  applicationId: string;
  workerName: string;
  jobTitle: string;
  total: number;
  startDate: string;
  endDate: string;
  /** Phase names pre-filled for this kind of job — the client can rewrite all of them. */
  suggested: string[];
}) {
  const [rows, setRows] = useState<MilestoneDraft[]>(() => {
    const amounts = evenSplit(total, suggested.length);
    const spanDays = Math.max(
      suggested.length * 3,
      startDate && endDate
        ? Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000)
        : suggested.length * 7
    );
    const step = Math.max(1, Math.round(spanDays / suggested.length));
    return suggested.map((name, i) => ({
      name,
      amount: amounts[i],
      dueDate: addDays(startDate || new Date().toISOString().slice(0, 10), step * (i + 1)),
    }));
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const sum = useMemo(
    () => Math.round(rows.reduce((s, r) => s + (Number(r.amount) || 0), 0) * 100) / 100,
    [rows]
  );
  const diff = Math.round((total - sum) * 100) / 100;
  const balanced = diff === 0;

  function patch(i: number, p: Partial<MilestoneDraft>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...p } : r)));
  }
  function addRow() {
    setRows((prev) => [
      ...prev,
      { name: "", amount: 0, dueDate: addDays(prev[prev.length - 1]?.dueDate ?? "", 7) },
    ]);
  }
  function removeRow(i: number) {
    setRows((prev) => (prev.length <= 2 ? prev : prev.filter((_, idx) => idx !== i)));
  }
  function rebalance() {
    const amounts = evenSplit(total, rows.length);
    setRows((prev) => prev.map((r, i) => ({ ...r, amount: amounts[i] })));
  }

  function submit() {
    setError(null);
    start(async () => {
      const res = await createHireWithMilestonesAction(applicationId, JSON.stringify(rows));
      if (res?.error) setError(res.error);
    });
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-5 rounded-2xl border border-line bg-card p-6">
        <h2 className="m-0 text-lg font-semibold text-ink">
          Milestone plan — {workerName}
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink2">
          Split <span className="font-semibold text-bronze">{formatInr(total)}</span> for{" "}
          <span className="text-ink">{jobTitle}</span> into phases. You fund one phase at a time:
          money for phase 2 is only asked for once phase 1 has been delivered, approved and
          released. The worker sees this exact schedule in the contract before signing.
        </p>
      </div>

      <div className="rounded-2xl border border-line bg-card p-6">
        <div className="mb-2.5 grid grid-cols-[0.4fr_2.2fr_1fr_1.1fr_auto] gap-2.5 text-[10.5px] font-semibold uppercase tracking-wider text-ink3">
          <span>#</span>
          <span>Phase / deliverable</span>
          <span>Amount (₹)</span>
          <span>Due</span>
          <span />
        </div>

        {rows.map((r, i) => (
          <div
            key={i}
            className="mb-2 grid grid-cols-[0.4fr_2.2fr_1fr_1.1fr_auto] items-center gap-2.5"
          >
            <span className="text-sm font-semibold text-bronze">{i + 1}</span>
            <input
              aria-label={`Phase ${i + 1} name`}
              className={inputCls}
              placeholder="e.g. Auth & onboarding screens"
              value={r.name}
              onChange={(e) => patch(i, { name: e.target.value })}
            />
            <input
              aria-label={`Phase ${i + 1} amount`}
              className={inputCls}
              type="number"
              min={0}
              value={r.amount || ""}
              onChange={(e) => patch(i, { amount: Number(e.target.value || 0) })}
            />
            <input
              aria-label={`Phase ${i + 1} due date`}
              className={inputCls}
              type="date"
              value={r.dueDate}
              onChange={(e) => patch(i, { dueDate: e.target.value })}
            />
            <button
              type="button"
              aria-label={`Remove phase ${i + 1}`}
              onClick={() => removeRow(i)}
              disabled={rows.length <= 2}
              className="px-2 text-ink3 hover:text-ember disabled:opacity-30"
            >
              ✕
            </button>
          </div>
        ))}

        <div className="mt-3 flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={addRow}
            className="rounded-full border border-line-strong px-5 py-2 text-[12.5px] font-medium text-ink hover:border-bronze"
          >
            + Add phase
          </button>
          <button
            type="button"
            onClick={rebalance}
            className="rounded-full border border-line-strong px-5 py-2 text-[12.5px] font-medium text-ink2 hover:border-bronze"
          >
            Split evenly
          </button>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
          <span className="text-[13px] text-ink3">
            {rows.length} phases · schedule total
          </span>
          <span className="text-right">
            <span
              className={`block text-xl font-semibold ${balanced ? "text-emerald" : "text-ember"}`}
            >
              {formatInr(sum)}
            </span>
            <span className="block text-[11.5px] text-ink3">
              {balanced
                ? `matches the agreed ${formatInr(total)}`
                : diff > 0
                  ? `${formatInr(diff)} still unallocated`
                  : `${formatInr(-diff)} over the agreed total`}
            </span>
          </span>
        </div>

        {error && (
          <p className="mt-4 rounded-lg border border-ember/40 bg-ember/10 px-3 py-2 text-sm text-ember">
            {error}
          </p>
        )}

        <div className="mt-5 flex items-center justify-between gap-3">
          <p className="text-[11.5px] text-ink3">
            Nothing is charged here. The contract is generated next and both of you sign it
            before any escrow is funded.
          </p>
          <Button
            variant="primary"
            disabled={pending || !balanced}
            onClick={submit}
            className="flex-shrink-0"
          >
            {pending ? "Creating contract…" : "Confirm hire & generate contract"}
          </Button>
        </div>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-[10px] border border-line-strong bg-bg px-3.5 py-2.5 text-sm text-ink placeholder:text-ink3 focus:border-bronze focus:outline-none focus:ring-2 focus:ring-bronze";
