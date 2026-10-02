import { defineConfig } from "@playwright/test";

/*
  End-to-end tests (payment plan P7) — the real app, the real local chain, an injected
  EIP-6963 test wallet (e2e/wallet.ts). Two production servers from ONE build, differing
  only in PAYMENT_MODE:

    testnet  → http://localhost:3100   (e2e/*.spec.ts)
    demo     → http://localhost:3101   (e2e/*.demo.spec.ts)

  Needs Postgres + `npx hardhat node` + contracts deployed (see CLAUDE.md "Running the app
  with the chain"). Run: `npm run test:e2e` (builds first) or `npm run test:e2e:nobuild`.
  PW_CHROMIUM=<path to chrome.exe> uses an already-installed Chromium instead of the
  revision this Playwright version expects (`npx playwright install chromium`).
*/
const chromium = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};

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
  },
  projects: [
    { name: "testnet", testIgnore: /\.demo\.spec\.ts$/, use: { baseURL: "http://localhost:3100" } },
    { name: "demo", testMatch: /\.demo\.spec\.ts$/, use: { baseURL: "http://localhost:3101" } },
  ],
  webServer: [server(3100, "testnet"), server(3101, "demo")],
});
