/*
  Quote arithmetic for the multi-crypto payment window (payment plan P6.2). Pure + tested
  (quote.test.ts). Amounts are exact base units (bigint); rates are ₹ per 1 whole unit.
*/

/** How long a quoted price is held for the payer. */
export const QUOTE_TTL_MS = 5 * 60_000;

/** Slippage the server tolerates between the quote and what actually arrives on-chain. */
export const QUOTE_TOLERANCE_BPS = 100; // 1 %

const SCALE = 10n ** 18n; // fixed-point for the rate

/** Base units of an asset worth `amountInr`, rounded UP so the worker is never short. */
export function assetAmountFor(amountInr: number, inrPerUnit: number, decimals: number): bigint {
  if (!(amountInr > 0) || !(inrPerUnit > 0)) throw new Error("Amount and rate must be positive.");
  const paise = BigInt(Math.round(amountInr * 100));
  const ratePaiseScaled = BigInt(Math.round(inrPerUnit * 100 * 1e6)) * (SCALE / 10n ** 6n); // paise per unit, ×1e18
  const unit = 10n ** BigInt(decimals);
  // units = paise / ratePaise  →  base = paise × unit × 1e18 / ratePaiseScaled
  const num = paise * unit * SCALE;
  return (num + ratePaiseScaled - 1n) / ratePaiseScaled;
}

/** True when `paid` covers the quote within the tolerance (underpayment beyond it is refused). */
export function meetsQuote(paid: bigint, quoted: bigint, toleranceBps = QUOTE_TOLERANCE_BPS): boolean {
  return paid * 10_000n >= quoted * BigInt(10_000 - toleranceBps);
}

export function quoteExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return now.getTime() >= expiresAt.getTime();
}

/** Display a base-unit amount with up to `maxFrac` decimals (trims trailing zeros). */
export function formatAsset(raw: bigint, decimals: number, maxFrac = 6): string {
  const unit = 10n ** BigInt(decimals);
  const whole = raw / unit;
  const frac = (raw % unit).toString().padStart(decimals, "0").slice(0, maxFrac).replace(/0+$/, "");
  return `${whole.toLocaleString("en-IN")}${frac ? "." + frac : ""}`;
}
