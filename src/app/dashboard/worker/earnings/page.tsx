import { Card } from "@/components/ui";
import { PageTitle, StatCard } from "@/features/shared/dashboard-ui";
import { phaseStatusDisplay } from "@/features/shared/status";
import { requireRole } from "@/lib/auth/guards";
import { getWorkerEarnings } from "@/features/worker/queries";
import { getWalletSummary } from "@/lib/chain/wallet";
import { WithdrawButton } from "@/features/worker/WithdrawButton";
import { ExternalWalletConnect } from "@/features/wallet/ExternalWalletConnect";
import { formatInr } from "@/lib/format";
import { PaymentModeBanner } from "@/features/shared/PaymentModeBanner";
import { TransactionsCard } from "@/features/shared/TransactionsCard";
import { getPaymentHistory } from "@/features/shared/paymentHistory";

export default async function EarningsPage() {
  const user = await requireRole("WORKER");
  const [{ pending, released, pendingTotal }, wallet, history] = await Promise.all([
    getWorkerEarnings(user.id),
    getWalletSummary(user.id), // provisions custodial + reads the live on-chain balance
    getPaymentHistory(user.id),
  ]);

  return (
    <div>
      <PageTitle action={<WithdrawButton />}>Earnings &amp; Wallet</PageTitle>
      <PaymentModeBanner />

      <div className="mb-4.5 grid grid-cols-2 gap-3.5 md:grid-cols-4">
        <StatCard
          label="Wallet balance"
          value={formatInr(wallet.balanceInr + wallet.demoCreditInr)}
          accent="bronze"
          sub={
            wallet.demoCreditInr > 0
              ? `incl. ${formatInr(wallet.demoCreditInr)} demo credit — not withdrawable`
              : wallet.live ? "live on-chain, in ₹" : "cached · chain offline"
          }
        />
        <StatCard label="Released to date" value={formatInr(released)} accent="emerald" />
        <StatCard label="Pending escrow" value={formatInr(pendingTotal)} accent="info" sub="held for you" />
        <StatCard label="Payout to" value={wallet.externalAddress ? "External" : "Custodial"} sub={wallet.externalAddress ? "your wallet" : "ChainWork wallet"} />
      </div>

      <div className="grid gap-3.5 lg:grid-cols-[1fr_1.6fr]">
        <div className="flex flex-col gap-3.5">
          <Card className="p-6">
            <h3 className="mb-3.5 text-[15px] font-semibold text-ink">Pending escrow, per phase</h3>
            {pending.length === 0 && <p className="text-sm text-ink3">Nothing pending.</p>}
            {pending.map((p) => {
              const d = phaseStatusDisplay(p.status);
              return (
                <div key={p.id} className="flex items-center justify-between border-b border-hair py-2.5 last:border-b-0">
                  <span>
                    <span className="block text-[13px] font-medium text-ink">{p.name}</span>
                    <span className="block text-[11px] text-ink3">{p.hireTitle}</span>
                  </span>
                  <span className="text-right">
                    <span className="block text-[13.5px] font-semibold text-[#8FC7E8]">{formatInr(Number(p.amount))}</span>
                    <span className="block text-[10.5px] text-ink3">{d.label}</span>
                  </span>
                </div>
              );
            })}
          </Card>

          {/* Custodial + external wallet */}
          <Card className="p-6">
            <h3 className="mb-1.5 text-[15px] font-semibold text-ink">Your wallet</h3>
            <p className="mb-3.5 font-mono text-[11px] text-ink3">{wallet.custodialAddress}</p>
            <ExternalWalletConnect linkedAddress={wallet.externalAddress} />
          </Card>
        </div>

        <TransactionsCard rows={history} />
      </div>
    </div>
  );
}
