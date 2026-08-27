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

const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob: https://res.cloudinary.com",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
  `connect-src 'self'${isProd ? "" : " ws: wss:"}`,
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

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
