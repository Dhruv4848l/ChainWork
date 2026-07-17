import Link from "next/link";
import { Button, ThemeToggle } from "@/components/ui";

/*
  Placeholder home page. The real cinematic marketing site (PUB-01) is built in Phase 3.
  For now this is a minimal branded landing that confirms the design system + theming
  work and links to the component preview.
*/
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <div className="absolute right-6 top-6">
        <ThemeToggle />
      </div>

      <span className="mb-6 font-display text-lg tracking-[0.3em] text-bronze">
        CHAINWORK
      </span>
      <h1 className="max-w-2xl font-display text-6xl leading-none text-ink sm:text-7xl">
        Work,
        <br />
        Forged in Trust
      </h1>
      <p className="mt-6 max-w-md text-sm text-ink2">
        Blockchain-backed escrow, verified identities, and peer-jury dispute
        resolution for daily-wage and gig labor.
      </p>

      <div className="mt-10 flex items-center gap-3">
        <Link href="/components-preview">
          <Button variant="primary">View design system</Button>
        </Link>
      </div>

      <p className="mt-8 text-xs text-ink3">
        Phase 0 — foundation. Marketing site arrives in Phase 3.
      </p>
    </main>
  );
}
