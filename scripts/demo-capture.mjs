/* eslint-disable no-console */
/**
 * ChainWork — end-to-end demo capture.
 *
 * Drives the WHOLE story through a real browser against your running dev server and
 * saves a numbered screenshot at every step into docs/images/demo/, plus a
 * docs/demo-run.json of the real values it observed (addresses, tx hashes, balances,
 * the contract hash). docs/DEMO_WALKTHROUGH.md is written against those filenames.
 *
 *   Worker signs up (phone OTP + email link) → publishes experience & hourly/weekly
 *   charges → client (business) signs up the same way → posts an Android app job →
 *   worker applies → client builds a 5-phase payment plan → both digitally sign the
 *   contract → phase-by-phase: fund escrow, deliver, approve, release → one phase
 *   auto-releases when the client goes quiet → reviews → worker withdraws.
 *
 * PREREQUISITES (all four, in separate terminals):
 *   1. Postgres running, and migrations applied:  npm run db:generate && npx prisma migrate deploy --schema prisma/platform/schema.prisma
 *   2. Local chain:      cd contracts && npx hardhat node
 *   3. Contracts:        cd contracts && npx hardhat run scripts/deploy.js --network localhost
 *   4. The app:          npm run dev
 *
 * ONE-TIME SETUP:
 *   npm i -D playwright && npx playwright install chromium
 *
 * RUN:
 *   npm run demo:capture           # headless
 *   npm run demo:capture:headed    # watch it happen in a real window
 *
 * Re-runnable: every account gets a unique phone/email suffix, so nothing collides.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SHOT_DIR = path.join(ROOT, "docs", "images", "demo");
const OUTBOX = path.join(ROOT, ".dev-outbox.json");

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    const p = path.join(ROOT, file);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!m) continue;
      const key = m[1];
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  }
}
loadEnv();

/** Watch it happen in a real window: `npm run demo:capture:headed`. */
const HEADED = process.argv.includes("--headed") || Boolean(process.env.DEMO_HEADED);

const BASE = (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const RPC_URL = process.env.CHAIN_RPC_URL || "http://127.0.0.1:8545";
const CRON_SECRET = process.env.CRON_SECRET || "";

let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  console.error(
    "\nPlaywright isn't installed. Run:\n  npm i -D playwright && npx playwright install chromium\n"
  );
  process.exit(1);
}

let PrismaClient;
try {
  ({ PrismaClient } = require(path.join(ROOT, "src", "generated", "platform")));
} catch {
  console.error("\nPrisma client missing. Run:  npm run db:generate\n");
  process.exit(1);
}
const db = new PrismaClient();

// ---------------------------------------------------------------------------
// The cast and the job — fixed on purpose so the written walkthrough matches.
// ---------------------------------------------------------------------------
const RUN = Date.now().toString().slice(-7);

const WORKER = {
  name: "Aditya Raghavan",
  phone: `98${RUN}0`,
  email: `aditya.raghavan.${RUN}@demo.chainwork.dev`,
  password: "ChainWork!2026",
  headline: "Android developer · Kotlin & Jetpack Compose · 6 yrs",
  bio: "6 years building Android apps in Kotlin — Jetpack Compose, MVVM, Retrofit, Room, Firebase. 14 apps shipped to the Play Store, four of them retail/e-commerce. I work in fixed milestones and hand over source, CI config and a signed release build.",
  location: "Koramangala, Bengaluru",
  experienceYears: "6",
  rateHourly: "750",
  rateWeekly: "28000",
  languages: "English, Hindi, Kannada",
  skill: "Mobile App Development",
};

const CLIENT = {
  name: "Meridian Retail Labs",
  signupName: "Meridian Retail Labs",
  phone: `97${RUN}1`,
  email: `ops.meridian.${RUN}@demo.chainwork.dev`,
  password: "ChainWork!2026",
  companyName: "Meridian Retail Labs Pvt Ltd",
  regNumber: "U52100KA2021PTC148802",
  address: "Indiranagar, Bengaluru",
};

const JOB = {
  title: "Android app — Meridian Retail customer ordering app (Kotlin)",
  description: [
    "We run 11 grocery stores across Bengaluru and need a customer-facing Android app that lets shoppers browse our live catalogue, build a cart, pay, and track a same-day delivery slot.",
    "",
    "Scope: Kotlin + Jetpack Compose, MVVM, minSdk 24. Screens: onboarding & OTP login, home with category browse, product detail, cart, checkout with Razorpay, order tracking, order history, profile & saved addresses.",
    "Backend: our REST API is already live and documented (OpenAPI 3). You consume it with Retrofit + Room for offline cart. Push via FCM.",
    "",
    "Deliverables per phase: source in our GitHub org, a signed debug APK, and a 10-minute walkthrough video. Final phase includes the Play Store internal-testing release and a handover call.",
    "",
    "Not in scope: backend work, design from scratch (Figma is ready), iOS.",
  ].join("\n"),
  category: "Tech & Digital",
  role: "Android Developer",
  rate: 120000,
  location: "Indiranagar, Bengaluru (remote-friendly)",
};

/** The 5-phase payment plan the client builds. Must sum to JOB.rate. */
const MILESTONES = [
  { name: "Requirements, Figma handoff & project scaffold", amount: 15000 },
  { name: "Catalogue browse, product detail & cart screens", amount: 25000 },
  { name: "REST API integration, Room offline cart & FCM", amount: 30000 },
  { name: "Razorpay checkout, order tracking & polish", amount: 30000 },
  { name: "QA, Play Store internal release & handover", amount: 20000 },
];

// ---------------------------------------------------------------------------
// Screenshot plumbing
// ---------------------------------------------------------------------------
fs.mkdirSync(SHOT_DIR, { recursive: true });
const manifest = [];
let shotNo = 0;

async function shot(page, slug, title, caption, opts = {}) {
  shotNo += 1;
  const file = `${String(shotNo).padStart(2, "0")}-${slug}.png`;
  await page.waitForTimeout(opts.settle ?? 450);
  await page.screenshot({ path: path.join(SHOT_DIR, file), fullPage: opts.fullPage !== false });
  manifest.push({ n: shotNo, file, slug, title, caption });
  console.log(`  📸 ${file}  ${title}`);
  return file;
}

const facts = { runId: RUN, capturedAt: new Date().toISOString(), worker: {}, client: {}, phases: [], chain: {} };

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readOutbox() {
  try {
    return JSON.parse(fs.readFileSync(OUTBOX, "utf8"));
  } catch {
    return [];
  }
}

/** Wait for a mock message to `to` newer than `since`, and return it. */
async function waitForMessage(channel, to, since, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  const needle = to.replace(/[^\w@.+-]/g, "");
  while (Date.now() < deadline) {
    const hit = readOutbox()
      .filter((m) => m.channel === channel && new Date(m.at).getTime() >= since)
      .filter((m) => m.to.replace(/[^\w@.+-]/g, "").includes(needle) || needle.includes(m.to.replace(/[^\w@.+-]/g, "")))
      .pop();
    if (hit) return hit;
    await sleep(400);
  }
  throw new Error(
    `No mock ${channel} for ${to} appeared in .dev-outbox.json within ${timeoutMs}ms. ` +
      `Is the dev server running with SMS_PROVIDER/EMAIL_PROVIDER unset (mock)?`
  );
}

async function rpc(method, params = []) {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });
  const body = await res.json();
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result;
}

/** Fast-forward the local chain. No-op with a warning on a network that won't allow it. */
async function advanceChain(seconds) {
  try {
    await rpc("evm_increaseTime", [seconds]);
    await rpc("evm_mine", []);
    console.log(`  ⏩ chain time +${Math.round(seconds / 3600)}h`);
    return true;
  } catch (e) {
    console.warn(`  ⚠ could not fast-forward the chain (${e.message}) — auto-release may not fire.`);
    return false;
  }
}

async function runCronTick() {
  const url = `${BASE}/api/cron/escrow${CRON_SECRET ? `?secret=${encodeURIComponent(CRON_SECRET)}` : ""}`;
  const res = await fetch(url, { method: "POST" });
  const body = await res.json().catch(() => ({}));
  console.log(`  ⏱  tick → reminders:${body.remindersSent ?? "?"} released:${body.autoReleased ?? "?"} cancelled:${body.autoCancelled ?? "?"}`);
  if (body.errors?.length) console.warn("     tick errors:", body.errors);
  return body;
}

/** Type a 6-digit OTP into the six single-character boxes. */
async function fillOtp(page, code) {
  const boxes = page.locator('input[inputmode="numeric"]');
  await boxes.first().waitFor();
  for (let i = 0; i < 6; i++) await boxes.nth(i).fill(code[i]);
}

async function step(label, fn) {
  console.log(`\n▶ ${label}`);
  try {
    return await fn();
  } catch (e) {
    console.error(`✗ FAILED at: ${label}\n  ${e.message}`);
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Reusable: full signup → OTP → email link → (role onboarding) → KYC
// ---------------------------------------------------------------------------
async function signUp(page, who, role, shots) {
  const t0 = Date.now();

  await page.goto(`${BASE}/signup`);
  await page.getByRole("button", { name: role === "WORKER" ? "Find Work" : "Post a Job" }).click();
  if (shots.blank) await shot(page, shots.blank.slug, shots.blank.title, shots.blank.caption);

  await page.getByPlaceholder("Full name").fill(who.signupName ?? who.name);
  await page.getByPlaceholder("Phone number").fill(who.phone);
  await page.getByPlaceholder("Email (optional, recommended)").fill(who.email);
  await page.getByPlaceholder("Password (min 8 characters)").fill(who.password);

  if (role === "CLIENT") {
    await page.getByRole("button", { name: "Business" }).click();
    await page.getByPlaceholder("Company name").fill(who.companyName);
    await page.getByPlaceholder("Business registration number").fill(who.regNumber);
  }
  await page.locator('input[name="agree"]').check();
  if (shots.filled) await shot(page, shots.filled.slug, shots.filled.title, shots.filled.caption);

  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/verify/phone", { timeout: 20000 });

  // ---- phone OTP ----
  const sms = await waitForMessage("sms", who.phone, t0);
  console.log(`  ✉ mock SMS code ${sms.code}`);
  if (shots.otpEmpty) await shot(page, shots.otpEmpty.slug, shots.otpEmpty.title, shots.otpEmpty.caption);

  await fillOtp(page, sms.code);
  if (shots.otpFilled) await shot(page, shots.otpFilled.slug, shots.otpFilled.title, shots.otpFilled.caption);
  await page.getByRole("button", { name: "Verify" }).click();
  await page.waitForURL("**/verify/email", { timeout: 20000 });
  if (shots.emailWait) await shot(page, shots.emailWait.slug, shots.emailWait.title, shots.emailWait.caption);

  // ---- email verification link (opened in a second tab, like a real inbox) ----
  const mail = await waitForMessage("email", who.email, t0);
  console.log(`  ✉ mock email link ${mail.link}`);
  const inbox = await page.context().newPage();
  await inbox.goto(mail.link);
  if (shots.emailConfirmed) {
    await shot(inbox, shots.emailConfirmed.slug, shots.emailConfirmed.title, shots.emailConfirmed.caption);
  }
  await inbox.close();

  // The waiting card polls and advances itself once the address is confirmed.
  await page.reload();
  await page.waitForURL(`**/onboarding/${role.toLowerCase()}`, { timeout: 25000 });
  return { otp: sms.code, link: mail.link };
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------
async function main() {
  const browser = await chromium.launch({
    headless: !HEADED,
    slowMo: HEADED ? 120 : 0,
  });
  const ctxOpts = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
  const workerCtx = await browser.newContext(ctxOpts);
  const clientCtx = await browser.newContext(ctxOpts);
  const w = await workerCtx.newPage();
  const c = await clientCtx.newPage();

  // =========================================================================
  await step("00 — the public landing page", async () => {
    await w.goto(BASE);
    await w.waitForTimeout(2500); // let the 3D hero settle
    await shot(w, "landing", "The public site", "Where both sides arrive. One product, two doors: Find Work and Post a Job.", { fullPage: false });
  });

  // =========================================================================
  await step("01 — worker signs up (OTP + email link)", async () => {
    await signUp(w, WORKER, "WORKER", {
      blank: { slug: "worker-signup-empty", title: "Worker signup — role toggle", caption: "Find Work is selected. Worker and Client are the same table with a role flag, so the toggle is the only difference at this point." },
      filled: { slug: "worker-signup-filled", title: "Worker signup — details entered", caption: "Name, phone, email, password. The password is bcrypt-hashed before it is stored; nothing here is kept in plain text." },
      otpEmpty: { slug: "worker-otp-empty", title: "Phone OTP requested", caption: "A 6-digit code was generated, hashed, stored with a 10-minute expiry and 5-attempt cap, then sent. In this build the provider is the mock, so the code is written to the server console." },
      otpFilled: { slug: "worker-otp-filled", title: "Phone OTP entered", caption: "The code from the mock SMS. Swap SMS_PROVIDER to twilio or fast2sms in .env and this exact step sends a real text — no other code changes." },
      emailWait: { slug: "worker-email-wait", title: "Waiting on the email link", caption: "Phone is verified. Email is optional to continue but required before applying, so the flow nudges rather than blocks." },
      emailConfirmed: { slug: "worker-email-confirmed", title: "Email verification link opened", caption: "The link from the mock inbox, opened in a second tab exactly as a user would. The waiting tab notices and moves itself on." },
    });

    // ---- profile: experience + charges ----
    await w.getByLabel("Headline").fill(WORKER.headline);
    await w.getByLabel("Location").fill(WORKER.location);
    await w.getByLabel("Years of experience").fill(WORKER.experienceYears);
    await w.getByLabel("Experience — what you've built or done").fill(WORKER.bio);
    await w.getByLabel("Per hour (₹)").fill(WORKER.rateHourly);
    await w.getByLabel("Per week (₹)").fill(WORKER.rateWeekly);
    await w.getByLabel("Languages (comma-separated)").fill(WORKER.languages);
    await w.getByRole("button", { name: WORKER.skill, exact: true }).click();
    await w.getByRole("button", { name: "Available Now" }).click();
    await shot(w, "worker-profile-setup", "Worker profile — experience and charges", "This is the step your brief calls out: the worker publishes what they've done and what they charge, per hour and per week. Both numbers are reference rates — the binding figure is the one agreed on the job.");

    await w.getByRole("button", { name: /Finish/ }).click();
    await w.waitForURL("**/kyc**", { timeout: 20000 });
    await shot(w, "worker-kyc", "Identity verification (KYC)", "Tier ladder: Unverified → Basic → Verified → Trusted. Nothing touching money is reachable below Verified. The documents are mocked here and auto-approve; a real KYC/AML provider drops into the same call.");

    await w.getByRole("button", { name: "Submit for Review" }).click();
    await w.waitForURL((u) => !u.pathname.startsWith("/kyc"), { timeout: 20000 });
    await shot(w, "worker-dashboard", "Worker dashboard", "The worker is live: verified phone, verified email, Verified KYC tier, a published profile and published charges.");
  });

  // =========================================================================
  await step("02 — client signs up (OTP + email link)", async () => {
    await signUp(c, CLIENT, "CLIENT", {
      blank: { slug: "client-signup-empty", title: "Client signup — Post a Job", caption: "Same form, other door. Choosing Business adds the company fields." },
      filled: { slug: "client-signup-filled", title: "Client signup — business details", caption: "Company name and registration number are captured up front so the contract can name a legal entity rather than a person." },
      otpEmpty: { slug: "client-otp-empty", title: "Client phone OTP", caption: "Identical verification path for both sides — a client who can post work is as verified as a worker who can take it." },
      otpFilled: { slug: "client-otp-filled", title: "Client OTP entered", caption: "Codes are single-use: verifying marks the token consumed, so a replayed code fails." },
      emailWait: { slug: "client-email-wait", title: "Client email pending", caption: "Email is required before posting a job, which is why the client is walked through it now." },
      emailConfirmed: { slug: "client-email-confirmed", title: "Client email verified", caption: "One click from the inbox. The token is hashed at rest and expires in an hour." },
    });

    await c.getByPlaceholder("Company name").fill(CLIENT.companyName);
    await c.getByPlaceholder(/Address/).fill(CLIENT.address);
    await shot(c, "client-profile-setup", "Client profile setup", "Address is stored but never shown publicly — jobs only ever advertise an area.");

    await c.getByRole("button", { name: /Finish/ }).click();
    await c.waitForURL("**/dashboard/client", { timeout: 20000 });

    await c.goto(`${BASE}/kyc`);
    await c.getByRole("button", { name: "Submit for Review" }).click();
    await c.waitForURL((u) => !u.pathname.startsWith("/kyc"), { timeout: 20000 });
    await shot(c, "client-kyc-done", "Client verified", "The client also has to clear KYC — funding escrow is gated on it, and the gate is checked server-side in fundPhaseAction, not just hidden in the UI.");
  });

  // =========================================================================
  await step("03 — client posts the Android job", async () => {
    await c.goto(`${BASE}/dashboard/client/post-job`);
    await c.getByPlaceholder("Job title").fill(JOB.title);
    await c.getByPlaceholder("Describe the work").fill(JOB.description);
    await c.locator("select").first().selectOption({ label: JOB.category });
    await shot(c, "post-job-1-basics", "Post a job — step 1, basics", "Title, a real specification, and a category. The description becomes the contract's scope clause verbatim, so vagueness here is expensive later.");

    await c.getByRole("button", { name: "Next" }).click();
    await c.locator("select").first().selectOption({ label: WORKER.skill });
    await c.getByPlaceholder("Role name").fill(JOB.role);
    await c.locator('input[type="number"]').first().fill("1");
    await c.getByPlaceholder("₹ rate").fill(String(JOB.rate));
    await shot(c, "post-job-2-roles", "Post a job — step 2, role line items", "One post can hire a whole crew: each role carries its own headcount and per-person rate, and the budget auto-sums. Here it's a single Android developer at ₹1,20,000.");

    await c.getByRole("button", { name: "Next" }).click();
    const today = new Date();
    const iso = (d) => d.toISOString().slice(0, 10);
    const start = new Date(today.getTime() + 3 * 864e5);
    const end = new Date(today.getTime() + 60 * 864e5);
    await c.getByPlaceholder(/Area & city/).fill(JOB.location);
    await c.locator('input[type="date"]').nth(0).fill(iso(start));
    await c.locator('input[type="date"]').nth(1).fill(iso(end));
    await shot(c, "post-job-3-logistics", "Post a job — step 3, logistics", "Only the area is published. The exact address is released after a hire exists.");

    await c.getByRole("button", { name: "Next" }).click();
    await c.getByText("Fund at hire time").click();
    await shot(c, "post-job-4-funding", "Post a job — step 4, funding mode", "Fund-at-hire is the honest choice for a phased project: the client funds phase by phase rather than parking the whole budget up front.");

    await c.getByRole("button", { name: "Next" }).click();
    await shot(c, "post-job-5-review", "Post a job — step 5, review", "Everything the worker will see, before it goes live.");

    await c.getByRole("button", { name: "Publish Job" }).click();
    await c.waitForURL("**/dashboard/client/jobs", { timeout: 20000 });
    await shot(c, "client-jobs-list", "The job is live", "Published. It is now visible in every worker's Find Jobs, filtered by skill and area.");
  });

  // =========================================================================
  const ids = await step("04 — worker finds and applies", async () => {
    await w.goto(`${BASE}/dashboard/worker/find-jobs`);
    await shot(w, "worker-find-jobs", "Find Jobs", "The client's post, seconds old, in the worker's feed.");

    await w.getByRole("link", { name: new RegExp(JOB.title.slice(0, 30).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).first().click();
    await w.waitForURL("**/dashboard/worker/jobs/**", { timeout: 20000 });
    await shot(w, "worker-job-detail", "The job as the worker reads it", "Full spec, the per-person rate, open slots, and the client's verification badge. Trust is symmetrical — the worker is checking the client out too.");

    await w.getByRole("button", { name: "Apply Now" }).click();
    await w.getByPlaceholder(/Cover note/).fill(
      "6 yrs on Android, Kotlin + Compose throughout. I've shipped four retail apps with Razorpay checkout and FCM order tracking, so the risky parts of this scope are ones I've done before. Happy to work to your 5-phase split and hand over source at each stage."
    );
    await w.locator('input[name="proposedRate"]').fill(String(JOB.rate));
    await shot(w, "worker-apply", "Applying", "Cover note plus a rate. The rate pre-fills from the posting and is negotiable — what the worker types here becomes the contract total if they're hired.");

    await w.getByRole("button", { name: "Submit Application" }).click();
    await w.waitForURL("**/dashboard/worker/applications", { timeout: 20000 });
    await shot(w, "worker-applications", "Application submitted", "Tracked on the worker's side from the moment it's sent.");

    const job = await db.job.findFirst({ where: { title: JOB.title }, orderBy: { createdAt: "desc" } });
    const application = await db.jobApplication.findFirst({ where: { jobId: job.id }, orderBy: { createdAt: "desc" } });
    return { jobId: job.id, applicationId: application.id };
  });

  // =========================================================================
  const hireId = await step("05 — client reviews the applicant and builds the 5-phase plan", async () => {
    await c.goto(`${BASE}/dashboard/client/jobs/${ids.jobId}/applicants`);
    await shot(c, "client-applicants", "The applicant, as the client sees them", "Rating, jobs completed, years of experience, and the charges the worker published at signup — hourly and weekly — next to what they've quoted for this specific job.");

    await c.getByRole("link", { name: /Accept/ }).first().click();
    await c.waitForURL("**/dashboard/client/offer/**", { timeout: 20000 });
    await shot(c, "milestone-plan-default", "Milestone plan — the suggested split", "Accepting doesn't create a hire on its own. First the client turns ₹1,20,000 into a payment schedule. The app suggests phases that fit software work; every field is editable.");

    for (let i = 0; i < MILESTONES.length; i++) {
      await c.getByLabel(`Phase ${i + 1} name`).fill(MILESTONES[i].name);
      await c.getByLabel(`Phase ${i + 1} amount`).fill(String(MILESTONES[i].amount));
    }
    await shot(c, "milestone-plan-final", "Milestone plan — the agreed split", "Five phases, front-light and back-loaded on the risky integration work. The running total has to land exactly on the agreed value; the server re-checks the sum, so a plan that doesn't balance can't create a hire.");

    await c.getByRole("button", { name: /Confirm hire/ }).click();
    await c.waitForURL("**/dashboard/client/hires/**/contract", { timeout: 25000 });

    const hire = await db.hire.findFirst({ orderBy: { createdAt: "desc" }, include: { phases: { orderBy: { index: "asc" } } } });
    facts.phases = hire.phases.map((p) => ({ index: p.index, name: p.name, amount: Number(p.amount), id: p.id }));
    return hire.id;
  });

  // =========================================================================
  await step("06 — both parties sign the contract", async () => {
    await shot(c, "contract-unsigned-client", "The generated contract", "Parties, engagement, scope, the five-phase payment schedule, and ten fixed escrow/dispute clauses — generated from the hire, not typed by anyone. The SHA-256 under it is what the signatures bind to.");

    await c.getByRole("checkbox").check();
    await c.getByLabel("Type your full name to sign").fill(CLIENT.name);
    await shot(c, "contract-client-signing", "Client signing", "The signature is the party's full legal name, typed. The server checks it against the verified account name, so you can't sign as someone else.");

    await c.getByRole("button", { name: "Sign contract" }).click();
    await c.waitForTimeout(2000);
    await c.reload();
    await shot(c, "contract-client-signed", "Client signed — one of two", "Recorded with a timestamp and the signer's network address. Escrow is still locked: one signature is not a contract.");

    // Worker side
    await w.goto(`${BASE}/dashboard/worker/hires/${hireId}`);
    await shot(w, "worker-hire-awaiting-signature", "Worker's hire — signature pending", "The worker sees the hire and a blocking banner. Nothing is funded and no work is expected until they've read the terms.");

    await w.goto(`${BASE}/dashboard/worker/hires/${hireId}/contract`);
    await shot(w, "contract-unsigned-worker", "The same document, worker side", "Byte-identical text and an identical hash — both sides render from one function, so the two parties provably cannot be shown different terms.");

    await w.getByRole("checkbox").check();
    await w.getByLabel("Type your full name to sign").fill(WORKER.name);
    await w.getByRole("button", { name: "Sign contract" }).click();
    await w.waitForTimeout(2000);
    await w.reload();
    await shot(w, "contract-fully-signed", "Fully executed", "Both signatures recorded against the same SHA-256. Change one rupee in the schedule now and the recomputed hash stops matching — the app flags the contract as void rather than silently accepting it.");

    const contract = await db.contract.findFirst({ where: { hireId } });
    facts.contractHash = contract.documentHash;
    facts.contractRef = `CW-${hireId.slice(-10).toUpperCase()}`;
  });

  // =========================================================================
  await step("07 — the client's wallet and the mock on-ramp", async () => {
    await c.goto(`${BASE}/dashboard/client/payments`);
    await shot(c, "client-wallet-before", "Client wallet — before any funding", "A custodial wallet was provisioned at signup: a real on-chain address the platform holds the key for. The client never sees a key or pays gas, and the balance is shown in rupees.");

    await c.getByRole("button", { name: "Add Funds" }).click();
    await c.waitForTimeout(4000);
    await c.reload();
    await shot(c, "client-wallet-topped-up", "Mock fiat on-ramp", "₹10,000 credited. In this build that's the platform relayer minting a test ERC-20 (cwINR) to the client's address — a real transaction on a test chain, standing in for a UPI/card payment that a processor would convert to stablecoin.");
  });

  // =========================================================================
  // Phase loop
  // =========================================================================
  const phases = await db.phase.findMany({ where: { hireId }, orderBy: { index: "asc" } });

  // ---- Phase 1: the full happy path, captured in detail ----
  await step("08 — phase 1: fund → deliver → approve → release", async () => {
    await c.goto(`${BASE}/dashboard/client/hires/${hireId}`);
    await shot(c, "phase-tracker-unfunded", "Phase tracker — nothing funded yet", "Five phases, sequential. Only phase 1 offers a Fund button; the rest say funding unlocks when the previous phase closes, and the server enforces the same rule.");

    await c.getByRole("button", { name: /^Fund Phase/ }).first().click();
    await c.waitForTimeout(9000);
    await c.reload();
    await shot(c, "phase1-funded", "Phase 1 funded — ₹15,000 in escrow", "Three on-chain transactions: mint (the mock on-ramp), approve, then fundPhase. The money has left the client's wallet and sits in the PhaseEscrow contract. Neither party can pull it out unilaterally.");

    await w.goto(`${BASE}/dashboard/worker/hires/${hireId}`);
    await shot(w, "phase1-worker-funded", "Worker sees the money is locked", "This is the point of the whole design: the worker starts phase 1 knowing ₹15,000 is already locked and can only go to them or back to the client by a rule, not by the client's mood.");

    await w.getByRole("button", { name: "Mark Delivered" }).first().click();
    await w.waitForTimeout(6000);
    await w.reload();
    await shot(w, "phase1-delivered", "Phase 1 delivered", "The worker marks delivery. That opens the client's verification window — two working days, weekends and configured holidays skipped — and the same deadline is written into the smart contract, which refuses an early auto-release.");

    await c.goto(`${BASE}/dashboard/client/hires/${hireId}`);
    await shot(c, "phase1-awaiting-approval", "Client's verification window", "Approve and release, request changes (twice at most), or escalate. Doing nothing is also an outcome — see phase 3.");

    await c.getByRole("button", { name: /^Approve/ }).first().click();
    await c.waitForTimeout(2000);
    await shot(c, "phase1-forge-complete", "Release", "The Forge Complete moment. approveRelease fires on-chain and the escrow pays the worker's payout address in the same transaction.", { settle: 200 });
    await c.waitForTimeout(7000);
    await c.reload();
    await shot(c, "phase1-released", "Phase 1 closed — phase 2 unlocked", "Released, irreversibly. Phase 2's Fund button appears only now.");

    await w.goto(`${BASE}/dashboard/worker/earnings`);
    await shot(w, "worker-earnings-after-p1", "The worker's money", "₹15,000, an on-chain balance read live from the token contract — not a number in our database. The transaction row carries the real hash.");
  });

  // ---- Phase 2: with a revision round ----
  await step("09 — phase 2: fund → deliver → changes requested → redeliver → release", async () => {
    await c.goto(`${BASE}/dashboard/client/hires/${hireId}`);
    await c.getByRole("button", { name: /^Fund Phase/ }).first().click();
    await c.waitForTimeout(9000);
    await c.reload();
    await shot(c, "phase2-funded", "Phase 2 funded — ₹25,000", "Exactly the pattern your brief describes: the client tops the next phase up only after the previous one closed. Total exposure at any moment is one phase, never the whole ₹1,20,000.");

    await w.goto(`${BASE}/dashboard/worker/hires/${hireId}`);
    await w.getByRole("button", { name: "Mark Delivered" }).first().click();
    await w.waitForTimeout(6000);

    await c.goto(`${BASE}/dashboard/client/hires/${hireId}`);
    await c.getByRole("button", { name: /^Request Changes/ }).first().click();
    await c.waitForTimeout(2500);
    await c.reload();
    await shot(c, "phase2-changes-requested", "Changes requested", "Not everything is a dispute. Two revision rounds are built in; each one resets the verification window on redelivery. After the second, the app pushes you to a complaint instead of an endless loop.");

    await w.goto(`${BASE}/dashboard/worker/hires/${hireId}`);
    await w.getByRole("button", { name: "Mark Delivered" }).first().click();
    await w.waitForTimeout(6000);
    await w.reload();
    await shot(w, "phase2-redelivered", "Redelivered", "The escrow never moved during the revision — it stayed locked the whole time.");

    await c.goto(`${BASE}/dashboard/client/hires/${hireId}`);
    await c.getByRole("button", { name: /^Approve/ }).first().click();
    await c.waitForTimeout(8000);
    await c.reload();
    await shot(c, "phase2-released", "Phase 2 released — ₹40,000 paid to date", "Two of five closed.");
  });

  // ---- Phase 3: the client goes quiet → reminders → auto-release ----
  await step("10 — phase 3: the client goes silent, escrow auto-releases", async () => {
    await c.goto(`${BASE}/dashboard/client/hires/${hireId}`);
    await c.getByRole("button", { name: /^Fund Phase/ }).first().click();
    await c.waitForTimeout(9000);

    await w.goto(`${BASE}/dashboard/worker/hires/${hireId}`);
    await w.getByRole("button", { name: "Mark Delivered" }).first().click();
    await w.waitForTimeout(6000);
    await w.reload();
    await shot(w, "phase3-delivered", "Phase 3 delivered — and then nothing", "Now the client stops responding. On most platforms this is where a freelancer loses a month chasing an invoice.");

    // Fast-forward: chain clock past the on-chain deadline, DB clock past the window.
    await advanceChain(5 * 24 * 3600);
    const p3 = phases[2];
    await db.phase.update({
      where: { id: p3.id },
      data: {
        deliveredAt: new Date(Date.now() - 3 * 864e5),
        verificationDeadline: new Date(Date.now() - 3600_000),
        reminderCount: 0,
      },
    });

    // First tick: a reminder goes out. Screenshot it before ticking to the release,
    // so the numbered sequence is the same on every run.
    let released = (await runCronTick()).autoReleased > 0;
    await sleep(1200);
    await c.goto(`${BASE}/dashboard/client/notifications`);
    await shot(c, "phase3-reminders", "Reminders, capped", "The timing worker sends a bounded number of nudges — two by default, configurable by an admin. It is not a nagging loop; it's a countdown with a defined end.");

    for (let i = 0; i < 8 && !released; i++) {
      released = ((await runCronTick()).autoReleased ?? 0) > 0;
      await sleep(1200);
    }
    if (!released) console.warn("  ⚠ phase 3 did not auto-release — check the chain fast-forward and CRON_SECRET.");

    await w.goto(`${BASE}/dashboard/worker/hires/${hireId}`);
    await shot(w, "phase3-auto-released", "Auto-released", "The window lapsed with the reminders spent, so the escrow paid out on its own — the smart contract's autoRelease, which reverts if called even a second early. Silence is not leverage.");

    await w.goto(`${BASE}/dashboard/worker/earnings`);
    await shot(w, "worker-earnings-after-p3", "₹70,000 received across three phases", "Two approved by the client, one released by the clock. Same destination either way.");
  });

  // ---- Phases 4 and 5 ----
  await step("11 — phases 4 and 5 close out the project", async () => {
    for (const idx of [4, 5]) {
      await c.goto(`${BASE}/dashboard/client/hires/${hireId}`);
      await c.getByRole("button", { name: /^Fund Phase/ }).first().click();
      await c.waitForTimeout(9000);

      await w.goto(`${BASE}/dashboard/worker/hires/${hireId}`);
      await w.getByRole("button", { name: "Mark Delivered" }).first().click();
      await w.waitForTimeout(6000);

      await c.goto(`${BASE}/dashboard/client/hires/${hireId}`);
      await c.getByRole("button", { name: /^Approve/ }).first().click();
      await c.waitForTimeout(8000);

      if (idx === 4) {
        await c.reload();
        await shot(c, "phase4-released", "Phase 4 released", "₹1,00,000 of ₹1,20,000 settled. One phase left.");
      }
    }
    await c.reload();
    await shot(c, "phase5-complete", "All five phases released", "The tracker is fully green and the hire flips to Completed automatically once the last phase settles — which is what opens up reviews.");
  });

  // =========================================================================
  await step("12 — mutual reviews", async () => {
    await c.goto(`${BASE}/dashboard/client/reviews`);
    await c.getByRole("button", { name: "Leave a review" }).first().click();
    await c.getByLabel("5 stars").nth(0).click();
    await c.getByLabel("5 stars").nth(1).click();
    await c.getByLabel("5 stars").nth(2).click();
    await c.getByLabel("5 stars").nth(3).click();
    await c.getByPlaceholder(/Share a few words/).fill(
      "Hit every milestone, handed over clean source each phase, and the Razorpay integration needed no rework. Would hire again."
    );
    await shot(c, "client-review", "Client reviews the worker", "Only reachable on a completed hire, once per direction, by the actual party. A client→worker review recomputes the worker's public rating and their sub-scores.");
    await c.getByRole("button", { name: "Submit review" }).click();
    await c.waitForTimeout(2500);

    await w.goto(`${BASE}/dashboard/worker/reviews`);
    await w.getByRole("button", { name: "Leave a review" }).first().click();
    await w.getByLabel("5 stars").nth(0).click();
    await w.getByPlaceholder(/Share a few words/).fill(
      "Funded every phase within a day of the previous release and gave clear feedback on the one revision. Exactly how escrow work should go."
    );
    await w.getByRole("button", { name: "Submit review" }).click();
    await w.waitForTimeout(2500);
    await w.reload();
    await shot(w, "worker-review", "Worker reviews the client", "Reputation is two-sided. The client's escrow-reliability score is derived from funding behaviour, not opinion.");
  });

  // =========================================================================
  await step("13 — the worker takes the money out", async () => {
    await w.goto(`${BASE}/dashboard/worker/earnings`);
    await shot(w, "worker-earnings-final", "₹1,20,000 earned", "The full contract value, in the worker's own on-chain wallet, with a transaction row and hash per phase.");

    const summary = await db.wallet.findFirst({ where: { user: { email: WORKER.email } } });
    facts.worker.custodialAddress = summary?.custodialAddress ?? null;

    await w.getByRole("button", { name: /Withdraw/ }).click();
    await w.waitForTimeout(9000);
    await w.reload();
    await shot(w, "worker-withdrawn", "Withdrawn — the off-ramp", "The balance really leaves the wallet: a genuine on-chain transfer out of custody. In this build the destination is the platform's off-ramp sink; in production that call is replaced by a payment processor paying INR into the worker's bank account or UPI ID.");

    await w.goto(`${BASE}/dashboard/worker/profile`);
    await shot(w, "worker-profile-final", "The worker's profile after one project", "Rating, completed-job count and the published charges — the reputation this contract just earned, which is what gets them the next one.");
  });

  // =========================================================================
  await step("14 — writing the manifest", async () => {
    const rows = await db.escrowTransaction.findMany({
      where: { phase: { hireId } },
      orderBy: { createdAt: "asc" },
      include: { phase: true },
    });
    facts.transactions = rows.map((t) => ({
      phase: t.phase?.name ?? "—",
      type: t.type,
      amount: Number(t.amount),
      txHash: t.onChainTxHash,
    }));
    facts.hireId = hireId;
    facts.job = { title: JOB.title, total: JOB.rate };
    facts.worker = { ...facts.worker, name: WORKER.name, email: WORKER.email, phone: WORKER.phone, password: WORKER.password };
    facts.client = { name: CLIENT.name, email: CLIENT.email, phone: CLIENT.phone, password: CLIENT.password };

    fs.writeFileSync(path.join(SHOT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));
    fs.writeFileSync(path.join(ROOT, "docs", "demo-run.json"), JSON.stringify(facts, null, 2));
    console.log(`\n✓ ${manifest.length} screenshots → docs/images/demo/`);
    console.log(`✓ run facts → docs/demo-run.json`);
    console.log(`\nDemo logins (this run):`);
    console.log(`  worker  ${WORKER.email} / ${WORKER.password}`);
    console.log(`  client  ${CLIENT.email} / ${CLIENT.password}`);
  });

  await browser.close();
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error("\nCapture aborted:", e);
  await db.$disconnect().catch(() => {});
  process.exit(1);
});
