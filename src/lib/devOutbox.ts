import "server-only";
import fs from "node:fs";
import path from "node:path";

/*
  DEV OUTBOX — a local, gitignored mirror of every message the MOCK sms/email
  providers "send".

  Why it exists: in dev, OTP codes and email-verification links only appear in the
  server console, and the codes themselves are stored bcrypt-HASHED in the database
  (so they cannot be read back out). That makes the signup flow impossible to drive
  from an automated script or a second machine. This writes the same lines the
  console gets into `.dev-outbox.json` so `scripts/demo-capture.mjs` — and a human
  who'd rather not scroll a terminal — can pick the code up.

  SAFETY: this is a no-op unless the provider actually took the mock path AND either
  NODE_ENV !== "production", or DEV_OUTBOX=1 on a server whose APP_BASE_URL is localhost
  (`npm run demo:serve` — a local production build for scripted captures, which the
  webpack dev server is too flaky for). Real Twilio/Resend sends never reach here, and
  the file is in .gitignore. It is a dev convenience, not a feature.
*/

const FILE = path.join(process.cwd(), ".dev-outbox.json");
const MAX_ENTRIES = 100;

export interface OutboxEntry {
  at: string;
  channel: "sms" | "email";
  to: string;
  subject?: string;
  text: string;
  /** A 6-digit one-time code found in the message, if any. */
  code?: string;
  /** The first link in the message, if any. */
  link?: string;
}

function isLocalBase(): boolean {
  try {
    return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(process.env.APP_BASE_URL ?? "").hostname);
  } catch {
    return false;
  }
}

function enabled(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.DEV_OUTBOX === "1" && isLocalBase();
}

function readAll(): OutboxEntry[] {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8")) as OutboxEntry[];
  } catch {
    return [];
  }
}

/** Append a mock-delivered message to the dev outbox. Never throws. */
export function recordDevMessage(entry: Omit<OutboxEntry, "at">): void {
  if (!enabled()) return;
  try {
    const all = readAll();
    all.push({ at: new Date().toISOString(), ...entry });
    fs.writeFileSync(FILE, JSON.stringify(all.slice(-MAX_ENTRIES), null, 2), "utf8");
  } catch {
    /* the outbox is a convenience — never let it break a send */
  }
}
