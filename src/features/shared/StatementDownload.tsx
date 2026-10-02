import { defaultPeriod } from "@/lib/receipts/statementMath";

/*
  "Download statement" (payment plan P2.6) — a plain GET form to /api/statements/pdf,
  so it works without client JS. Dates are inclusive India-time days; default = last 30.
*/
export function StatementDownload() {
  const { from, to } = defaultPeriod();
  return (
    <form action="/api/statements/pdf" method="get" className="flex flex-wrap items-end gap-2.5">
      <label className="flex flex-col gap-1 text-[11px] text-ink3">
        From
        <input type="date" name="from" defaultValue={from} max={to} required
          className="rounded-lg border border-line bg-card2 px-2.5 py-1.5 text-[13px] text-ink focus-visible:outline-2 focus-visible:outline-bronze" />
      </label>
      <label className="flex flex-col gap-1 text-[11px] text-ink3">
        To
        <input type="date" name="to" defaultValue={to} max={to} required
          className="rounded-lg border border-line bg-card2 px-2.5 py-1.5 text-[13px] text-ink focus-visible:outline-2 focus-visible:outline-bronze" />
      </label>
      <button type="submit"
        className="rounded-full border border-bronze/50 px-4 py-2 text-[12.5px] font-semibold text-bronze transition-colors hover:bg-bronze/10 focus-visible:outline-2 focus-visible:outline-bronze">
        Download statement (PDF)
      </button>
    </form>
  );
}
