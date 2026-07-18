"use client";

import { useEffect, useState } from "react";

/*
  The "Forge Complete" celebration that fires when a phase's escrow releases to the
  worker (spec Section 13 — payment lands the moment work is approved). A brief
  bronze/emerald spark-burst overlay. Auto-dismisses; respects reduced-motion.
*/
export function ForgeComplete({ show, onDone }: { show: boolean; onDone?: () => void }) {
  const [visible, setVisible] = useState(show);

  useEffect(() => {
    if (!show) return;
    setVisible(true);
    const t = setTimeout(() => {
      setVisible(false);
      onDone?.();
    }, 1900);
    return () => clearTimeout(t);
  }, [show, onDone]);

  if (!visible) return null;

  const sparks = Array.from({ length: 14 }, (_, i) => {
    const a = (i / 14) * Math.PI * 2;
    return {
      dx: `${Math.cos(a) * 90}px`,
      dy: `${Math.sin(a) * 90}px`,
      color: i % 2 ? "#FFC46B" : "#34E89A",
    };
  });

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative flex flex-col items-center">
        {/* spark burst */}
        <div className="pointer-events-none absolute left-1/2 top-8">
          {sparks.map((s, i) => (
            <span
              key={i}
              className="cw-spark absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full"
              style={{
                background: s.color,
                boxShadow: `0 0 8px ${s.color}`,
                ["--dx" as string]: s.dx,
                ["--dy" as string]: s.dy,
              }}
            />
          ))}
        </div>
        <div className="cw-forge-pop flex flex-col items-center gap-3 rounded-2xl border border-emerald/40 bg-card px-10 py-8 text-center shadow-2xl">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
            <rect x="2" y="8" width="12" height="8" rx="4" stroke="#34E89A" strokeWidth="1.4" />
            <rect x="10" y="8" width="12" height="8" rx="4" stroke="#D9A066" strokeWidth="1.4" />
          </svg>
          <div className="font-display text-2xl text-ink">Forged &amp; Released</div>
          <div className="text-sm text-ink2">Escrow released to the worker — on-chain.</div>
        </div>
      </div>
    </div>
  );
}
