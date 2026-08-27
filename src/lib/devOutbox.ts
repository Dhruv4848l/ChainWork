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

  SAFETY: this is a no-op unless NODE_ENV !== "production" AND the provider actually
  took the mock path. Real Twilio/Resend sends never reach here, and the file is in
  .gitignore. It is a dev convenience, not a feature.
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

function enabled(): boolean {
  return process.env.NODE_ENV !== "production";
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
