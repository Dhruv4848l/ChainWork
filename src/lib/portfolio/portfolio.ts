import "server-only";
import { createPublicClient, erc20Abi, http, type PublicClient } from "viem";
import { CHAIN_ID, RPC_URL, TOKEN_ADDRESS } from "@/lib/chain/config";
import { MAINNETS, TESTNETS, cwInrToken, type NetworkDef } from "./networks";
import { sortHoldings, toHolding, totalInr, type Holding } from "./assets";
import { pricesInr } from "./prices";

/*
  The live wallet tracker's data (payment plan P5.1). For one address: native coin + the
  token allowlist on every supported network, ONE batched read per network (Multicall3),
  each network with its own timeout so a slow chain can't stall the rest. Only non-zero
  holdings come back. Results are cached 10 s per address.

  RPCs: Alchemy when ALCHEMY_API_KEY is set (no public rate limits), else public nodes.
  The escrow chain itself is read through the server's own CHAIN_RPC_URL.
*/

const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;
const CACHE_MS = 10_000;
const NETWORK_TIMEOUT_MS = 5_000;

/** Supported networks, with the escrow chain's own stablecoin (cwINR) attached. */
export function trackedNetworks(): NetworkDef[] {
  const nets = [...MAINNETS, ...TESTNETS].map((n) => ({ ...n, tokens: [...n.tokens] }));
  const app = nets.find((n) => n.chainId === CHAIN_ID);
  if (app) {
    if (TOKEN_ADDRESS) app.tokens.push(cwInrToken(TOKEN_ADDRESS));
  } else if (CHAIN_ID === 31337) {
    nets.push({
      key: "local", chainId: 31337, name: "ChainWork Local", tag: "Local · test", testnet: true, publicRpc: RPC_URL,
      tokens: [
        { symbol: "ETH", name: "Hardhat Ether", address: null, decimals: 18, priceId: null, icon: "/tokens/eth.svg" },
        ...(TOKEN_ADDRESS ? [cwInrToken(TOKEN_ADDRESS)] : []),
      ],
    });
  }
  return nets;
}

function rpcFor(net: NetworkDef): string {
  if (net.chainId === CHAIN_ID) return RPC_URL;
  const key = process.env.ALCHEMY_API_KEY;
  return key && net.alchemy ? `https://${net.alchemy}.g.alchemy.com/v2/${key}` : net.publicRpc;
}

const clients = new Map<number, PublicClient>();
function clientFor(net: NetworkDef): PublicClient {
  let c = clients.get(net.chainId);
  if (!c) {
    c = createPublicClient({ transport: http(rpcFor(net), { timeout: NETWORK_TIMEOUT_MS, retryCount: 1 }) }) as PublicClient;
    clients.set(net.chainId, c);
  }
  return c;
}

async function readNetwork(net: NetworkDef, address: `0x${string}`): Promise<{ token: (typeof net.tokens)[number]; raw: bigint }[]> {
  const client = clientFor(net);
  const erc20s = net.tokens.filter((t) => t.address);
  const nativeToken = net.tokens.find((t) => !t.address);
  const nativeP = nativeToken ? client.getBalance({ address }) : Promise.resolve(BigInt(0));
  const tokensP =
    erc20s.length === 0
      ? Promise.resolve([] as bigint[])
      : net.key === "local"
        ? // The local Hardhat node has no Multicall3 — read one by one.
          Promise.all(erc20s.map((t) => client.readContract({ address: t.address!, abi: erc20Abi, functionName: "balanceOf", args: [address] }).catch(() => BigInt(0))))
        : client
            .multicall({
              multicallAddress: MULTICALL3,
              allowFailure: true,
              contracts: erc20s.map((t) => ({ address: t.address!, abi: erc20Abi, functionName: "balanceOf" as const, args: [address] as const })),
            })
            .then((rs) => rs.map((r) => (r.status === "success" ? (r.result as bigint) : BigInt(0))));
  const [nativeRaw, tokenRaws] = await Promise.all([nativeP, tokensP]);
  return [
    ...(nativeToken ? [{ token: nativeToken, raw: nativeRaw }] : []),
    ...erc20s.map((token, i) => ({ token, raw: tokenRaws[i] ?? BigInt(0) })),
  ];
}

export interface Portfolio {
  address: string;
  holdings: Holding[];
  /** ≈ ₹ of real (mainnet) holdings only. */
  totalInr: number;
  /** Networks that couldn't be read this time (shown as a quiet note, never an error). */
  unavailable: string[];
  pricesStale: boolean;
  updatedAt: string;
}

const cache = new Map<string, { at: number; value: Portfolio }>();

export async function getPortfolio(address: `0x${string}`): Promise<Portfolio> {
  const key = address.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;

  const nets = trackedNetworks();
  const ids = [...new Set(nets.flatMap((n) => n.tokens.map((t) => t.priceId).filter((x): x is string => Boolean(x))))];
  const [{ prices, stale }, reads] = await Promise.all([
    pricesInr(ids),
    Promise.allSettled(nets.map((n) => readNetwork(n, address))),
  ]);

  const holdings: Holding[] = [];
  const unavailable: string[] = [];
  reads.forEach((r, i) => {
    if (r.status === "rejected") {
      unavailable.push(nets[i].name);
      return;
    }
    for (const { token, raw } of r.value) {
      const h = toHolding(nets[i], token, raw, prices);
      if (h) holdings.push(h);
    }
  });

  const sorted = sortHoldings(holdings);
  const value: Portfolio = { address, holdings: sorted, totalInr: totalInr(sorted), unavailable, pricesStale: stale, updatedAt: new Date().toISOString() };
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  return value;
}
