import Link from "next/link";
import { ThemeToggle } from "@/components/ui";

/*
  Centered card layout used by every auth screen (AUTH-01..10). Matches the design
  pack: dark-first background, bronze wordmark, theme toggle top-right.
*/
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="absolute right-6 top-6">
        <ThemeToggle />
      </div>
      <Link
        href="/"
        className="mb-8 font-display text-lg tracking-[0.3em] text-bronze"
      >
        CHAINWORK
      </Link>
      {children}
    </main>
  );
}
