"use client";

import Link from "next/link";
import { useState } from "react";
import { Logo } from "./Logo";
import { ThemeToggle } from "@/components/ui";

/*
  Public site header. Two variants:
   - "hero"  : fixed, transparent glass (over the home cinematic hero)
   - "solid" : bordered, opaque (every other public page)
  Collapses to a hamburger drawer under md.
*/
const LINKS = [
  { href: "/jobs", label: "Jobs" },
  { href: "/categories", label: "Categories" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/blog", label: "Blog" },
];

export function PublicNav({ variant = "solid" }: { variant?: "hero" | "solid" }) {
  const [open, setOpen] = useState(false);
  const hero = variant === "hero";

  return (
    <header
      className={
        hero
          ? "fixed inset-x-0 top-0 z-50 backdrop-blur-sm"
          : "sticky top-0 z-50 border-b border-line bg-bg/95 backdrop-blur-sm"
      }
      style={
        hero
          ? { background: "linear-gradient(var(--bg-glass-a), var(--bg-glass-b))" }
          : undefined
      }
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Logo />

        {/* Desktop nav */}
        <nav className="hidden items-center gap-7 md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink2 transition-colors hover:text-bronze"
            >
              {l.label}
            </Link>
          ))}
          <ThemeToggle />
          <Link
            href="/login"
            className="rounded-full border border-line-strong px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink transition-colors hover:border-bronze"
          >
            Login
          </Link>
          <Link
            href="/signup"
            className="rounded-full bg-bronze px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#1a1512] transition-colors hover:bg-bronze-hover"
          >
            Get Started
          </Link>
        </nav>

        {/* Mobile toggle */}
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-line-strong text-ink md:hidden"
          aria-label="Menu"
        >
          {open ? "✕" : "☰"}
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="border-t border-line bg-card px-6 py-4 md:hidden">
          <div className="flex flex-col gap-3">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="text-sm font-medium text-ink2 hover:text-bronze"
              >
                {l.label}
              </Link>
            ))}
            <div className="mt-2 flex items-center gap-3">
              <Link
                href="/login"
                className="flex-1 rounded-full border border-line-strong px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-ink"
              >
                Login
              </Link>
              <Link
                href="/signup"
                className="flex-1 rounded-full bg-bronze px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-[#1a1512]"
              >
                Get Started
              </Link>
            </div>
            <div className="mt-1">
              <ThemeToggle />
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
