/*
  Shared formatting helpers (safe on server and client).
*/
const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export function formatInr(n: number | string): string {
  return inr.format(Number(n));
}

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function shortDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/** Truncate an on-chain hash for display (0x1234…abcd). */
export function shortHash(hash: string | null | undefined): string {
  if (!hash) return "—";
  return hash.length > 12 ? `${hash.slice(0, 6)}…${hash.slice(-4)}` : hash;
}
