/*
  The maths behind the rolling WalletTicker (payment plan P5.4). Pure + tested
  (tickerMath.test.ts): what to display, how old and new amounts line up digit by digit
  for the odometer, and the random spin each symbol letter takes.
*/

/** A short amount for the ticker: "2", "0.0523", "1,250.5", "0.00001234". */
export function displayAmount(amount: string): string {
  const n = Number(amount);
  if (!Number.isFinite(n) || n === 0) return "0";
  if (Math.abs(n) >= 1000) return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n);
  if (Math.abs(n) >= 1) return String(Number(n.toFixed(4)));
  // Below 1: keep 4 significant digits so tiny balances don't read as 0 (never exponent form).
  const p = n.toPrecision(4);
  return p.includes("e") ? n.toFixed(12).replace(/0+$/, "") : String(Number(p));
}

export interface DigitColumn {
  from: string;
  to: string;
  /** Digit columns roll; separators (",", ".", " ") just swap. */
  rolls: boolean;
}

/**
 * Line two numbers up at the decimal point so each column rolls from the digit it had to
 * the digit it gets ("2" → "50": the units roll 2→0, a new tens column rolls in from blank).
 */
export function alignDigits(from: string, to: string): DigitColumn[] {
  const split = (s: string) => {
    const i = s.indexOf(".");
    return i < 0 ? [s, ""] : [s.slice(0, i), s.slice(i)];
  };
  const [fi, ff] = split(from);
  const [ti, tf] = split(to);
  const w = Math.max(fi.length, ti.length);
  const fw = Math.max(ff.length, tf.length);
  const a = fi.padStart(w, " ") + ff.padEnd(fw, " ");
  const b = ti.padStart(w, " ") + tf.padEnd(fw, " ");
  return Array.from(b).map((ch, i) => ({ from: a[i], to: ch, rolls: /\d/.test(ch) || /\d/.test(a[i]) }));
}

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export interface LetterSpin {
  /** Characters the slot scrolls through, ending on the target letter. */
  frames: string[];
  /** 1 = rolls upward, -1 = downward (random per letter). */
  dir: 1 | -1;
  delayMs: number;
}

/** Each letter of the next symbol spins through random glyphs, in a random direction, staggered. */
export function spinLetters(to: string, rng: () => number = Math.random, length = Math.max(1, to.length)): LetterSpin[] {
  return Array.from({ length }, (_, i) => {
    const target = to[i] ?? " ";
    const n = 5 + Math.floor(rng() * 5);
    const frames = Array.from({ length: n }, () => GLYPHS[Math.floor(rng() * GLYPHS.length)]);
    frames.push(target);
    return { frames, dir: rng() < 0.5 ? 1 : -1, delayMs: i * 60 + Math.floor(rng() * 80) };
  });
}

/** "≈ ₹1,23,456" / "test" / "" — the line under the ticker amount. */
export function inrLine(inrValue: number | null, testnet: boolean): string {
  if (inrValue == null) return testnet ? "test · no value" : "";
  const v = new Intl.NumberFormat("en-IN", { maximumFractionDigits: inrValue < 1000 ? 2 : 0 }).format(inrValue);
  return `≈ ₹${v}${testnet ? " (test)" : ""}`;
}
