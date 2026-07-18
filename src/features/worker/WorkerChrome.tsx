"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { ThemeToggle } from "@/components/ui";
import { logoutAction } from "@/features/auth/actions";
import { formatInr } from "@/lib/format";
import { ToastProvider } from "@/features/shared/Toast";

/*
  Worker dashboard shell: left sidebar + top bar (wallet chip, notifications,
  profile) on desktop; a hamburger-drawer under 768px. Wraps every WK screen.
*/

const NAV: [string, string][] = [
  ["Dashboard", "/dashboard/worker"],
  ["Find Jobs", "/dashboard/worker/find-jobs"],
  ["Applications", "/dashboard/worker/applications"],
  ["My Rates", "/dashboard/worker/rates"],
  ["Active Hires", "/dashboard/worker/hires"],
  ["Earnings & Wallet", "/dashboard/worker/earnings"],
  ["Messages", "/dashboard/worker/messages"],
  ["Reviews", "/dashboard/worker/reviews"],
  ["My Posts", "/dashboard/worker/posts"],
  ["Notifications", "/dashboard/worker/notifications"],
  ["Complaints", "/dashboard/worker/complaint"],
  ["Settings", "/dashboard/worker/settings"],
];

export function WorkerChrome({
  name,
  kycTier,
  walletBalance,
  unreadCount = 0,
  children,
}: {
  name: string;
  kycTier: string;
  walletBalance: number;
  unreadCount?: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  const [tokenView, setTokenView] = useState(false);
  const [, startLogout] = useTransition();

  const isActive = (href: string) =>
    href === "/dashboard/worker"
      ? pathname === href
      : pathname === href || pathname.startsWith(href + "/");

  const NavList = ({ onNavigate }: { onNavigate?: () => void }) => (
    <nav className="flex flex-col gap-0.5 px-2.5 pb-5">
      {NAV.map(([label, href]) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={`flex items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-[13.5px] transition-colors ${
              active
                ? "bg-bronze/12 font-semibold text-bronze"
                : "font-normal text-ink2 hover:bg-bronze/[0.08]"
            }`}
          >
            <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${active ? "bg-bronze" : "bg-transparent"}`} />
            {label}
          </Link>
        );
      })}
    </nav>
  );

  const walletChip = tokenView
    ? `${walletBalance.toLocaleString("en-IN")} cwUSD`
    : formatInr(walletBalance);

  return (
    <div className="flex min-h-screen bg-bg">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-[230px] flex-shrink-0 flex-col overflow-y-auto border-r border-line bg-card md:flex">
        <Link href="/" className="flex items-center gap-2.5 px-5 pb-4 pt-6 text-ink">
          <ChainMark />
          <span className="font-display text-lg tracking-[0.1em]">CHAINWORK</span>
        </Link>
        <div className="px-5 pb-2.5 text-[10px] font-semibold uppercase tracking-wider text-ink3">
          Worker
        </div>
        <NavList />
        <div className="mt-auto border-t border-line px-5 py-4">
          <button
            onClick={() => startLogout(() => logoutAction())}
            className="text-xs text-ink3 hover:text-bronze"
          >
            Log out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-20 flex items-center gap-4 border-b border-line bg-bg px-5 py-3.5">
          <button
            onClick={() => setDrawer(true)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-line-strong text-ink md:hidden"
            aria-label="Menu"
          >
            ☰
          </button>
          <input
            aria-label="Search jobs, hires, messages"
            placeholder="Search jobs, hires, messages…"
            className="hidden max-w-md flex-1 rounded-full border border-line bg-card px-4 py-2.5 text-[13.5px] text-ink placeholder:text-ink3 focus:border-bronze focus:outline-none sm:block"
          />
          <div className="ml-auto flex items-center gap-3">
            <button
              onClick={() => setTokenView((v) => !v)}
              title="Toggle token view"
              className="flex items-center gap-2 rounded-full border border-bronze/35 bg-card px-4 py-2 text-[13px] font-semibold text-bronze"
            >
              <ChainMark size={14} />
              {walletChip}
            </button>
            <Link
              href="/dashboard/worker/notifications"
              className="relative flex h-9 w-9 items-center justify-center rounded-full border border-line bg-card text-ink2"
              aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : "Notifications"}
            >
              🔔
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-ember px-1 text-[9px] font-bold text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Link>
            <ThemeToggle />
            <Link href="/dashboard/worker/profile" className="hidden text-left sm:block">
              <span className="block text-[13px] font-semibold text-ink">{name}</span>
              <span className="block text-[10px] font-semibold uppercase tracking-wider text-amber">
                {kycTier} tier
              </span>
            </Link>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1180px] flex-1 p-6">
          <ToastProvider>{children}</ToastProvider>
        </main>
      </div>

      {/* Mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-50 md:hidden" onClick={() => setDrawer(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <aside
            onClick={(e) => e.stopPropagation()}
            className="absolute left-0 top-0 flex h-full w-[260px] flex-col overflow-y-auto border-r border-line bg-card"
          >
            <div className="flex items-center justify-between px-5 pb-4 pt-6">
              <span className="font-display text-lg tracking-[0.1em] text-ink">CHAINWORK</span>
              <button onClick={() => setDrawer(false)} className="text-ink2">✕</button>
            </div>
            <NavList onNavigate={() => setDrawer(false)} />
            <div className="mt-auto border-t border-line px-5 py-4">
              <button onClick={() => startLogout(() => logoutAction())} className="text-xs text-ink3">
                Log out
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function ChainMark({ size = 19 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="2" y="8" width="12" height="8" rx="4" stroke="#D9A066" strokeWidth="1.4" />
      <rect x="10" y="8" width="12" height="8" rx="4" stroke="#D9A066" strokeWidth="1.4" />
    </svg>
  );
}
