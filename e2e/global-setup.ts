import { execSync } from "node:child_process";
import fs from "node:fs";
import { parseEnv } from "node:util";

/** Fresh fixture accounts + hires for this run (see e2e/support/setup.mts). */
export default function globalSetup() {
  runScript("e2e/support/setup.mts");
}

/** Run a server-side helper script with the app's env (.env, then .env.local over it). */
export function runScript(file: string, ...args: string[]): string {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const f of [".env", ".env.local"]) {
    if (fs.existsSync(f)) Object.assign(env, parseEnv(fs.readFileSync(f, "utf8")));
  }
  return execSync(`npm run -s script -- ${file} ${args.join(" ")}`, { env, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
}
