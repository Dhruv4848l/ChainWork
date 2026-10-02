import type { NetworkDef, TokenDef } from "./networks";

/*
  Turning raw balances into the holdings list (payment plan P5.1). Pure + tested.
*/

export interface Holding {
  symbol: string;
  name: string;
  network: string;
  /** Network tag for the ticker ("Polygon", "Amoy · test"). */
  tag: string;
  chainId: number;
  testnet: boolean;
  /** Human amount as a decimal string, trimmed (no float rounding). */
  amount: string;
  decimals: number;
  icon: string;
  /** ≈ ₹ value; null when there's no market price (test coins). */
  inrValue: number | null;
}

/** Exact decimal string from base units: 1234500n, 6 → "1.2345". */
export function formatUnits(raw: bigint, decimals: number): string {
  const neg = raw < BigInt(0);
  const abs = neg ? -raw : raw;
  const base = BigInt(10) ** BigInt(decimals);
  const whole = abs / base;
  const frac = (abs % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole}${frac ? "." + frac : ""}`;
}

export function toHolding(net: NetworkDef, token: TokenDef, raw: bigint, pricesInr: Record<string, number>): Holding | null {
  if (raw <= BigInt(0)) return null; // non-zero holdings only
  const amount = formatUnits(raw, token.decimals);
  const unitInr = token.fixedInr ?? (token.priceId ? pricesInr[token.priceId] : undefined);
  const inrValue = unitInr != null ? Math.round(Number(amount) * unitInr * 100) / 100 : null;
  return {
    symbol: token.symbol, name: token.name, network: net.name, tag: net.tag, chainId: net.chainId,
    testnet: net.testnet, amount, decimals: token.decimals, icon: token.icon,
    // Testnet coins have no value — except cwINR, which is pegged ₹1 by design (shown as "test").
    inrValue: net.testnet && token.fixedInr == null ? null : inrValue,
  };
}

/** Real money first (largest ₹ first), then test balances. */
export function sortHoldings(h: Holding[]): Holding[] {
  return [...h].sort((a, b) => Number(a.testnet) - Number(b.testnet) || (b.inrValue ?? -1) - (a.inrValue ?? -1) || a.symbol.localeCompare(b.symbol));
}

/** Total ₹ of REAL (mainnet) holdings — test balances never count. */
export function totalInr(h: Holding[]): number {
  return Math.round(h.reduce((s, x) => s + (!x.testnet && x.inrValue ? x.inrValue : 0), 0) * 100) / 100;
}
