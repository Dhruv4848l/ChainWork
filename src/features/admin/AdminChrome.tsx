"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition } from "react";
import { ThemeToggle } from "@/components/ui";
import { adminLogoutAction } from "./actions";
import type { NavItem } from "@/lib/admin/roles";

/*
  Admin console shell — a distinct, isolated chrome (no consumer nav). Sidebar shows
  only the sections this admin's role can access; the top bar carries the role badge.
*/
export function AdminChrome({
  name,
  roleLabel,
  nav,
  children,
}: {
  name: string;
  roleLabel: string;
  nav: NavItem[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [, startLogout] = useTransition();

  // group by section, preserving order
  const sections: { name: string; items: NavItem[] }[] = [];
  for (const item of nav) {
    let s = sections.find((x) => x.name === item.section);
    if (!s) { s = { name: item.section, items: [] }; sections.push(s); }
    s.items.push(item);
  }
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <div className="flex min-h-screen bg-bg">
      <aside className="sticky top-0 hidden h-screen w-[240px] flex-shrink-0 flex-col overflow-y-auto border-r border-line bg-card md:flex">
        <div className="flex items-center gap-2.5 px-5 pb-1 pt-6 text-ink">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <rect x="2" y="8" width="12" height="8" rx="4" stroke="#D9A066" strokeWidth="1.4" />
            <rect x="10" y="8" width="12" height="8" rx="4" stroke="#D9A066" strokeWidth="1.4" />
          </svg>
          <span className="font-display text-lg tracking-[0.1em]">CHAINWORK</span>
        </div>
        <div className="px-5 pb-3 text-[10px] font-semibold uppercase tracking-wider text-ember">
          Operations Console
        </div>
        <nav className="flex flex-col gap-0.5 px-2.5 pb-5">
          {sections.map((s) => (
            <div key={s.name} className="mt-2">
              <div className="px-3 pb-1 pt-1 text-[9.5px] font-semibold uppercase tracking-wider text-ink3">{s.name}</div>
              {s.items.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    className={`block rounded-[9px] px-3 py-2 text-[13px] transition-colors ${active ? "bg-bronze/12 font-semibold text-bronze" : "text-ink2 hover:bg-bronze/[0.08]"}`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="mt-auto border-t border-line px-5 py-4">
          <button onClick={() => startLogout(() => adminLogoutAction())} className="text-xs text-ink3 hover:text-bronze">
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-line bg-bg px-6 py-3.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink3 md:hidden">
            ChainWork Ops
          </span>
          <div className="ml-auto flex items-center gap-3">
            <ThemeToggle />
            <div className="text-right">
              <span className="block text-[13px] font-semibold text-ink">{name}</span>
              <span className="block text-[10px] font-semibold uppercase tracking-wider text-bronze">{roleLabel}</span>
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1220px] flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
