import { Card, StatusBadge } from "@/components/ui";
import { requireRole } from "@/lib/auth/guards";
import { getClientProfile } from "@/features/client/queries";

export default async function ClientProfilePage() {
  const user = await requireRole("CLIENT");
  const data = await getClientProfile(user.id);
  const c = data?.clientProfile;

  return (
    <div className="max-w-3xl">
      <h1 className="mb-5 text-[28px] font-semibold text-ink">Client Profile</h1>

      <Card className="mb-3.5 flex flex-col gap-6 p-7 sm:flex-row sm:items-start">
        <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-full border border-bronze/40 bg-card2 font-display text-3xl text-bronze">
          {user.name.charAt(0)}
        </div>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="m-0 text-[22px] font-semibold text-ink">
              {user.name}
              {c?.companyName && <span className="text-ink3"> — {c.companyName}</span>}
            </h2>
            <StatusBadge tone="warning">
              {user.kycTier} {c?.clientType === "BUSINESS" ? "Business" : "Individual"}
            </StatusBadge>
          </div>
          <div className="my-2 text-[13.5px] text-ink2">
            {c?.address ?? "Location not set"}
            {c?.businessRegNumber && ` · Reg. ${c.businessRegNumber}`}
          </div>
          <div className="mt-3.5 flex flex-wrap gap-6 text-[13px] text-ink3">
            <span><span className="font-semibold text-ink">{c?.hiresCount ?? 0}</span> total hires</span>
          </div>
        </div>
      </Card>

      <Card className="flex items-center gap-6 border-emerald/25 p-7">
        <div className="flex-shrink-0 text-center">
          <div className="font-display text-5xl leading-none text-emerald">
            {Math.round(c?.escrowReliabilityScore ?? 100)}%
          </div>
          <div className="mt-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink3">Escrow Reliability</div>
        </div>
        <div className="flex-1">
          <div className="mb-1.5 text-sm font-semibold text-ink">Workers see this score on every job you post.</div>
          <div className="text-[13px] font-light leading-relaxed text-ink2">
            The share of your past jobs with escrow funded promptly and released without dispute.
            Funding at post time holds it high — funded jobs get roughly 2× more applicants.
          </div>
        </div>
      </Card>
    </div>
  );
}
