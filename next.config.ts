import type { NextConfig } from "next";

/*
  Security response headers (defense-in-depth). Added after the Phase-13 security
  review: the app previously sent none, leaving it framable (clickjacking) and
  without a CSP. `frame-ancestors 'none'` + X-Frame-Options block framing; the CSP
  constrains where scripts/styles/connections may come from.

  The CSP is deliberately dev-aware: Turbopack HMR needs 'unsafe-eval' and a
  websocket connection, which we allow only outside production. 'unsafe-inline'
  stays for now because the theme-init script (layout.tsx) and Next's bootstrap
  run inline; tighten to a nonce later (tracked in the security assessment).
*/
const isProd = process.env.NODE_ENV === "production";

/*
  User-wallet hosts (payment plan P4.6 / E7). The browser reads the escrow chain through
  its PUBLIC RPC (src/lib/chain/publicChain.ts — never the private CHAIN_RPC_URL), and
  WalletConnect / Reown AppKit needs its relay (wss), RPC, telemetry, the verify iframe,
  wallet images and fonts. EIP-6963 wallet icons are data: URIs (already allowed).
*/
const chainRpcOrigin = (() => {
  const url = process.env.PUBLIC_CHAIN_RPC_URL || (process.env.CHAIN_ID === "80002" ? "https://rpc-amoy.polygon.technology" : "http://127.0.0.1:8545");
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
})();
const WC_CONNECT = [
  "https://*.walletconnect.com", "https://*.walletconnect.org", "wss://relay.walletconnect.com", "wss://relay.walletconnect.org",
  "https://api.web3modal.org", "https://*.web3modal.org", "https://*.reown.com",
];
const WC_FRAMES = ["https://verify.walletconnect.com", "https://verify.walletconnect.org", "https://secure.walletconnect.org"];
const WC_IMAGES = ["https://api.web3modal.org", "https://*.walletconnect.com", "https://*.walletconnect.org"];

const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  `img-src 'self' data: blob: https://res.cloudinary.com ${WC_IMAGES.join(" ")}`,
  "font-src 'self' data: https://fonts.reown.com",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
  `connect-src 'self' ${chainRpcOrigin} ${WC_CONNECT.join(" ")}${isProd ? "" : " ws: wss:"}`,
  `frame-src ${WC_FRAMES.join(" ")}`,
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // HSTS is only meaningful over HTTPS; browsers ignore it on http://localhost.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

// Fonts the receipt / statement PDFs read at runtime (src/lib/receipts/pdfKit.ts).
const PDF_FONTS = [
  "./node_modules/@fontsource/outfit/files/outfit-latin-{400,600}-normal.woff",
  "./node_modules/@fontsource/noto-sans/files/noto-sans-devanagari-{400,600}-normal.woff",
];

const nextConfig: NextConfig = {
  // The floating dev badge sits on top of the sidebar's "Log out" button.
  devIndicators: false,
  // Make sure the serverless bundles for the PDF routes ship the fonts.
  outputFileTracingIncludes: Object.fromEntries(
    ["/api/receipts/**", "/api/statements/**"].map((route) => [route, PDF_FONTS]),
  ),
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
