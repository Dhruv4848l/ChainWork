import { defineChain, type Chain } from "viem";
import { cookieStorage, createConfig, createStorage, http, injected, type CreateConnectorFn } from "wagmi";
import { walletConnect } from "wagmi/connectors/walletConnect";
import type { PublicChainInfo } from "@/lib/chain/publicChain";

/*
  The wagmi config for the user's OWN wallet (payment plan P4.1). One chain — the one
  escrow runs on. Wallets are found three ways:
    - EIP-6963 discovery (multiInjectedProviderDiscovery): every installed extension
      (MetaMask, Coinbase, Rabby, Brave, OKX…) announces itself with its own name + icon;
    - a generic `injected` fallback for old extensions that don't announce;
    - WalletConnect (QR code / mobile deep link — Safari and phones) when a Reown
      project id is configured.
  Cookie storage keeps the connection across the server render (no flash of "disconnected").
*/

export function chainFromInfo(info: PublicChainInfo): Chain {
  return defineChain({
    id: info.id,
    name: info.name,
    nativeCurrency: info.nativeCurrency,
    rpcUrls: { default: { http: [info.rpcUrl] } },
    ...(info.explorerUrl ? { blockExplorers: { default: { name: "Explorer", url: info.explorerUrl } } } : {}),
    testnet: true,
  });
}

/**
 * WalletConnect's setup() opens its relay connection. wagmi runs connector setup when a
 * config is created — on the server too, once per request (each server render gets its
 * own config), which leaked a relay client + listeners per request (found in P7). The
 * connector stays in the list, so server and client render the same picker; it just
 * doesn't set itself up off the browser.
 */
function browserOnlySetup(fn: CreateConnectorFn): CreateConnectorFn {
  if (typeof window !== "undefined") return fn;
  return (config) => ({ ...fn(config), setup: undefined });
}

export function makeWagmiConfig(info: PublicChainInfo) {
  const chain = chainFromInfo(info);
  return createConfig({
    chains: [chain],
    transports: { [chain.id]: http(info.rpcUrl) },
    ssr: true,
    storage: createStorage({ storage: cookieStorage }),
    multiInjectedProviderDiscovery: true,
    connectors: [
      injected({ shimDisconnect: true }),
      ...(info.walletConnectProjectId
        ? [
            browserOnlySetup(walletConnect({
              projectId: info.walletConnectProjectId,
              showQrModal: true,
              metadata: {
                name: info.appName,
                description: "Link your wallet to receive ChainWork escrow payouts.",
                url: info.appUrl,
                icons: [`${info.appUrl}/icon.png`],
              },
            })),
          ]
        : []),
    ],
  });
}

export type ChainWorkWagmiConfig = ReturnType<typeof makeWagmiConfig>;

/*
  ONE config per page lifetime (per chain id). Creating a config sets up its connectors —
  WalletConnect opens a relay connection — so it must not be rebuilt on every mount
  (React dev double-invokes initialisers; layouts remount on navigation).
*/
const configs = new Map<string, ChainWorkWagmiConfig>();
export function getWagmiConfig(info: PublicChainInfo): ChainWorkWagmiConfig {
  const key = `${info.id}|${info.walletConnectProjectId ?? ""}|${info.rpcUrl}`;
  let c = configs.get(key);
  if (!c) {
    c = makeWagmiConfig(info);
    if (typeof window !== "undefined") configs.set(key, c); // never share a config across server requests
  }
  return c;
}
