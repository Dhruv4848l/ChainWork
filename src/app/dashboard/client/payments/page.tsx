import { Card, StatusBadge } from "@/components/ui";
import { PageTitle, StatCard } from "@/features/shared/dashboard-ui";
import { phaseStatusDisplay } from "@/features/shared/status";
import { requireRole } from "@/lib/auth/guards";
import { getClientPayments, getClientProfile } from "@/features/client/queries";
import { getWalletSummary } from "@/lib/chain/wallet";
import { AddFundsButton } from "@/features/client/AddFundsButton";
import { FundDueButton } from "@/features/client/FundDueButton";
import { ExternalWalletConnect } from "@/features/wallet/ExternalWalletConnect";
import { formatInr } from "@/lib/format";

export default async function ClientPaymentsPage() {
  const user = await requireRole("CLIENT");
  const [pay, profile, wallet] = await Promise.all([
    getClientPayments(user.id),
    getClientProfile(user.id),
    getWalletSummary(user.id),
  ]);
  const reliability = Math.round(profile?.clientProfile?.escrowReliabilityScore ?? 100);

  return (
    <div>
      <PageTitle action={<AddFundsButton />}>Payments &amp; Escrow</PageTitle>

      <div className="mb-4.5 grid grid-cols-2 gap-3.5 md:grid-cols-4">
        <StatCard label="Wallet balance" value={formatInr(wallet.balanceInr)} accent="bronze" sub={wallet.live ? "live on-chain, in ₹" : "cached · chain offline"} />
        <StatCard label="In escrow" value={formatInr(pay.escrowTotal)} accent="info" />
        <StatCard label="Released to workers" value={formatInr(pay.releasedTotal)} accent="emerald" />
        <StatCard label="Escrow reliability" value={`${reliability}%`} accent="emerald" />
      </div>

      <Card className="mb-3.5 p-6">
        <h3 className="mb-1.5 text-[15px] font-semibold text-ink">Your wallet</h3>
        <p className="mb-3.5 font-mono text-[11px] text-ink3">{wallet.custodialAddress}</p>
        <ExternalWalletConnect linkedAddress={wallet.externalAddress} />
      </Card>

      <div className="grid gap-3.5 lg:grid-cols-[1fr_1.6fr]">
        <Card className="p-6">
          <h3 className="mb-3.5 text-[15px] font-semibold text-ink">Next phase funding due</h3>
          {pay.dueToFund.length === 0 && <p className="text-sm text-ink3">Nothing due to fund.</p>}
          {pay.dueToFund.map((p) => (
            <div key={p.id} className="flex items-center justify-between border-b border-hair py-3 last:border-b-0">
              <span>
                <span className="block text-[13px] font-medium text-ink">{p.name}</span>
                <span className="block text-[11px] text-ink3">{p.hireTitle}</span>
              </span>
              <FundDueButton phaseId={p.id} amount={Number(p.amount)} />
            </div>
          ))}
        </Card>

        <Card className="overflow-hidden p-0">
          <div className="grid grid-cols-[1.8fr_1fr_1fr] gap-2.5 border-b border-line px-6 py-3.5 text-[10.5px] font-semibold uppercase tracking-wider text-ink3">
            <span>Phase</span><span>Amount</span><span>State</span>
          </div>
          {pay.phases.length === 0 && <p className="p-6 text-sm text-ink3">No phases yet.</p>}
          {pay.phases.map((p) => {
            const d = phaseStatusDisplay(p.status);
            return (
              <div key={p.id} className="grid grid-cols-[1.8fr_1fr_1fr] items-center gap-2.5 border-b border-hair px-6 py-3.5 last:border-b-0">
                <span>
                  <span className="block text-[13px] font-medium text-ink">{p.name}</span>
                  <span className="block text-[11px] text-ink3">{p.hireTitle}</span>
                </span>
                <span className="text-[13px] font-semibold text-ink">{formatInr(Number(p.amount))}</span>
                <span><StatusBadge tone={d.tone}>{d.label}</StatusBadge></span>
              </div>
            );
          })}
        </Card>
      </div>
    </div>
  );
}
