"use client";

import { useState } from "react";
import { useConnect, useConnectors, type Connector } from "wagmi";
import { walletErrorMessage } from "./walletErrors";
import { useChainInfo } from "./WalletProvider";

/*
  Wallet picker (payment plan P4.2 / E1, E6). Lists every wallet the browser announced via
  EIP-6963 — each with its own name and icon — plus WalletConnect (QR / mobile) when a
  project id is configured. The generic "Injected" entry only shows when no wallet
  announced itself (old extensions).
*/

function ordered(connectors: readonly Connector[]): Connector[] {
  const announced = connectors.filter((c) => c.type === "injected" && c.id !== "injected");
  const generic = connectors.filter((c) => c.id === "injected");
  const others = connectors.filter((c) => c.type !== "injected");
  return [...announced, ...(announced.length ? [] : generic), ...others];
}

function label(c: Connector): string {
  if (c.id === "injected") return "Browser wallet";
  if (c.type === "walletConnect") return "WalletConnect";
  return c.name;
}

function hint(c: Connector): string {
  if (c.type === "walletConnect") return "QR code · mobile wallets";
  if (c.id === "injected") return "extension";
  return "installed";
}

export function WalletPicker({ onError }: { onError?: (msg: string) => void }) {
  const info = useChainInfo();
  const connectors = ordered(useConnectors());
  const { connectAsync, isPending, variables } = useConnect();
  const [error, setError] = useState<string | null>(null);

  async function pick(connector: Connector) {
    setError(null);
    try {
      await connectAsync({ connector, chainId: info.id });
    } catch (e) {
      const msg = walletErrorMessage(e, { networkName: info.name });
      setError(msg);
      onError?.(msg);
    }
  }

  const noWallets = connectors.length === 0 || (connectors.length === 1 && connectors[0].id === "injected" && typeof window !== "undefined" && !("ethereum" in window));

  return (
    <div className="flex flex-col gap-2">
      {connectors.map((c) => {
        const busy = isPending && variables?.connector && "id" in variables.connector && variables.connector.id === c.id;
        return (
          <button
            key={c.uid}
            onClick={() => pick(c)}
            disabled={isPending}
            className="flex items-center justify-between gap-3 rounded-lg border border-line-strong px-4 py-3 text-left text-[13.5px] font-medium text-ink hover:border-bronze disabled:opacity-60"
          >
            <span className="flex items-center gap-2.5">
              {c.icon ? (
                // eslint-disable-next-line @next/next/no-img-element -- EIP-6963 icons are data: URIs supplied by the wallet
                <img src={c.icon} alt="" width={20} height={20} className="h-5 w-5 rounded" />
              ) : (
                <span aria-hidden className="inline-block h-5 w-5 rounded bg-card2" />
              )}
              {label(c)}
            </span>
            <span className="text-[11px] text-ink3">{busy ? "check your wallet…" : hint(c)}</span>
          </button>
        );
      })}
      {!info.walletConnectProjectId && (
        <p className="text-[11px] text-ink3">On a phone or Safari? WalletConnect (QR) is coming once it&apos;s configured for this site.</p>
      )}
      {noWallets && (
        <p className="text-xs text-ink3">
          No browser wallet found. Install{" "}
          <a href="https://metamask.io/download/" target="_blank" rel="noreferrer" className="text-bronze hover:underline">MetaMask</a> or{" "}
          <a href="https://www.coinbase.com/wallet/downloads" target="_blank" rel="noreferrer" className="text-bronze hover:underline">Coinbase Wallet</a>.
        </p>
      )}
      {error && <p className="text-xs text-ember">{error}</p>}
    </div>
  );
}
