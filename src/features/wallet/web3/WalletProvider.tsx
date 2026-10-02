"use client";

import { createContext, useContext, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, cookieToInitialState } from "wagmi";
import type { PublicChainInfo } from "@/lib/chain/publicChain";
import { makeWagmiConfig } from "./wagmiConfig";

/*
  Wallet context for the worker / client dashboards only (payment plan P4.1 — the public
  site and the admin console never load wallet code). `cookie` is the request's Cookie
  header, so the server render already knows a reconnecting wallet.
*/

const ChainInfoContext = createContext<PublicChainInfo | null>(null);

export function useChainInfo(): PublicChainInfo {
  const info = useContext(ChainInfoContext);
  if (!info) throw new Error("useChainInfo must be used inside <WalletProvider>");
  return info;
}

export function WalletProvider({ chain, cookie, children }: { chain: PublicChainInfo; cookie: string | null; children: React.ReactNode }) {
  const [config] = useState(() => makeWagmiConfig(chain));
  const [queryClient] = useState(() => new QueryClient());
  const initialState = cookieToInitialState(config, cookie);
  return (
    <ChainInfoContext.Provider value={chain}>
      <WagmiProvider config={config} initialState={initialState} reconnectOnMount>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </WagmiProvider>
    </ChainInfoContext.Provider>
  );
}
