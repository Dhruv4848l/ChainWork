import "server-only";
import { paymentMode } from "@/lib/payments/mode";

/*
  INR prices for the wallet tracker (payment plan P5.1 / QuoteService precursor).
  CoinGecko's free simple-price endpoint, server-side, cached 60 s. Set COINGECKO_API_KEY
  (a free "demo" key) to avoid shared rate limits. If CoinGecko is unreachable — or in
  demo mode — a fixed fallback table is used and the result is flagged `stale`, so the
  ticker never breaks; these are DISPLAY values only, never used to move money.
*/

const FALLBACK_INR: Record<string, number> = {
  ethereum: 300_000,
  "polygon-ecosystem-token": 20,
  binancecoin: 55_000,
  tether: 88,
  "usd-coin": 88,
  "wrapped-bitcoin": 9_000_000,
  bitcoin: 9_000_000,
  ripple: 220,
};

const TTL_MS = 60_000;
let cache: { at: number; prices: Record<string, number>; stale: boolean } | null = null;

export async function pricesInr(ids: string[]): Promise<{ prices: Record<string, number>; stale: boolean }> {
  if (paymentMode() === "demo") return { prices: FALLBACK_INR, stale: true };
  if (cache && Date.now() - cache.at < TTL_MS && ids.every((id) => id in cache!.prices)) return cache;
  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids.join(","))}&vs_currencies=inr`;
    const key = process.env.COINGECKO_API_KEY;
    const res = await fetch(url, {
      headers: key ? { "x-cg-demo-api-key": key, accept: "application/json" } : { accept: "application/json" },
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
    const body = (await res.json()) as Record<string, { inr?: number }>;
    const prices: Record<string, number> = { ...FALLBACK_INR };
    for (const id of ids) if (typeof body[id]?.inr === "number") prices[id] = body[id].inr!;
    cache = { at: Date.now(), prices, stale: false };
    return cache;
  } catch (e) {
    console.warn("[prices] CoinGecko unavailable, using fallback table:", (e as Error).message?.slice(0, 80));
    cache = { at: Date.now(), prices: { ...FALLBACK_INR, ...(cache?.prices ?? {}) }, stale: true };
    return cache;
  }
}
