import Link from "next/link";
import { Logo } from "./Logo";

/*
  Public footer. "full" = the tall home-page footer with link columns;
  "slim" = the one-line footer on inner pages. Both carry the small,
  de-emphasized "Platform admin" link to /admin/login (built in Phase 10).
*/
export function PublicFooter({ variant = "full" }: { variant?: "full" | "slim" }) {
  if (variant === "slim") {
    return (
      <footer className="flex items-center justify-between border-t border-line px-6 py-8">
        <span className="text-xs text-ink3">© 2026 ChainWork</span>
        <Link href="/admin/login" className="text-[11px] text-ink3 hover:text-ink2">
          Platform admin
        </Link>
      </footer>
    );
  }

  return (
    <footer className="border-t border-line px-6 pb-10 pt-16">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-8 md:grid-cols-[2fr_1fr_1fr_1fr]">
          <div>
            <Logo size={20} />
            <p className="mt-4 max-w-xs text-sm font-light leading-relaxed text-ink3">
              Local work, locked in escrow, settled by peers.
            </p>
          </div>
          <FooterCol
            title="Platform"
            links={[
              ["Find Work", "/signup"],
              ["Post a Job", "/signup"],
              ["Pricing", "/pricing"],
            ]}
          />
          <FooterCol
            title="Company"
            links={[
              ["About", "/about"],
              ["Blog", "/blog"],
              ["Contact", "/contact"],
            ]}
          />
          <FooterCol
            title="Legal"
            links={[
              ["Terms", "/legal"],
              ["Privacy", "/legal"],
            ]}
          />
        </div>
        <div className="mt-14 flex items-center justify-between border-t border-line pt-6">
          <span className="text-xs text-ink3">© 2026 ChainWork</span>
          <Link href="/admin/login" className="text-[11px] text-ink3 hover:text-ink2">
            Platform admin
          </Link>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div className="flex flex-col gap-2.5">
      <span className="mb-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-ink3">
        {title}
      </span>
      {links.map(([label, href]) => (
        <Link key={label} href={href} className="text-sm text-ink2 hover:text-bronze">
          {label}
        </Link>
      ))}
    </div>
  );
}
