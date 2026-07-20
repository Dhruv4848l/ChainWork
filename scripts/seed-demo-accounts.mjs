/*
  Demo roster seeder — creates the TESTING accounts (workers across every domain
  except Construction & Repair, clients, 14 jurors, 2 admins), gives EVERY wallet
  a ₹40,000 non-withdrawable demo credit, and opens live complaint/dispute cases
  raised by BOTH sides.

  These are ordinary DB rows: edit or delete them like any real account (admin
  console, Prisma Studio, or SQL). Idempotent — safe to re-run; existing emails
  are skipped. Full credentials list: docs/ChainWork_Demo_Accounts.docx.

  Run:  node --env-file=.env scripts/seed-demo-accounts.mjs
*/
import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { keccak256, toHex } from "viem";
import { PrismaClient as PlatformClient } from "../src/generated/platform/index.js";
import { PrismaClient as AdminClient } from "../src/generated/admin/index.js";

const db = new PlatformClient();
const adb = new AdminClient();

const PW = await bcrypt.hash("password123", 10);
const ADMIN_PW = await bcrypt.hash("admin123", 10);
const DEMO_CREDIT = 40000;

const addr = (seed) => "0x" + createHash("sha256").update("demo-" + seed).digest("hex").slice(0, 40);
const anon = (prefix, s) => {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 10000;
  return `${prefix} #${String(h).padStart(4, "0")}`;
};
const commitHash = (choice, splitPct, salt) => keccak256(toHex(`${choice}|${splitPct}|${salt}`));

// ---------------------------------------------------------------------------
// Roster — workers per domain (Construction & Repair deliberately left EMPTY).
// [name, email, headline, city, yrs, [skill, proficiency][], juror?]
// ---------------------------------------------------------------------------
const WORKERS = [
  // Tech & Digital — 10
  ["Aarav Mehta", "aarav.mehta@chainwork.dev", "Full-stack web developer · React & Node", "Bengaluru", 6, [["Web Development", "EXPERT"], ["Web Design", "SKILLED"]], true],
  ["Sanya Kapoor", "sanya.kapoor@chainwork.dev", "UI/UX designer · apps people actually finish", "Pune", 5, [["UI/UX Design", "EXPERT"], ["Graphic Design", "SKILLED"]], true],
  ["Rohan Verma", "rohan.verma@chainwork.dev", "Android & iOS apps · Flutter specialist", "Hyderabad", 4, [["Mobile App Development", "EXPERT"]], false],
  ["Ishita Joshi", "ishita.joshi@chainwork.dev", "Landing pages that convert", "Ahmedabad", 3, [["Web Design", "SKILLED"], ["Graphic Design", "SKILLED"]], false],
  ["Kabir Anand", "kabir.anand@chainwork.dev", "Web dev + on-site IT support", "Delhi", 7, [["Web Development", "EXPERT"], ["IT Support", "SKILLED"]], true],
  ["Neha Kulkarni", "neha.kulkarni@chainwork.dev", "SEO & performance marketing", "Mumbai", 5, [["SEO & Digital Marketing", "EXPERT"]], true],
  ["Aditya Menon", "aditya.menon@chainwork.dev", "IT support · networks & office setups", "Kochi", 8, [["IT Support", "EXPERT"], ["Data Entry", "INTERMEDIATE"]], false],
  ["Tanvi Desai", "tanvi.desai@chainwork.dev", "Brand design · logos, decks, social kits", "Surat", 4, [["Graphic Design", "EXPERT"], ["UI/UX Design", "INTERMEDIATE"]], true],
  ["Farhan Shaikh", "farhan.shaikh@chainwork.dev", "Web + mobile hybrid builds", "Lucknow", 5, [["Web Development", "SKILLED"], ["Mobile App Development", "SKILLED"]], false],
  ["Priyanka Iyer", "priyanka.iyer@chainwork.dev", "Data entry & digital ops, fast and exact", "Chennai", 3, [["Data Entry", "EXPERT"], ["SEO & Digital Marketing", "BEGINNER"]], false],
  // Electrical & Appliances — 4
  ["Mahesh Yadav", "mahesh.yadav@chainwork.dev", "AC installation & repair · all brands", "Delhi", 9, [["AC Repair", "EXPERT"], ["Electrician", "SKILLED"]], true],
  ["Sunil Kumar", "sunil.kumar@chainwork.dev", "Washing machine & fridge repair", "Jaipur", 7, [["Washing Machine Repair", "EXPERT"], ["Refrigerator Repair", "SKILLED"]], false],
  ["Rekha Devi", "rekha.devi@chainwork.dev", "Fan, cooler & small appliance repair", "Patna", 6, [["Fan & Cooler Repair", "EXPERT"]], false],
  ["Imtiaz Ali", "imtiaz.ali@chainwork.dev", "House wiring & panel work, licensed", "Bhopal", 11, [["Wiring", "EXPERT"], ["Panel Installation", "EXPERT"]], false],
  // Kitchen & Catering — 4
  ["Gopal Krishnan", "gopal.krishnan@chainwork.dev", "Head chef · South Indian & continental", "Chennai", 12, [["Chef", "EXPERT"]], true],
  ["Anita Sharma", "anita.sharma@chainwork.dev", "Cook + prep (commis) · events & homes", "Kanpur", 6, [["Cook", "SKILLED"], ["Kitchen Helper (Commis)", "EXPERT"]], false],
  ["Joseph D'Souza", "joseph.dsouza@chainwork.dev", "Baker & barista · cafés and pop-ups", "Goa", 5, [["Baker", "EXPERT"], ["Barista", "SKILLED"]], false],
  ["Kavita Reddy", "kavita.reddy@chainwork.dev", "Full-service catering, crews to 200 plates", "Hyderabad", 8, [["Catering", "EXPERT"], ["Cook", "SKILLED"]], true],
  // Cleaning — 2
  ["Shanti Bai", "shanti.bai@chainwork.dev", "Housekeeping & pest control", "Indore", 10, [["Housekeeping", "EXPERT"], ["Pest Control", "SKILLED"]], true],
  ["Ramu Naik", "ramu.naik@chainwork.dev", "Deep cleaning · homes & offices", "Nagpur", 4, [["Cleaner", "SKILLED"]], false],
  // Decoration — 2
  ["Pooja Agarwal", "pooja.agarwal@chainwork.dev", "Event decor · weddings & corporate", "Jaipur", 7, [["Event Decor", "EXPERT"], ["Decorator", "SKILLED"]], true],
  ["Salim Sheikh", "salim.sheikh@chainwork.dev", "Interior & exterior painting", "Mumbai", 9, [["Painter", "EXPERT"]], false],
  // Driving — 1 (joins the 2 existing seed drivers)
  ["Vijay Pillai", "vijay.pillai@chainwork.dev", "Commercial driver · goods & staff", "Coimbatore", 8, [["Driver", "EXPERT"], ["Delivery", "SKILLED"]], true],
  // Hospitality — 4
  ["Deepak Nair", "deepak.nair@chainwork.dev", "Banquet & fine-dining waiter", "Kochi", 6, [["Waiter", "EXPERT"]], true],
  ["Asha Kumari", "asha.kumari@chainwork.dev", "Event staff & guest handling", "Ranchi", 3, [["Event Staff", "SKILLED"], ["Helper", "SKILLED"]], false],
  ["Manoj Tiwari", "manoj.tiwari@chainwork.dev", "Waiter + event service, 5-star trained", "Varanasi", 7, [["Waiter", "SKILLED"], ["Event Staff", "EXPERT"]], false],
  ["Rita Fernandes", "rita.fernandes@chainwork.dev", "All-round helper · kitchens & events", "Panaji", 5, [["Helper", "EXPERT"]], false],
];

// [name, email, type, company?, juror?]
const CLIENTS = [
  ["Nikhil Bansal", "nikhil.bansal@chainwork.dev", "INDIVIDUAL", null, true],
  ["Sneha Patil", "sneha.patil@chainwork.dev", "INDIVIDUAL", null, true],
  ["Ankit Gupta", "technova@chainwork.dev", "BUSINESS", "TechNova Solutions Pvt Ltd", false],
  ["Maria Thomas", "grandstay@chainwork.dev", "BUSINESS", "GrandStay Hotels", false],
];

const ADMINS = [
  ["Priya Sharma", "moderation@chainwork.local", "MODERATION_OFFICER"],
  ["Devika Rao", "jury.lead@chainwork.local", "JURY"],
];

// ---------------------------------------------------------------------------
let phone = 9876540101;
const created = { workers: 0, clients: 0, jurors: 0, admins: 0, cases: 0 };
const userByEmail = {};

const skills = await db.skill.findMany();
const skillId = Object.fromEntries(skills.map((s) => [s.name, s.id]));

for (const [name, email, headline, city, yrs, skillList, juror] of WORKERS) {
  let user = await db.user.findFirst({ where: { email } });
  if (!user) {
    user = await db.user.create({
      data: {
        role: "WORKER", email, phone: String(phone++), passwordHash: PW, name,
        kycTier: yrs >= 8 ? "TRUSTED" : "VERIFIED", emailVerified: true, phoneVerified: true, onboarded: true,
        workerProfile: {
          create: {
            headline, location: city, experienceYears: yrs,
            completedJobsCount: 10 + yrs * 6, ratingAvg: 4.3 + (yrs % 7) * 0.1,
            ratingPunctuality: 4.5, ratingQuality: 4.5, ratingCommunication: 4.4,
            availability: "Flexible", languages: ["Hindi", "English"], juryOptIn: !!juror,
          },
        },
        wallet: { create: { custodialAddress: addr(email), balanceCache: 0, demoCredit: DEMO_CREDIT } },
      },
      include: { workerProfile: true },
    });
    for (const [sk, prof] of skillList) {
      if (skillId[sk]) await db.workerSkill.create({ data: { workerProfileId: user.workerProfile.id, skillId: skillId[sk], proficiency: prof } });
    }
    created.workers++;
  } else phone++;
  userByEmail[email] = user;
}

for (const [name, email, clientType, companyName] of CLIENTS) {
  let user = await db.user.findFirst({ where: { email } });
  if (!user) {
    user = await db.user.create({
      data: {
        role: "CLIENT", email, phone: String(phone++), passwordHash: PW, name,
        kycTier: "VERIFIED", emailVerified: true, phoneVerified: true, onboarded: true,
        clientProfile: { create: { clientType, companyName, escrowReliabilityScore: 92 + (name.length % 8), hiresCount: 3 } },
        wallet: { create: { custodialAddress: addr(email), balanceCache: 0, demoCredit: DEMO_CREDIT } },
      },
    });
    created.clients++;
  } else phone++;
  userByEmail[email] = user;
}

// ₹40k demo credit for EVERY account (incl. pre-existing seed users).
await db.wallet.updateMany({ data: { demoCredit: DEMO_CREDIT } });

// ---------------------------------------------------------------------------
// 14 jurors (12 workers + 2 clients) in the Admin DB, by platform id only.
// ---------------------------------------------------------------------------
const JUROR_EMAILS = [
  "aarav.mehta@chainwork.dev", "sanya.kapoor@chainwork.dev", "kabir.anand@chainwork.dev",
  "neha.kulkarni@chainwork.dev", "tanvi.desai@chainwork.dev", "mahesh.yadav@chainwork.dev",
  "gopal.krishnan@chainwork.dev", "kavita.reddy@chainwork.dev", "shanti.bai@chainwork.dev",
  "pooja.agarwal@chainwork.dev", "vijay.pillai@chainwork.dev", "deepak.nair@chainwork.dev",
  "nikhil.bansal@chainwork.dev", "sneha.patil@chainwork.dev",
];
const jurorByEmail = {};
for (const [i, email] of JUROR_EMAILS.entries()) {
  const u = userByEmail[email] ?? (await db.user.findFirst({ where: { email } }));
  if (!u) continue;
  let j = await adb.jurorProfile.findUnique({ where: { platformUserId: u.id } });
  if (!j) {
    j = await adb.jurorProfile.create({
      data: { platformUserId: u.id, displayName: u.name, status: "ACTIVE", stakeBalance: 1000, agreementRate: 68 + (i * 2) % 28, casesCount: 2 + (i % 6) },
    });
    created.jurors++;
  }
  jurorByEmail[email] = j;
}

// ---------------------------------------------------------------------------
// 2 test admins (roles the base seed doesn't cover). Password admin123 + dev TOTP.
// ---------------------------------------------------------------------------
for (const [name, email, role] of ADMINS) {
  const exists = await adb.adminUser.findUnique({ where: { email } });
  if (!exists) {
    await adb.adminUser.create({
      data: { email, passwordHash: ADMIN_PW, name, role, twoFactorEnabled: true, totpSecret: "JBSWY3DPEHPK3PXP" },
    });
    created.admins++;
  }
}

// ---------------------------------------------------------------------------
// Live cases. Helper: job + role + hire + contract + phases.
// ---------------------------------------------------------------------------
async function makeHire({ title, description, categorySlug, clientEmail, workerEmail, roleName, skillName, phases }) {
  const existing = await db.job.findFirst({ where: { title } });
  if (existing) {
    const hire = await db.hire.findFirst({ where: { jobId: existing.id }, include: { phases: true } });
    return { job: existing, hire, phases: hire?.phases ?? [] };
  }
  const client = userByEmail[clientEmail];
  const worker = userByEmail[workerEmail];
  const cat = await db.category.findUnique({ where: { slug: categorySlug } });
  const total = phases.reduce((s, p) => s + p.amount, 0);
  const job = await db.job.create({
    data: {
      clientId: client.id, title, description, categoryId: cat.id,
      location: "On-site", status: "PUBLISHED", publishedAt: new Date(Date.now() - 12 * 86400e3),
    },
  });
  const role = await db.jobRoleLineItem.create({
    data: { jobId: job.id, roleName, skillId: skillId[skillName] ?? null, headcount: 1, perPersonRate: total, hiredCount: 1 },
  });
  const hire = await db.hire.create({
    data: { jobId: job.id, roleLineItemId: role.id, clientId: client.id, workerId: worker.id, totalValue: total, status: "ACTIVE" },
  });
  await db.contract.create({
    data: { hireId: hire.id, totalValue: total, scope: description, startDate: new Date(Date.now() - 10 * 86400e3) },
  });
  const rows = [];
  for (const [i, p] of phases.entries()) {
    rows.push(await db.phase.create({
      data: {
        hireId: hire.id, index: i + 1, name: p.name, amount: p.amount, status: p.status,
        deliveredAt: p.status === "DISPUTED" || p.status === "RELEASED" ? new Date(Date.now() - 4 * 86400e3) : null,
        releasedAt: p.status === "RELEASED" ? new Date(Date.now() - 3 * 86400e3) : null,
      },
    }));
  }
  return { job, hire, phases: rows };
}

async function makeDispute({ complaint, hire, phase, clientEmail, workerEmail, tier, panelSize, commits }) {
  const existing = await adb.disputeCase.findFirst({ where: { subjectPhaseId: phase.id } });
  if (existing) return existing;
  const now = Date.now();
  const c = await adb.disputeCase.create({
    data: {
      complaintId: complaint.id, subjectHireId: hire.id, subjectPhaseId: phase.id,
      clientLabel: anon("Client", userByEmail[clientEmail].id), workerLabel: anon("Worker", userByEmail[workerEmail].id),
      reason: complaint.description.slice(0, 120), valueTier: tier, panelSize,
      escrowAmount: Number(phase.amount), status: "COMMIT",
      commitDeadline: new Date(now + 48 * 3600e3), revealDeadline: new Date(now + 72 * 3600e3),
    },
  });
  // Panel: first `panelSize` jurors not party to the hire.
  const partyIds = [userByEmail[clientEmail].id, userByEmail[workerEmail].id];
  const panel = Object.values(jurorByEmail).filter((j) => !partyIds.includes(j.platformUserId)).slice(0, panelSize);
  for (const [i, j] of panel.entries()) {
    await adb.juryAssignment.create({ data: { caseId: c.id, jurorId: j.id } });
    const planned = commits[i]; // { choice, splitPct, salt } or undefined (not yet committed)
    await adb.juryVote.create({
      data: planned
        ? { caseId: c.id, jurorId: j.id, commitHash: commitHash(planned.choice, planned.splitPct, planned.salt), committedAt: new Date(now - (i + 1) * 3600e3) }
        : { caseId: c.id, jurorId: j.id },
    });
  }
  await adb.evidence.create({ data: { caseId: c.id, submittedByLabel: anon("Client", userByEmail[clientEmail].id), fileRef: "chat-log.pdf", hash: addr("ev1-" + c.id) } });
  await adb.evidence.create({ data: { caseId: c.id, submittedByLabel: anon("Worker", userByEmail[workerEmail].id), fileRef: "delivery-photos.zip", hash: addr("ev2-" + c.id) } });
  created.cases++;
  return c;
}

// CASE 1 — raised by the WORKER (client sat on an approved-quality delivery).
const c1 = await makeHire({
  title: "Company website revamp — TechNova",
  description: "5-page corporate site rebuild: design refresh, responsive build, deployment.",
  categorySlug: "tech-digital", clientEmail: "technova@chainwork.dev", workerEmail: "aarav.mehta@chainwork.dev",
  roleName: "Web Developer", skillName: "Web Development",
  phases: [
    { name: "Design mockups", amount: 6000, status: "RELEASED" },
    { name: "Build & launch", amount: 12000, status: "DISPUTED" },
  ],
});
if (c1.hire) {
  let comp1 = await db.complaint.findFirst({ where: { hireId: c1.hire.id } });
  if (!comp1) {
    comp1 = await db.complaint.create({
      data: {
        hireId: c1.hire.id, phaseId: c1.phases[1]?.id, filedById: userByEmail["aarav.mehta@chainwork.dev"].id,
        category: "PAYMENT", triageLane: "FINANCIAL", status: "ESCALATED",
        description: "Site delivered and demoed live on the 14th; client confirmed it looks good in chat but refuses to approve the Build & launch phase and has gone quiet. Requesting release of the escrowed ₹12,000.",
      },
    });
  }
  await makeDispute({
    complaint: comp1, hire: c1.hire, phase: c1.phases[1],
    clientEmail: "technova@chainwork.dev", workerEmail: "aarav.mehta@chainwork.dev",
    tier: "STANDARD", panelSize: 5,
    commits: [
      { choice: "RELEASE_WORKER", splitPct: 0, salt: "demo-salt-1" },
      { choice: "RELEASE_WORKER", splitPct: 0, salt: "demo-salt-2" },
      { choice: "SPLIT", splitPct: 70, salt: "demo-salt-3" },
      undefined, undefined, // two panellists haven't committed yet — case is live
    ],
  });
}

// CASE 2 — raised by the CLIENT (quality dispute on catering).
const c2 = await makeHire({
  title: "Wedding catering crew — 120 guests",
  description: "Full catering for a 120-guest wedding: menu, prep, on-site service.",
  categorySlug: "cooking", clientEmail: "sneha.patil@chainwork.dev", workerEmail: "kavita.reddy@chainwork.dev",
  roleName: "Catering Lead", skillName: "Catering",
  phases: [{ name: "Menu tasting & event prep", amount: 4500, status: "DISPUTED" }],
});
if (c2.hire) {
  let comp2 = await db.complaint.findFirst({ where: { hireId: c2.hire.id } });
  if (!comp2) {
    comp2 = await db.complaint.create({
      data: {
        hireId: c2.hire.id, phaseId: c2.phases[0]?.id, filedById: userByEmail["sneha.patil@chainwork.dev"].id,
        category: "QUALITY", triageLane: "FINANCIAL", status: "ESCALATED",
        description: "Food served at the event was far below the approved tasting sample — three dishes replaced without telling us and guests complained. Requesting refund of the phase escrow.",
      },
    });
  }
  await makeDispute({
    complaint: comp2, hire: c2.hire, phase: c2.phases[0],
    clientEmail: "sneha.patil@chainwork.dev", workerEmail: "kavita.reddy@chainwork.dev",
    tier: "SMALL", panelSize: 3,
    commits: [{ choice: "SPLIT", splitPct: 40, salt: "demo-salt-4" }, undefined, undefined],
  });
}

// CASE 3 — OPEN complaint by a WORKER (conduct), still in triage.
const c3 = await makeHire({
  title: "Banquet service staff — GrandStay",
  description: "Waiter service for a 3-evening corporate banquet series.",
  categorySlug: "hospitality", clientEmail: "grandstay@chainwork.dev", workerEmail: "deepak.nair@chainwork.dev",
  roleName: "Banquet Waiter", skillName: "Waiter",
  phases: [{ name: "Evening 1 service", amount: 3000, status: "FUNDED" }],
});
if (c3.hire && !(await db.complaint.findFirst({ where: { hireId: c3.hire.id } }))) {
  await db.complaint.create({
    data: {
      hireId: c3.hire.id, phaseId: c3.phases[0]?.id, filedById: userByEmail["deepak.nair@chainwork.dev"].id,
      category: "CONDUCT", status: "OPEN",
      description: "Floor manager was abusive towards staff during evening one and demanded unpaid overtime beyond the contracted hours.",
    },
  });
}

// CASE 4 — OPEN complaint by a CLIENT (no-show), still in triage.
const c4 = await makeHire({
  title: "2BHK interior painting — Andheri",
  description: "Full repaint of a 2BHK flat: walls, ceilings, trim. Materials provided.",
  categorySlug: "decoration", clientEmail: "nikhil.bansal@chainwork.dev", workerEmail: "salim.sheikh@chainwork.dev",
  roleName: "Painter", skillName: "Painter",
  phases: [{ name: "Living room + bedrooms", amount: 5000, status: "FUNDED" }],
});
if (c4.hire && !(await db.complaint.findFirst({ where: { hireId: c4.hire.id } }))) {
  await db.complaint.create({
    data: {
      hireId: c4.hire.id, phaseId: c4.phases[0]?.id, filedById: userByEmail["nikhil.bansal@chainwork.dev"].id,
      category: "NO_SHOW", status: "OPEN",
      description: "Painter did not arrive on the agreed start date and hasn't responded to messages for two days. Escrow is funded and locked.",
    },
  });
}

console.log("created:", created);
console.log("totals:", {
  users: await db.user.count(),
  jurors: await adb.jurorProfile.count(),
  admins: await adb.adminUser.count(),
  disputes: await adb.disputeCase.count(),
  complaints: await db.complaint.count(),
  walletsWithDemoCredit: await db.wallet.count({ where: { demoCredit: { gt: 0 } } }),
});
await db.$disconnect();
await adb.$disconnect();
