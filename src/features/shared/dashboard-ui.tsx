import { Card } from "@/components/ui";

/*
  Small presentational primitives shared across the Worker (Phase 4) and Client
  (Phase 5) dashboards.
*/

export function PageTitle({
  children,
  action,
  sub,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  sub?: string;
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        <h1 className="m-0 text-[28px] font-semibold text-ink">{children}</h1>
        {sub && <p className="mt-1 text-[13px] text-ink3">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatCard({
  label,
  value,
  sub,
  accent = "ink",
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "ink" | "bronze" | "emerald" | "amber" | "info";
}) {
  const color = {
    ink: "text-ink",
    bronze: "text-bronze",
    emerald: "text-emerald",
    amber: "text-amber",
    info: "text-[#8FC7E8]",
  }[accent];
  return (
    <Card className="p-5">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink3">
        {label}
      </div>
      <div className={`text-2xl font-semibold ${color}`}>{value}</div>
      {sub && <div className="mt-1 text-[11.5px] text-ink3">{sub}</div>}
    </Card>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <div className="text-3xl text-bronze/50">◆</div>
      <div className="text-[15px] font-medium text-ink">{title}</div>
      {hint && <div className="max-w-sm text-sm text-ink3">{hint}</div>}
      {action}
    </Card>
  );
}

/* A shimmering placeholder block for data in flight. Compose these into a
   route's loading.tsx skeleton — never a bare spinner. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`cw-skeleton rounded-lg ${className}`} />;
}

/** A stack of skeleton rows sized like a typical list/table, for loading.tsx files. */
export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <Card className="overflow-hidden p-0">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3.5 border-b border-hair px-6 py-4 last:border-b-0">
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="flex-1">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="mt-2 h-3 w-2/3" />
          </div>
        </div>
      ))}
    </Card>
  );
}
