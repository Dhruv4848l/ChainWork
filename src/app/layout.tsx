import type { Metadata } from "next";
import { Italiana, Outfit } from "next/font/google";
import "./globals.css";

/*
  Fonts from the design pack:
  - Italiana  -> display / headings (serif, single weight 400)
  - Outfit    -> body / UI text
  next/font self-hosts them and exposes each as a CSS variable, which globals.css
  maps to Tailwind's `font-display` / `font-sans`.
*/
const italiana = Italiana({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-italiana",
  display: "swap",
});

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ChainWork — Work, Forged in Trust",
  description:
    "A blockchain-backed marketplace for daily-wage and gig labor: phase-based escrow, verified identities, and peer-jury dispute resolution.",
};

/*
  This tiny script runs BEFORE React hydrates and before first paint. It reads the
  saved theme from localStorage and stamps `data-cw-theme` on <html> immediately, so
  the page never flashes the wrong palette on load. Default is dark (the design is
  dark-first). `suppressHydrationWarning` on <html> tells React the attribute we set
  here intentionally differs from the server render.
*/
const themeInitScript = `(function(){try{var t=localStorage.getItem('cw-theme')||'dark';document.documentElement.setAttribute('data-cw-theme',t);}catch(e){document.documentElement.setAttribute('data-cw-theme','dark');}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${italiana.variable} ${outfit.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
