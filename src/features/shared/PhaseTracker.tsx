import { StatusBadge } from "@/components/ui";
import { phaseStatusDisplay } from "./status";
import { formatInr, shortDate } from "@/lib/format";

/*
  PhaseTracker — the fund → in-progress → delivered → verification-window → released
  timeline for a Hire's phases. Reused by the Worker (WK-11) and Client (CL-07) hire
  detail screens. Presentational + server-compatible: pass already-rendered action
  nodes per phase (e.g. the worker's "Mark Delivered" button) via `actionsByPhase`.
*/

export type PhaseView = {
  id: string;
  index: number;
  name: string;
  amount: number;
  dueDate: Date | string | null;
  status: string;
  note?: string;
};

const DOT: Record<string, string> = {
  RELEASED: "bg-emerald border-emerald",
  DISPUTED: "bg-ember border-ember",
  AUTO_CANCELLED: "bg-ember border-ember",
  DELIVERED: "bg-amber border-amber",
  VERIFICATION_WINDOW_OPEN: "bg-amber border-amber",
  FUNDED: "bg-bronze border-bronze",
  IN_PROGRESS: "bg-bronze border-bronze",
  PENDING_FUNDING: "bg-transparent border-line-strong",
};

export function PhaseTracker({
  phases,
  actionsByPhase,
}: {
  phases: PhaseView[];
  actionsByPhase?: Record<string, React.ReactNode>;
}) {
  return (
    <div className="flex flex-col">
      {phases.map((p, i) => {
        const d = phaseStatusDisplay(p.status);
        const last = i === phases.length - 1;
        return (
          <div key={p.id} className="flex gap-4 border-b border-hair py-3.5 last:border-b-0">
            <div className="flex flex-shrink-0 flex-col items-center">
              <div className={`mt-1 h-3.5 w-3.5 rounded-full border-2 ${DOT[p.status] ?? DOT.PENDING_FUNDING}`} />
              {!last && <div className="mt-1 w-px flex-1 bg-line" />}
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold text-ink">
                  {p.name}
                  <span className="ml-1 text-[12.5px] font-normal text-ink3">
                    · due {shortDate(p.dueDate)}
                  </span>
                </span>
                <StatusBadge tone={d.tone}>{d.label}</StatusBadge>
              </div>
              <div className="mt-1.5 flex items-center justify-between">
                <span className="text-sm font-semibold text-bronze">{formatInr(p.amount)}</span>
                {p.note && <span className="text-xs text-ink3">{p.note}</span>}
              </div>
              {actionsByPhase?.[p.id] && <div className="mt-2.5">{actionsByPhase[p.id]}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
