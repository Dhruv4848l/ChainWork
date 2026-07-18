import { Card, StatusBadge } from "@/components/ui";
import { PageTitle, StatCard } from "@/features/shared/dashboard-ui";
import { phaseStatusDisplay } from "@/features/shared/status";
import { requireRole } from "@/lib/auth/guards";
import { getWorkerEarnings } from "@/features/worker/queries";
import { getWalletSummary } from "@/lib/chain/wallet";
import { explorerTxBase } from "@/lib/chain/config";
import { WithdrawButton } from "@/features/worker/WithdrawButton";
import { ExternalWalletConnect } from "@/features/wallet/ExternalWalletConnect";
import { formatInr, shortDate, shortHash } from "@/lib/format";

const TX_STATUS_TONE = { CONFIRMED: "success", PENDING: "warning", FAILED: "danger" } as const;

export default async function EarningsPage() {
  const user = await requireRole("WORKER");
  const [{ pending, txs, released, pendingTotal }, wallet] = await Promise.all([
    getWorkerEarnings(user.id),
    getWalletSummary(user.id), // provisions custodial + reads the live on-chain balance
  ]);
  const explorer = explorerTxBase();

  return (
    <div>
      <PageTitle action={<WithdrawButton />}>Earnings &amp; Wallet</PageTitle>

      <div className="mb-4.5 grid grid-cols-2 gap-3.5 md:grid-cols-4">
        <StatCard label="Wallet balance" value={formatInr(wallet.balanceInr)} accent="bronze" sub="live on-chain, in ₹" />
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

        <Card className="overflow-hidden p-0">
          <div className="grid grid-cols-[1.6fr_1fr_1fr_1.4fr] gap-2.5 border-b border-line px-6 py-3.5 text-[10.5px] font-semibold uppercase tracking-wider text-ink3">
            <span>Transaction</span><span>Amount</span><span>Status</span><span>On-chain</span>
          </div>
          {txs.length === 0 && <p className="p-6 text-sm text-ink3">No transactions yet.</p>}
          {txs.map((t) => (
            <div key={t.id} className="grid grid-cols-[1.6fr_1fr_1fr_1.4fr] items-center gap-2.5 border-b border-hair px-6 py-3.5 last:border-b-0">
              <span>
                <span className="block text-[13px] font-medium text-ink">{t.type} · {t.phaseName}</span>
                <span className="block text-[11px] text-ink3">{shortDate(t.createdAt)}</span>
              </span>
              <span className="text-[13px] font-semibold text-bronze">{formatInr(Number(t.amount))}</span>
              <span><StatusBadge tone={TX_STATUS_TONE[t.status as keyof typeof TX_STATUS_TONE] ?? "draft"}>{t.status}</StatusBadge></span>
              {explorer && t.onChainTxHash ? (
                <a href={`${explorer}${t.onChainTxHash}`} target="_blank" rel="noreferrer" className="font-mono text-[11px] text-[#8FC7E8] hover:underline">
                  {shortHash(t.onChainTxHash)}
                </a>
              ) : (
                <span className="font-mono text-[11px] text-ink3" title="No explorer on the local chain">{shortHash(t.onChainTxHash)}</span>
              )}
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
