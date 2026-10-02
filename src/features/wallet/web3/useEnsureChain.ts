"use client";

import { useConnection, useSwitchChain } from "wagmi";
import { useChainInfo } from "./WalletProvider";

/*
  Network handling (payment plan P4.3 / E2). `wrongNetwork` drives a blocking banner;
  `ensure()` asks the wallet to switch — wagmi falls back to wallet_addEthereumChain
  (with this chain's RPC + explorer) when the wallet doesn't know the network yet.
*/
export function useEnsureChain() {
  const info = useChainInfo();
  const { chainId, isConnected } = useConnection();
  const { switchChainAsync, isPending } = useSwitchChain();
  const wrongNetwork = isConnected && chainId !== info.id;
  async function ensure(): Promise<void> {
    if (chainId !== info.id) await switchChainAsync({ chainId: info.id });
  }
  return { wrongNetwork, ensure, switching: isPending, targetName: info.name, targetId: info.id };
}
