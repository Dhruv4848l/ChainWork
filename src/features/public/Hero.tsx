"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";

/*
  PUB-01 cinematic hero (slide 1). The Three.js scene is lazy-loaded (ssr:false) so
  the heavy WebGL bundle never blocks first paint — the text renders immediately and
  the sculpture fades in after. Degrades gracefully: if WebGL is unavailable or the
  user prefers reduced motion, we skip the canvas and keep the static bronze gradient.
*/
const HeroScene = dynamic(() => import("./HeroScene"), {
  ssr: false,
  loading: () => null,
});

function webglSupported(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext("webgl") || canvas.getContext("experimental-webgl"))
    );
  } catch {
    return false;
  }
}

export function Hero() {
  const [show3d, setShow3d] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setShow3d(webglSupported() && !reduced);
  }, []);

  return (
    <section
      className="relative flex min-h-screen items-center overflow-hidden"
      style={{
        background:
          "radial-gradient(ellipse 90% 60% at 50% 105%, rgba(217,160,102,.22), transparent 60%), var(--bg)",
      }}
    >
      {show3d && (
        <div className="absolute inset-0 z-[1] opacity-90">
          <HeroScene />
        </div>
      )}

      {/* Faint horizontal grid, as in the design. */}
      <div
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{
          backgroundImage: "linear-gradient(var(--w03) 1px, transparent 1px)",
          backgroundSize: "100% 25vh",
        }}
      />

      <div className="relative z-[2] mx-auto w-full max-w-6xl px-6 pb-20 pt-36">
        <p className="cw-fade-1 mb-7 text-[11px] font-semibold uppercase tracking-[0.2em] text-bronze">
          Blockchain-escrowed local hiring
        </p>
        <h1 className="cw-title-up m-0 mb-12 font-display text-[clamp(56px,9vw,116px)] leading-none text-ink">
          Work,
          <br />
          Forged in Trust
        </h1>
        <div className="cw-fade-2 grid max-w-3xl gap-8 sm:grid-cols-2">
          <p className="text-base font-light leading-relaxed text-ink2">
            Helpers, electricians, decorators, cooks, drivers — ChainWork connects
            people who need work done today with people ready to do it.
          </p>
          <p className="text-base font-light leading-relaxed text-ink2">
            Every hire is locked in a blockchain escrow the moment you agree — paid
            the moment the work is confirmed, not a day later.
          </p>
        </div>
        <div className="cw-fade-3 mt-14 flex flex-wrap gap-4">
          <Link
            href="/signup"
            className="rounded-full bg-bronze px-8 py-4 text-sm font-semibold text-[#1a1512] transition-transform hover:scale-[1.04] hover:bg-bronze-hover"
          >
            Find Work
          </Link>
          <Link
            href="/signup"
            className="rounded-full border border-line-strong px-8 py-4 text-sm font-medium text-ink transition-transform hover:scale-[1.04] hover:border-bronze"
          >
            Post a Job
          </Link>
        </div>
      </div>

      {/* progress ticks, bottom-left */}
      <div className="absolute bottom-8 left-6 z-[2] flex gap-2">
        <div className="h-0.5 w-8 bg-bronze" />
        <div className="h-0.5 w-8 bg-line-strong" />
      </div>
    </section>
  );
}
