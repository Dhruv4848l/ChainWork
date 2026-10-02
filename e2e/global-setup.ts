import { execSync } from "node:child_process";
import fs from "node:fs";
import { parseEnv } from "node:util";

/** Fresh fixture accounts + hires for this run (see e2e/support/setup.mts). */
export default function globalSetup() {
  runScript("e2e/support/setup.mts");
}

/**
 * Run a server-side helper script with the app's env (.env, then .env.local over it).
 * A remote run (E2E_BASE_URL) points the script at the deployed site's database instead
 * (E2E_DATABASE_URL) — applied last, so a local DATABASE_URL can never win.
 */
export function runScript(file: string, ...args: string[]): string {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const f of [".env", ".env.local"]) {
    if (fs.existsSync(f)) Object.assign(env, parseEnv(fs.readFileSync(f, "utf8")));
  }
  if (process.env.E2E_BASE_URL) {
    if (!process.env.E2E_DATABASE_URL) throw new Error("E2E_BASE_URL needs E2E_DATABASE_URL (the deployed site's platform database).");
    env.DATABASE_URL = process.env.E2E_DATABASE_URL;
  }
  return execSync(`npm run -s script -- ${file} ${args.join(" ")}`, { env, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
}
