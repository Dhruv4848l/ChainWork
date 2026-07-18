import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, StatusBadge } from "@/components/ui";
import { requireAdminAccess } from "@/lib/admin/guards";
import { adminDb } from "@/lib/adminDb";
import { bridgeGetUser } from "@/lib/admin/bridge";
import { formatInr } from "@/lib/format";

export default async function JuryMemberPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminAccess("jury");
  const { id } = await params;
  const juror = await adminDb.jurorProfile.findUnique({ where: { id } });
  if (!juror) notFound();
  // Resolve the juror's real platform identity + eligibility signals via the bridge.
  const platformUser = await bridgeGetUser(juror.platformUserId);

  return (
    <div className="max-w-2xl">
      <Link href="/admin/jury" className="mb-4 inline-block text-[12px] font-semibold uppercase tracking-wider text-bronze hover:underline">
        ← Jury roster
      </Link>
      <div className="mb-4 flex items-center gap-3">
        <h1 className="m-0 text-[22px] font-semibold text-ink">{juror.displayName}</h1>
        <StatusBadge tone={juror.status === "ACTIVE" ? "success" : "draft"}>{juror.status}</StatusBadge>
      </div>

      <div className="grid gap-3.5 md:grid-cols-2">
        <Card className="p-6">
          <h3 className="mb-3 text-[15px] font-semibold text-ink">Juror record</h3>
          {[
            ["Cases served", String(juror.casesCount)],
            ["Agreement w/ majority", `${juror.agreementRate.toFixed(0)}%`],
            ["Stake balance", formatInr(Number(juror.stakeBalance))],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between border-b border-hair py-2 text-[13px] last:border-b-0">
              <span className="text-ink3">{k}</span><span className="text-ink">{v}</span>
            </div>
          ))}
        </Card>
        <Card className="p-6">
          <h3 className="mb-3 text-[15px] font-semibold text-ink">Platform eligibility (via bridge)</h3>
          {platformUser ? (
            <div className="text-[13px] text-ink2">
              <div>KYC: <span className="text-ink">{platformUser.kycTier}</span></div>
              {platformUser.worker && <div className="mt-1">★ {platformUser.worker.rating.toFixed(1)} · {platformUser.worker.completedJobs} jobs</div>}
              <div className="mt-1 text-ink3">No active disputes as a party.</div>
            </div>
          ) : <p className="text-sm text-ink3">Platform identity unavailable.</p>}
        </Card>
      </div>
    </div>
  );
}
