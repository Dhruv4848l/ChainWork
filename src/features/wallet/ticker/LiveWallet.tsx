"use client";

import { useState } from "react";
import { useConnection } from "wagmi";
import { Card, Modal } from "@/components/ui";
import type { Holding } from "@/lib/portfolio/assets";
import { usePortfolio } from "./usePortfolio";
import { WalletTicker } from "./WalletTicker";
import { displayAmount, inrLine } from "./tickerMath";

/*
  Live wallet tracker placements (payment plan P5.5). Tracks the wallet connected in this
  browser, else the user's linked payout wallet. Hidden entirely when there's neither.
    - <LiveWalletCard>  — large, on WK-12 Earnings / CL-08 Payments
    - <TopBarTicker>    — compact, in the dashboard top bar (sm and up)
*/

function useTrackedAddress(linkedAddress?: string | null): string | null {
  const { address } = useConnection();
  return address ?? linkedAddress ?? null;
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function HoldingsPanel({ open, onClose, address, holdings, totalInr, unavailable, updatedAt, stale }: {
  open: boolean; onClose: () => void; address: string; holdings: Holding[]; totalInr: number; unavailable: string[]; updatedAt?: string; stale?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Wallet holdings">
      <p className="mb-3 text-xs text-ink3">
        <span className="font-mono">{short(address)}</span> · real holdings ≈ ₹{totalInr.toLocaleString("en-IN")}
        {updatedAt && <> · updated {new Date(updatedAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", second: "2-digit" })}</>}
      </p>
      {holdings.length === 0 && <p className="text-sm text-ink3">No balances on supported networks.</p>}
      <ul className="divide-y divide-hair">
        {holdings.map((h) => (
          <li key={`${h.chainId}-${h.symbol}`} className="flex items-center gap-3 py-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element -- local static token icons */}
            <img src={h.icon} alt="" width={28} height={28} className="h-7 w-7 rounded-full" />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium text-ink">{h.name}</span>
              <span className="block text-[11px] text-ink3">{h.network}{h.testnet ? " · test" : ""}</span>
            </span>
            <span className="text-right">
              <span className="block text-[13px] font-semibold tabular-nums text-ink">{displayAmount(h.amount)} {h.symbol}</span>
              <span className="block text-[11px] text-ink3">{inrLine(h.inrValue, h.testnet)}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] leading-relaxed text-ink3">
        Read-only view of public balances on Ethereum, Polygon and BNB Chain (plus test networks). Bitcoin and XRP appear as their wrapped
        tokens. Values are estimates{stale ? " (live prices unavailable — using reference rates)" : ""}; payments on ChainWork still follow the
        escrow rules.
        {unavailable.length > 0 && <> Couldn&apos;t reach: {unavailable.join(", ")} — retrying.</>}
      </p>
    </Modal>
  );
}

export function LiveWalletCard({ linkedAddress }: { linkedAddress?: string | null }) {
  const address = useTrackedAddress(linkedAddress);
  const { data, isLoading, isFetching } = usePortfolio(address);
  const [open, setOpen] = useState(false);
  if (!address) return null;
  return (
    <Card className="mb-3.5 p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-[15px] font-semibold text-ink">Your wallet, live</h3>
        <span className="flex items-center gap-1.5 text-[11px] text-ink3" title="Refreshes every 12 seconds while this tab is open">
          <span className={`h-1.5 w-1.5 rounded-full ${isFetching ? "bg-amber" : "bg-emerald"}`} aria-hidden />
          <span className="font-mono">{short(address)}</span>
        </span>
      </div>
      <WalletTicker holdings={data?.holdings ?? []} loading={isLoading} onOpen={() => setOpen(true)} />
      {data && (
        <HoldingsPanel
          open={open}
          onClose={() => setOpen(false)}
          address={address}
          holdings={data.holdings}
          totalInr={data.totalInr}
          unavailable={data.unavailable}
          updatedAt={data.updatedAt}
          stale={data.pricesStale}
        />
      )}
    </Card>
  );
}

export function TopBarTicker() {
  const address = useTrackedAddress(null); // top bar: only the wallet connected in this browser
  const { data, isLoading } = usePortfolio(address);
  const [open, setOpen] = useState(false);
  if (!address) return null;
  return (
    <div className="hidden items-center rounded-full border border-line bg-card px-3 py-1.5 sm:flex">
      <WalletTicker size="compact" holdings={data?.holdings ?? []} loading={isLoading} onOpen={() => setOpen(true)} />
      {data && (
        <HoldingsPanel
          open={open}
          onClose={() => setOpen(false)}
          address={address}
          holdings={data.holdings}
          totalInr={data.totalInr}
          unavailable={data.unavailable}
          updatedAt={data.updatedAt}
          stale={data.pricesStale}
        />
      )}
    </div>
  );
}
