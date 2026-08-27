/*
  Completes the 500-account dataset's relationships after seed-500.mjs (the users +
  active hires already exist). Adds: more live jury disputes, open jobs, and fresher
  applications. Loads existing d500 users from the DB — creates no new accounts.
  Run:  node --env-file=.env scripts/seed-500-rel.mjs
*/
import { createHash } from "node:crypto";
import { keccak256, toHex } from "viem";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
import { PrismaClient } from "../src/generated/platform/index.js";
const db = new PrismaClient();
const adb = new (require("../src/generated/admin/index.js").PrismaClient)();

let _s = 424242;
const rnd = () => ((_s = (_s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const chance = (p) => rnd() < p;
const shuffle = (a) => { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };
const anon = (p, s) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 10000; return `${p} #${String(h).padStart(4, "0")}`; };
const commitHash = (choice, splitPct, salt) => keccak256(toHex(`${choice}|${splitPct}|${salt}`));

const D = "@d500.chainwork.dev";
const workers = await db.user.findMany({ where: { role: "WORKER", email: { endsWith: D } }, include: { workerProfile: { include: { skills: { include: { skill: { include: { category: true } } } } } } } });
const clients = await db.user.findMany({ where: { role: "CLIENT", email: { endsWith: D } } });
const jurors = await adb.jurorProfile.findMany({ where: { status: "ACTIVE" } });
const cats = await db.category.findMany();
const skills = await db.skill.findMany();
const skillId = Object.fromEntries(skills.map((s) => [s.name, s.id]));
const experienced = workers.filter((w) => (w.workerProfile?.experienceYears || 0) > 0);
const freshers = workers.filter((w) => (w.workerProfile?.experienceYears || 0) === 0);
const workerCat = (w) => w.workerProfile?.skills?.[0]?.skill?.category || pick(cats);
console.log(`loaded: ${workers.length} workers (${experienced.length} exp, ${freshers.length} freshers), ${clients.length} clients, ${jurors.length} jurors`);

const already = await db.jobApplication.count();
if (already > 60) { console.log(`applications already ${already} — relationships look complete, skipping.`); await db.$disconnect(); await adb.$disconnect(); process.exit(0); }

async function makeJob(client, cat, roleName, rate, published) {
  const job = await db.job.create({ data: { clientId: client.id, title: `${roleName} needed — ${pick(["urgent", "this week", "on-site", "short project"])}`, description: `${client.name} needs a ${roleName}. Escrow-backed, milestone-based.`, categoryId: cat.id, location: pick(["Mumbai", "Delhi", "Bengaluru", "Jaipur", "Goa", "Pune", "Udaipur", "Kochi", "Varanasi", "Agra"]), status: "PUBLISHED", urgent: chance(0.22), publishedAt: new Date(Date.now() - int(1, 24) * 86400e3) } });
  const roleItem = await db.jobRoleLineItem.create({ data: { jobId: job.id, roleName, skillId: null, headcount: 1, perPersonRate: rate, hiredCount: published ? 0 : 1 } });
  return { job, roleItem };
}

// ---- more disputes (target ~14 total) ----
const DISPUTE_REASONS = [
  ["QUALITY", "Delivered work fell short of the approved sample; requesting a refund of the phase escrow."],
  ["PAYMENT", "Work delivered and demoed; client has gone quiet and won't approve release of the escrow."],
  ["NO_SHOW", "Worker missed the agreed start and stopped responding while escrow is locked."],
  ["CONDUCT", "Client keeps pressuring for unpaid extra work beyond the signed milestones."],
];
let disputesMade = 0;
for (let i = 0; i < 12; i++) {
  const worker = pick(experienced), client = pick(clients);
  const cat = workerCat(worker), roleName = "Contractor";
  const rate = int(3000, 28000);
  const { job, roleItem } = await makeJob(client, cat, roleName, rate, false);
  const hire = await db.hire.create({ data: { jobId: job.id, roleLineItemId: roleItem.id, clientId: client.id, workerId: worker.id, totalValue: rate, status: "ACTIVE" } });
  await db.contract.create({ data: { hireId: hire.id, totalValue: rate, scope: job.description, startDate: new Date(Date.now() - 12 * 86400e3), documentHash: createHash("sha256").update("rd-" + hire.id).digest("hex"), clientSignature: client.name, clientSignedAt: new Date(Date.now() - 11 * 86400e3), workerSignature: worker.name, workerSignedAt: new Date(Date.now() - 10 * 86400e3) } });
  const phase = await db.phase.create({ data: { hireId: hire.id, index: 1, name: "Disputed milestone", amount: rate, status: "DISPUTED", deliveredAt: new Date(Date.now() - 4 * 86400e3) } });
  const [category, desc] = pick(DISPUTE_REASONS);
  const workerRaised = category === "PAYMENT";
  const complaint = await db.complaint.create({ data: { hireId: hire.id, phaseId: phase.id, filedById: workerRaised ? worker.id : client.id, category, triageLane: "FINANCIAL", status: "ESCALATED", description: desc } });
  const tier = rate < 5000 ? "SMALL" : rate < 20000 ? "STANDARD" : "LARGE";
  const panelSize = tier === "SMALL" ? 3 : tier === "STANDARD" ? 5 : 7;
  const partyIds = [worker.id, client.id];
  const panel = shuffle(jurors.filter((j) => !partyIds.includes(j.platformUserId))).slice(0, panelSize);
  if (panel.length < panelSize) continue;
  const now = Date.now();
  const c = await adb.disputeCase.create({ data: { complaintId: complaint.id, subjectHireId: hire.id, subjectPhaseId: phase.id, clientLabel: anon("Client", client.id), workerLabel: anon("Worker", worker.id), reason: desc.slice(0, 120), valueTier: tier, panelSize, escrowAmount: rate, status: "COMMIT", commitDeadline: new Date(now + 48 * 3600e3), revealDeadline: new Date(now + 72 * 3600e3) } });
  const committed = int(1, panelSize - 1);
  for (const [j, jr] of panel.entries()) {
    await adb.juryAssignment.create({ data: { caseId: c.id, jurorId: jr.id } });
    if (j < committed) { const ch = pick(["RELEASE_WORKER", "REFUND_CLIENT", "SPLIT"]); await adb.juryVote.create({ data: { caseId: c.id, jurorId: jr.id, commitHash: commitHash(ch, ch === "SPLIT" ? int(30, 70) : 0, "rd-" + c.id + "-" + j), committedAt: new Date(now - (j + 1) * 3600e3) } }); }
    else await adb.juryVote.create({ data: { caseId: c.id, jurorId: jr.id } });
  }
  disputesMade++;
}

// ---- open jobs + fresher applications ----
const ROLES = ["Electrician", "Cook", "Web developer", "Painter", "Driver", "Cleaner", "Waiter", "Carpenter", "Graphic designer", "Event decorator", "Plumber", "AC technician"];
const openJobs = [];
for (let i = 0; i < 45; i++) { const client = pick(clients); const cat = pick(cats); const { job, roleItem } = await makeJob(client, cat, pick(ROLES), int(2000, 20000), true); openJobs.push({ job, roleItem }); }
let apps = 0;
for (const oj of openJobs) {
  for (const a of shuffle(freshers).slice(0, int(0, 4))) {
    try { await db.jobApplication.create({ data: { jobId: oj.job.id, roleLineItemId: oj.roleItem.id, workerId: a.id, status: pick(["APPLIED", "APPLIED", "UNDER_REVIEW"]), coverNote: "Keen to take this on — available immediately and happy to start with a small milestone.", proposedRate: int(1500, 18000), fitScore: int(55, 92) } }); apps++; } catch {}
  }
}

console.log("\n=== RELATIONSHIPS COMPLETE ===");
console.log({ new_disputes: disputesMade, open_jobs: openJobs.length, applications: apps, total_hires: await db.hire.count(), total_disputes: await adb.disputeCase.count(), total_applications: await db.jobApplication.count() });
await db.$disconnect(); await adb.$disconnect();
