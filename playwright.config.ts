import { defineConfig } from "@playwright/test";

/*
  End-to-end tests (payment plan P7) — the real app, an injected EIP-6963 test wallet
  (e2e/support/wallet.ts), fresh fixture accounts per run (e2e/support/setup.mts).

  LOCAL (default) — two production servers from ONE build, differing only in PAYMENT_MODE,
  plus the local Hardhat chain (CLAUDE.md "Running the app with the chain"):
    testnet  → http://localhost:3100   (every spec except *.demo.spec.ts)
    demo     → http://localhost:3101   (*.demo.spec.ts)
  Run: `npm run test:e2e` (builds first) or `npm run test:e2e:nobuild`.

  REMOTE — a deployed site, no local servers or chain:
    E2E_BASE_URL=https://… E2E_DATABASE_URL=<its platform DB, direct URL> npm run test:e2e:remote
  Fixture accounts are written into that database (example.com emails, phones that can't
  receive SMS). Runs wallet + receipts specs, and the demo spec when the site is in demo
  mode. E2E_VERCEL_BYPASS=<secret> for a protected Vercel preview.

  PW_CHROMIUM=<path to chrome.exe> uses an already-installed Chromium instead of the
  revision this Playwright version expects (`npx playwright install chromium`).
*/
const chromium = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};
const remote = process.env.E2E_BASE_URL?.replace(/\/+$/, "");
const bypass = process.env.E2E_VERCEL_BYPASS ? { "x-vercel-protection-bypass": process.env.E2E_VERCEL_BYPASS } : undefined;

const server = (port: number, mode: "testnet" | "demo") => ({
  command: `npx next start -p ${port}`,
  url: `http://localhost:${port}/login`,
  reuseExistingServer: !process.env.CI,
  timeout: 180_000,
  env: { PAYMENT_MODE: mode, MOCK_BLOCKCHAIN: "", APP_BASE_URL: `http://localhost:${port}` },
});

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    viewport: { width: 1280, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: chromium,
    extraHTTPHeaders: bypass,
  },
  projects: remote
    ? [{ name: "remote", testMatch: /(wallet|receipts|checkout\.demo)\.spec\.ts$/, use: { baseURL: remote } }]
    : [
        { name: "testnet", testIgnore: /\.demo\.spec\.ts$/, use: { baseURL: "http://localhost:3100" } },
        { name: "demo", testMatch: /\.demo\.spec\.ts$/, use: { baseURL: "http://localhost:3101" } },
      ],
  webServer: remote ? undefined : [server(3100, "testnet"), server(3101, "demo")],
});
