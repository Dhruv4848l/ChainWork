import Link from "next/link";

/*
  The ChainWork wordmark — two interlocking chain links (bronze) + "CHAINWORK" in
  Italiana, exactly as in the design pack header.
*/
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <Link href="/" className="flex items-center gap-2.5 text-ink">
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="2" y="8" width="12" height="8" rx="4" stroke="#D9A066" strokeWidth="1.4" />
        <rect x="10" y="8" width="12" height="8" rx="4" stroke="#D9A066" strokeWidth="1.4" />
      </svg>
      <span className="font-display text-xl tracking-[0.15em]">CHAINWORK</span>
    </Link>
  );
}
