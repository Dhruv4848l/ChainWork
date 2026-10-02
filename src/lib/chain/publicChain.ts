import "server-only";
import { polygonAmoy } from "viem/chains";
import { CHAIN_ID, TOKEN_ADDRESS, TOKEN_DECIMALS } from "./config";

/*
  What the BROWSER needs to talk to the user's own wallet (payment plan P4): the chain to
  be on, a public RPC for reads, the explorer, the stablecoin to "add to wallet", and the
  WalletConnect project id. Built on the server from env and passed down as props.

  CHAIN_RPC_URL is never exposed — it may carry a private API key. The browser gets
  PUBLIC_CHAIN_RPC_URL, or the chain's public default.
*/

export interface PublicChainInfo {
  id: number;
  name: string;
  rpcUrl: string;
  explorerUrl: string | null;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  token: { address: `0x${string}`; symbol: string; decimals: number } | null;
  /** Reown / WalletConnect Cloud project id; null = WalletConnect (QR / mobile) disabled. */
  walletConnectProjectId: string | null;
  appName: string;
  appUrl: string;
}

export function publicChainInfo(): PublicChainInfo {
  const isAmoy = CHAIN_ID === polygonAmoy.id;
  const appUrl = (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  return {
    id: CHAIN_ID,
    name: isAmoy ? "Polygon Amoy" : CHAIN_ID === 31337 ? "ChainWork Local (Hardhat)" : `Chain ${CHAIN_ID}`,
    rpcUrl: process.env.PUBLIC_CHAIN_RPC_URL || (isAmoy ? polygonAmoy.rpcUrls.default.http[0] : "http://127.0.0.1:8545"),
    explorerUrl: isAmoy ? "https://amoy.polygonscan.com" : null,
    nativeCurrency: isAmoy ? polygonAmoy.nativeCurrency : { name: "Ether", symbol: "ETH", decimals: 18 },
    token: TOKEN_ADDRESS ? { address: TOKEN_ADDRESS, symbol: "cwINR", decimals: TOKEN_DECIMALS } : null,
    walletConnectProjectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID || process.env.WC_PROJECT_ID || null,
    appName: "ChainWork",
    appUrl,
  };
}
