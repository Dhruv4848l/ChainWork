import Link from "next/link";
import { Card, StatusBadge } from "@/components/ui";
import { EmptyState } from "@/features/shared/dashboard-ui";
import { requireAdminAccess } from "@/lib/admin/guards";
import { adminDb } from "@/lib/adminDb";
import { formatInr } from "@/lib/format";

const TONE = { ACTIVE: "success", ON_LEAVE: "draft", SUSPENDED: "danger", PENDING: "warning" } as const;

export default async function JuryRosterPage() {
  await requireAdminAccess("jury");
  const jurors = await adminDb.jurorProfile.findMany({ orderBy: { casesCount: "desc" } });

  return (
    <div>
      <h1 className="mb-1 text-[26px] font-semibold text-ink">Jury Roster</h1>
      <p className="mb-5 text-[13px] text-ink3">
        Eligibility (Verified+ KYC · rating ≥ 4.5 · 25+ jobs · staked · opted in) is checked via the
        bridge against Platform DB history.
      </p>
      {jurors.length === 0 ? (
        <EmptyState title="No jurors yet" />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="grid grid-cols-[1.6fr_0.8fr_1fr_0.8fr_0.9fr] gap-3 border-b border-line px-6 py-3 text-[10px] font-semibold uppercase tracking-wider text-ink3">
            <span>Juror</span><span>Cases</span><span>Agreement</span><span>Stake</span><span>Status</span>
          </div>
          {jurors.map((j) => (
            <Link key={j.id} href={`/admin/jury/${j.id}`} className="grid grid-cols-[1.6fr_0.8fr_1fr_0.8fr_0.9fr] items-center gap-3 border-b border-hair px-6 py-3.5 last:border-b-0 hover:bg-bronze/[0.04]">
              <span className="text-[13px] font-medium text-ink">{j.displayName}</span>
              <span className="text-[12px] text-ink2">{j.casesCount}</span>
              <span className="text-[12px] text-emerald">{j.agreementRate.toFixed(0)}%</span>
              <span className="text-[12px] text-ink2">{formatInr(Number(j.stakeBalance))}</span>
              <span><StatusBadge tone={TONE[j.status as keyof typeof TONE] ?? "draft"}>{j.status}</StatusBadge></span>
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}
