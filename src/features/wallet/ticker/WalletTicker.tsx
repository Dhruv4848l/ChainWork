"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Holding } from "@/lib/portfolio/assets";
import { alignDigits, displayAmount, inrLine, spinLetters, type DigitColumn, type LetterSpin } from "./tickerMath";

/*
  The rolling WalletTicker (payment plan P5.4). Cycles through the wallet's NON-ZERO
  holdings, ~3 s each:
    - symbol: every letter spins through random glyphs — up or down at random, staggered —
      and lands on the next symbol (BTC → ETH → POL…);
    - amount: odometer columns roll from the old digits to the new, each column in a random
      direction (2 → 5 → 50);
    - the coin icon crossfades; the network tag and ≈ ₹ value sit underneath.
  Pauses on hover / focus; a click opens the full holdings list (onOpen).
  Reduced motion → a plain crossfade. Screen readers get a static list (the animated part
  is aria-hidden), so nothing is announced every few seconds.
*/

const STEP_MS = 3_000;
const SPIN_MS = 650;

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/** One letter slot: a vertical strip of glyphs that slides to the target. */
function SpinSlot({ spin }: { spin: LetterSpin }) {
  const ref = useRef<HTMLSpanElement>(null);
  const n = spin.frames.length - 1;
  // dir 1 rolls upward (strip moves up to the last frame); dir -1 rolls downward.
  const frames = spin.dir === 1 ? spin.frames : [...spin.frames].reverse();
  const start = spin.dir === 1 ? 0 : -n;
  const end = spin.dir === 1 ? -n : 0;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.transition = "none";
    el.style.transform = `translateY(${start}em)`;
    void el.offsetHeight; // commit the start position before animating
    el.style.transition = `transform ${SPIN_MS}ms cubic-bezier(.2,.8,.2,1) ${spin.delayMs}ms`;
    el.style.transform = `translateY(${end}em)`;
  }, [spin, start, end]);
  return (
    <span className="inline-block h-[1em] overflow-hidden align-top leading-none">
      <span ref={ref} className="flex flex-col">
        {frames.map((c, i) => (
          <span key={i} className="block h-[1em] whitespace-pre leading-none">{c}</span>
        ))}
      </span>
    </span>
  );
}

const DIGITS = "01234567890123456789".split("");

/** One odometer column rolling from `from` to `to` through the digit strip. */
function DigitSlot({ col, dir, delayMs }: { col: DigitColumn; dir: 1 | -1; delayMs: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const isDigit = (c: string) => /\d/.test(c);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !isDigit(col.to)) return;
    const f = isDigit(col.from) ? Number(col.from) : 0;
    const t = Number(col.to);
    // Upward: index increases (wrap +10 if needed). Downward: start one lap later and decrease.
    const [a, b] = dir === 1 ? [f, t >= f ? t : t + 10] : [f + 10, t <= f ? t + 10 : t];
    el.style.transition = "none";
    el.style.transform = `translateY(${-a}em)`;
    void el.offsetHeight;
    el.style.transition = `transform ${SPIN_MS}ms cubic-bezier(.2,.8,.2,1) ${delayMs}ms`;
    el.style.transform = `translateY(${-b}em)`;
  }, [col, dir, delayMs]);
  if (!isDigit(col.to)) return <span className="inline-block whitespace-pre leading-none">{col.to === " " ? "" : col.to}</span>;
  return (
    <span className="inline-block h-[1em] overflow-hidden align-top leading-none tabular-nums">
      <span ref={ref} className="flex flex-col">
        {DIGITS.map((d, i) => (
          <span key={i} className="block h-[1em] leading-none">{d}</span>
        ))}
      </span>
    </span>
  );
}

export interface WalletTickerProps {
  holdings: Holding[];
  size?: "compact" | "large";
  onOpen?: () => void;
  loading?: boolean;
}

export function WalletTicker({ holdings, size = "large", onOpen, loading }: WalletTickerProps) {
  const reduced = usePrefersReducedMotion();
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const prev = useRef<{ symbol: string; amount: string } | null>(null);

  const count = holdings.length;
  const h = count ? holdings[i % count] : null;

  useEffect(() => {
    if (paused || count < 2) return;
    const t = setInterval(() => setI((x) => (x + 1) % count), STEP_MS);
    return () => clearInterval(t);
  }, [paused, count]);

  const amount = h ? displayAmount(h.amount) : "";
  // Recompute animations only when what's shown changes (new holding or new balance).
  const anim = useMemo(() => {
    if (!h) return null;
    const from = prev.current;
    const letters = spinLetters(h.symbol, Math.random, Math.max(h.symbol.length, from?.symbol.length ?? 0));
    const cols = alignDigits(from?.amount ?? amount.replace(/\d/g, "0"), amount);
    const dirs = cols.map(() => (Math.random() < 0.5 ? 1 : -1) as 1 | -1);
    return { letters, cols, dirs, key: `${h.symbol}|${h.chainId}|${amount}` };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [h?.symbol, h?.chainId, amount]);
  useEffect(() => {
    if (h) prev.current = { symbol: h.symbol, amount };
  }, [h, amount]);

  const big = size === "large";
  if (loading && !h) {
    return <div className={`cw-skeleton rounded-lg ${big ? "h-[68px] w-56" : "h-7 w-28"}`} aria-label="Loading wallet balances" />;
  }
  if (!h || !anim) {
    return <span className={`${big ? "text-sm" : "text-[11px]"} text-ink3`}>No balances on supported networks</span>;
  }

  const sr = (
    <ul className="sr-only">
      {holdings.map((x) => (
        <li key={`${x.chainId}-${x.symbol}`}>{`${x.amount} ${x.symbol} on ${x.network}${x.inrValue != null ? `, about ${inrLine(x.inrValue, x.testnet)}` : ""}`}</li>
      ))}
    </ul>
  );

  return (
    <button
      type="button"
      onClick={onOpen}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      aria-label={`Wallet holdings: ${count} asset${count === 1 ? "" : "s"}. Show all.`}
      className={`group flex items-center text-left focus-visible:outline-2 focus-visible:outline-bronze ${big ? "gap-3.5 rounded-xl" : "gap-2 rounded-full"}`}
    >
      {sr}
      <span aria-hidden className="contents">
        {/* eslint-disable-next-line @next/next/no-img-element -- local static token icons */}
        <img
          key={`${h.symbol}-${h.chainId}`}
          src={h.icon}
          alt=""
          width={big ? 40 : 20}
          height={big ? 40 : 20}
          className={`${big ? "h-10 w-10" : "h-5 w-5"} shrink-0 rounded-full animate-[cwTickerFade_400ms_ease-out]`}
        />
        <span className="flex flex-col">
          <span key={anim.key} className={`flex items-baseline gap-1.5 font-semibold text-ink ${big ? "text-[26px]" : "text-[13px]"} ${reduced ? "animate-[cwTickerFade_400ms_ease-out]" : ""}`}>
            <span className="flex tabular-nums">
              {reduced ? amount : anim.cols.map((c, k) => <DigitSlot key={k} col={c} dir={anim.dirs[k]} delayMs={k * 35} />)}
            </span>
            <span className={`flex ${big ? "text-[15px]" : "text-[11px]"} font-medium text-bronze`}>
              {reduced ? h.symbol : anim.letters.map((s, k) => <SpinSlot key={k} spin={s} />)}
            </span>
          </span>
          {big && (
            <span className="mt-0.5 flex gap-2 text-[11.5px] text-ink3">
              <span className="rounded-full border border-line px-1.5 py-px text-[10px] uppercase tracking-wider">{h.tag}</span>
              <span>{inrLine(h.inrValue, h.testnet)}</span>
            </span>
          )}
        </span>
        {count > 1 && big && (
          <span className="ml-1 flex gap-1" aria-hidden>
            {holdings.slice(0, 8).map((_, k) => (
              <span key={k} className={`h-1.5 w-1.5 rounded-full ${k === i % count ? "bg-bronze" : "bg-line-strong"}`} />
            ))}
          </span>
        )}
      </span>
    </button>
  );
}
