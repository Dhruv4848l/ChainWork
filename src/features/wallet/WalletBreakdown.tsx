import type { WalletSummary } from "@/lib/chain/wallet";
import { formatInr } from "@/lib/format";

/*
  Wallet breakdown pieces (payment plan P3.2) shared by CL-08 Payments and WK-12
  Earnings: every balance a user has, shown separately instead of one blended number.
*/

/** The sub-line under the "Wallet balance" stat: what part of it can actually leave. */
export function walletSub(w: WalletSummary): string {
  if (!w.live) return "cached · chain offline";
  if (w.demoCreditInr > 0) return `${formatInr(w.withdrawableInr)} withdrawable · ${formatInr(w.demoCreditInr)} demo credit`;
  return `${formatInr(w.withdrawableInr)} withdrawable`;
}

/** Custodial + external wallet lines, each with its own balance. */
export function WalletAddresses({ wallet: w }: { wallet: WalletSummary }) {
  const payingExternal = w.externalAddress != null && w.payoutAddress.toLowerCase() === w.externalAddress.toLowerCase();
  return (
    <dl className="mb-3.5 grid gap-2.5 text-[12px]">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <dt className="text-ink2">
          ChainWork wallet <span className="text-ink3">(custodial)</span>
        </dt>
        <dd className="font-semibold text-ink">{formatInr(w.spendableInr)}</dd>
        <dd className="basis-full break-all font-mono text-[11px] text-ink3">{w.custodialAddress}</dd>
      </div>
      {w.externalAddress && (
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <dt className="text-ink2">
            Your linked wallet <span className="text-ink3">(self-custody)</span>
          </dt>
          <dd className="font-semibold text-ink">{w.externalInr == null ? "—" : formatInr(w.externalInr)}</dd>
          <dd className="basis-full break-all font-mono text-[11px] text-ink3">{w.externalAddress}</dd>
        </div>
      )}
      <div className="text-[11px] text-ink3">
        New escrow releases pay to your {payingExternal ? "linked wallet" : "ChainWork wallet"}.
      </div>
    </dl>
  );
}
