"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatInr, shortDate } from "@/lib/format";

/*
  WK-05 Find Jobs — client-side filter bar + results. The page (server component)
  fetches published jobs and passes a plain, serializable shape here; all filtering
  runs in the browser over that list (instant, no refetch). Category options are
  derived from the jobs actually present. Distance stays disabled until jobs carry
  geo-coordinates (they only store a location string today).
*/
export type JobRow = {
  id: string;
  title: string;
  urgent: boolean;
  categoryName: string;
  location: string;
  clientName: string;
  rate: number | null;
  startIso: string | null;
  openSlots: number;
};

type BudgetOpt = { key: string; label: string; test: (rate: number | null) => boolean };
const BUDGETS: BudgetOpt[] = [
  { key: "any", label: "Any budget", test: () => true },
  { key: "lt2k", label: "Under ₹2,000", test: (r) => r != null && r < 2000 },
  { key: "mid", label: "₹2,000 – 10,000", test: (r) => r != null && r >= 2000 && r <= 10000 },
  { key: "gt10k", label: "Over ₹10,000", test: (r) => r != null && r > 10000 },
];

type DateOpt = { key: string; label: string; test: (ms: number | null, now: number) => boolean };
const DATES: DateOpt[] = [
  { key: "any", label: "Any date", test: () => true },
  { key: "upcoming", label: "Upcoming", test: (ms, now) => ms != null && ms >= now },
  { key: "week", label: "Next 7 days", test: (ms, now) => ms != null && ms >= now && ms <= now + 7 * 864e5 },
  { key: "started", label: "Already started", test: (ms, now) => ms != null && ms < now },
];

const chipBase =
  "rounded-full border px-4 py-2 text-[12.5px] font-medium transition-colors";

function FilterDropdown({
  id,
  label,
  value,
  options,
  onSelect,
  open,
  setOpen,
}: {
  id: string;
  label: string;
  value: string;
  options: { key: string; label: string }[];
  onSelect: (key: string) => void;
  open: string | null;
  setOpen: (v: string | null) => void;
}) {
  const isOpen = open === id;
  const selected = options.find((o) => o.key === value);
  const active = value !== options[0].key;
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(isOpen ? null : id)}
        className={`${chipBase} ${
          active
            ? "border-bronze text-bronze"
            : "border-line-strong text-ink2 hover:border-bronze"
        }`}
      >
        {active && selected ? selected.label : label} ▾
      </button>
      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1.5 min-w-[190px] rounded-xl border border-line bg-card p-1.5 shadow-xl">
          {options.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => {
                onSelect(o.key);
                setOpen(null);
              }}
              className={`block w-full rounded-lg px-3 py-2 text-left text-[13px] transition-colors ${
                o.key === value
                  ? "bg-bronze/10 text-bronze"
                  : "text-ink2 hover:bg-card2 hover:text-ink"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function FindJobsBrowser({ jobs }: { jobs: JobRow[] }) {
  const [category, setCategory] = useState("all");
  const [budget, setBudget] = useState("any");
  const [dateKey, setDateKey] = useState("any");
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const categoryOptions = useMemo(() => {
    const names = Array.from(new Set(jobs.map((j) => j.categoryName))).sort();
    return [{ key: "all", label: "All categories" }, ...names.map((n) => ({ key: n, label: n }))];
  }, [jobs]);

  const filtered = useMemo(() => {
    const now = Date.now();
    const budgetTest = BUDGETS.find((b) => b.key === budget)!.test;
    const dateTest = DATES.find((d) => d.key === dateKey)!.test;
    return jobs.filter((j) => {
      if (category !== "all" && j.categoryName !== category) return false;
      if (urgentOnly && !j.urgent) return false;
      if (!budgetTest(j.rate)) return false;
      const ms = j.startIso ? new Date(j.startIso).getTime() : null;
      if (!dateTest(ms, now)) return false;
      return true;
    });
  }, [jobs, category, budget, dateKey, urgentOnly]);

  const anyActive =
    category !== "all" || budget !== "any" || dateKey !== "any" || urgentOnly;

  return (
    <div>
      {/* Click-away backdrop for open dropdowns */}
      {open && <div className="fixed inset-0 z-40" onClick={() => setOpen(null)} />}

      <div className="relative z-40 mb-4 flex flex-wrap items-center gap-2.5 rounded-2xl border border-line bg-card p-4">
        <FilterDropdown id="category" label="Category" value={category} options={categoryOptions} onSelect={setCategory} open={open} setOpen={setOpen} />
        <span
          title="Filtering by distance needs job geo-coordinates — coming soon"
          className={`${chipBase} cursor-not-allowed border-line-strong text-ink3 opacity-50`}
        >
          Distance ▾
        </span>
        <FilterDropdown id="budget" label="Budget" value={budget} options={BUDGETS} onSelect={setBudget} open={open} setOpen={setOpen} />
        <FilterDropdown id="date" label="Date" value={dateKey} options={DATES} onSelect={setDateKey} open={open} setOpen={setOpen} />

        <button
          type="button"
          onClick={() => setUrgentOnly((v) => !v)}
          className={`rounded-full border px-4 py-2 text-[12.5px] font-semibold transition-colors ${
            urgentOnly
              ? "border-amber bg-amber/[0.14] text-amber"
              : "border-amber/40 bg-amber/[0.08] text-amber hover:border-amber"
          }`}
        >
          ⚡ Urgent only
        </button>

        {anyActive && (
          <button
            type="button"
            onClick={() => {
              setCategory("all");
              setBudget("any");
              setDateKey("any");
              setUrgentOnly(false);
            }}
            className="rounded-full px-3 py-2 text-[12.5px] font-medium text-ink3 hover:text-bronze"
          >
            Clear
          </button>
        )}

        <span className="ml-auto text-xs text-ink3">
          {filtered.length} of {jobs.length} job{jobs.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {filtered.map((j) => (
          <Link
            key={j.id}
            href={`/dashboard/worker/jobs/${j.id}`}
            className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-card px-6 py-5 transition-colors hover:border-bronze/40"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-base font-semibold text-ink">{j.title}</span>
                {j.urgent && (
                  <span className="rounded-full border border-amber/35 px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-amber">
                    Urgent
                  </span>
                )}
              </div>
              <div className="mt-1.5 text-[12.5px] text-ink3">
                {j.categoryName} · {j.location} · from {j.startIso ? shortDate(j.startIso) : "flexible"} · Client {j.clientName}
              </div>
            </div>
            <div className="flex-shrink-0 text-right">
              <div className="text-base font-semibold text-bronze">{j.rate != null ? formatInr(j.rate) : "—"}</div>
              <div className="mt-0.5 text-[11.5px] text-ink3">
                {j.openSlots} slot{j.openSlots === 1 ? "" : "s"} open
              </div>
            </div>
          </Link>
        ))}
        {filtered.length === 0 && (
          <p className="text-sm text-ink3">
            {jobs.length === 0 ? "No open jobs right now." : "No jobs match these filters."}
          </p>
        )}
      </div>
    </div>
  );
}
