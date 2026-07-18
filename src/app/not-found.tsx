import Link from "next/link";
import { PublicNav } from "@/features/public/PublicNav";
import { PublicFooter } from "@/features/public/PublicFooter";

/*
  PUB-11 — 404. Uses the public chrome so a mistyped URL still feels like the site.
*/
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicNav variant="solid" />
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
        <div className="font-display text-[120px] leading-none text-bronze">404</div>
        <p className="mb-8 mt-4 text-base font-light text-ink2">
          This page doesn&apos;t exist — but plenty of work does.
        </p>
        <Link
          href="/"
          className="rounded-full bg-bronze px-8 py-3.5 text-xs font-semibold uppercase tracking-wider text-[#1a1512] hover:bg-bronze-hover"
        >
          Back to home
        </Link>
      </main>
      <PublicFooter variant="slim" />
    </div>
  );
}
