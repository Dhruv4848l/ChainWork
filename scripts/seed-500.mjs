/*
  500-account demo dataset for ChainWork.
  350 workers (technical + non-technical, freshers + experienced) and 150 hirers
  (individual + organization), all across India, ALL pre-verified (KYC/email/phone/
  onboarded) so there's no paperwork at login. Adds active hires (currently working),
  live jury disputes, open jobs + fresher applications, and extra jurors.

  Images are NOT set here — run scripts/backfill-avatars.mjs afterwards to attach a
  unique synthetic face to every account (decoupled so accounts land even if that fails).

  Idempotent: identifies its own rows by the "@d500.chainwork.dev"-style emails and skips
  if already created. Run:  node --env-file=.env scripts/seed-500.mjs
*/
import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { keccak256, toHex } from "viem";
import { PrismaClient as PlatformClient } from "../src/generated/platform/index.js";
import { PrismaClient as AdminClient } from "../src/generated/admin/index.js";

const db = new PlatformClient();
const adb = new AdminClient();
const PW = await bcrypt.hash("password123", 10);
const DEMO_CREDIT = 40000;
const EMAIL_DOMAIN = "d500.chainwork.dev"; // marks this batch, separate from the base seed

// ---- deterministic RNG (reproducible runs) ----
let _s = 987654321;
const rnd = () => ((_s = (_s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const chance = (p) => rnd() < p;
const shuffle = (a) => { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };
const addr = (s) => "0x" + createHash("sha256").update("d500-" + s).digest("hex").slice(0, 40);
const anon = (p, s) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 10000; return `${p} #${String(h).padStart(4, "0")}`; };
const commitHash = (choice, splitPct, salt) => keccak256(toHex(`${choice}|${splitPct}|${salt}`));

// ---- name + place pools ----
const MALE = ["Aarav","Vivaan","Aditya","Vihaan","Arjun","Sai","Reyansh","Krishna","Ishaan","Rohan","Rahul","Karan","Amit","Suresh","Rajesh","Vikram","Anil","Deepak","Manoj","Sanjay","Ravi","Naveen","Nikhil","Arun","Prakash","Gaurav","Harsh","Yash","Siddharth","Aryan","Kunal","Varun","Abhishek","Ashwin","Tarun","Nitin","Pankaj","Ramesh","Sunil","Vijay","Farhan","Imran","Zaid","Ayaan","Kabir","Irfan","Salman","Rizwan","Joseph","Thomas"];
const FEMALE = ["Aanya","Aadhya","Diya","Saanvi","Ananya","Priya","Neha","Pooja","Sneha","Kavya","Ishita","Riya","Divya","Meera","Anjali","Shreya","Nisha","Swati","Deepika","Preeti","Kirti","Sunita","Rekha","Lakshmi","Radha","Geeta","Aishwarya","Tanvi","Sanya","Kritika","Naina","Simran","Aditi","Bhavna","Payal","Ritu","Sakshi","Fatima","Ayesha","Zoya","Sana","Nikita","Pallavi","Snehal","Vaishnavi","Ishika","Mary","Grace"];
const SUR = ["Sharma","Verma","Gupta","Kumar","Singh","Patel","Reddy","Nair","Menon","Iyer","Rao","Naidu","Pillai","Das","Bose","Chatterjee","Banerjee","Joshi","Desai","Shah","Mehta","Kapoor","Malhotra","Chopra","Bhatt","Trivedi","Pandey","Mishra","Tiwari","Yadav","Jain","Agarwal","Bansal","Khanna","Chauhan","Rathore","Shaikh","Khan","Ansari","Qureshi","Sheikh","D'Souza","Fernandes","Pereira","Thomas","Mathew","Kulkarni","Deshpande","Gowda","Shetty"];
const MAJOR = ["Mumbai","Delhi","Bengaluru","Hyderabad","Chennai","Kolkata","Pune","Ahmedabad","Jaipur","Surat","Lucknow","Kanpur","Nagpur","Indore","Bhopal","Patna","Kochi","Coimbatore","Chandigarh","Guwahati","Visakhapatnam","Vadodara","Ludhiana","Bhubaneswar"];
const TOURIST = ["Panaji (Goa)","Udaipur","Jodhpur","Jaisalmer","Varanasi","Rishikesh","Haridwar","Shimla","Manali","Dharamshala","Darjeeling","Gangtok","Munnar","Alleppey","Mysuru","Hampi","Pushkar","Agra","Amritsar","Srinagar","Leh","Ooty","Pondicherry","Mahabalipuram","Khajuraho","Nainital","Mount Abu","Rameswaram","Tirupati","Shirdi"];
const CITIES = [...MAJOR, ...TOURIST];
const LANGS = ["Hindi","English","Marathi","Tamil","Telugu","Kannada","Malayalam","Bengali","Gujarati","Punjabi","Urdu","Odia","Assamese"];

// ---- categories -> skills (matches the taxonomy) ----
const CATS = {
  "tech-digital":  { label: "Tech & Digital",         technical: true,  skills: ["Web Design","Web Development","Mobile App Development","UI/UX Design","Graphic Design","SEO & Digital Marketing","IT Support","Data Entry"], roles: ["web developer","app developer","UI/UX designer","graphic designer","SEO specialist","IT support engineer","data-entry specialist"] },
  "electrical":    { label: "Electrical & Appliances", technical: false, skills: ["Electrician","Wiring","Panel Installation","Fan & Cooler Repair","AC Repair","Washing Machine Repair","Refrigerator Repair"], roles: ["electrician","AC technician","appliance repair technician","wiring specialist"] },
  "cooking":       { label: "Kitchen & Catering",     technical: false, skills: ["Chef","Cook","Kitchen Helper (Commis)","Baker","Catering","Barista"], roles: ["chef","cook","baker","catering lead","barista"] },
  "construction":  { label: "Construction & Repair",  technical: false, skills: ["Carpenter","Plumber","Mason","Welder","Tiling & Flooring"], roles: ["carpenter","plumber","mason","welder","tiling specialist"] },
  "decoration":    { label: "Decoration",             technical: false, skills: ["Decorator","Painter","Event Decor"], roles: ["decorator","painter","event decorator"] },
  "driving":       { label: "Driving",                technical: false, skills: ["Driver","Delivery"], roles: ["driver","delivery partner"] },
  "cleaning":      { label: "Cleaning",               technical: false, skills: ["Cleaner","Housekeeping","Pest Control"], roles: ["cleaner","housekeeping supervisor","pest-control technician"] },
  "hospitality":   { label: "Hospitality",            technical: false, skills: ["Waiter","Helper","Event Staff"], roles: ["waiter","event helper","banquet staff"] },
};
const DIST = { "tech-digital": 90, "electrical": 45, "cooking": 45, "construction": 40, "decoration": 35, "driving": 30, "cleaning": 30, "hospitality": 35 }; // = 350

const ACHIEVEMENTS = {
  "tech-digital": ["shipped 40+ client sites and apps","led rebuilds for two local startups","maintained a 4.8★ delivery record","specialises in fast, mobile-first builds"],
  "electrical": ["wired 200+ homes and shops","certified for panel and load work","known for same-day appliance fixes","handles commercial and residential jobs"],
  "cooking": ["ran kitchens for 200-plate events","trained under a hotel head chef","menus for weddings and corporate dos","cafe and pop-up experience"],
  "construction": ["finished 150+ site jobs","precise on measurements and finish","trusted for tight-deadline builds","full interior fit-out experience"],
  "decoration": ["decorated 80+ weddings and events","clean, on-time finishes","corporate and residential work","colour and theme consultations"],
  "driving": ["clean record over lakhs of km","goods and staff transport","punctual and route-smart","long-haul and city experience"],
  "cleaning": ["deep-clean crews for homes and offices","reliable, background-checked","end-to-end housekeeping","pest control included"],
  "hospitality": ["5-star banquet training","calm under a full house","guest handling and service","events up to 500 covers"],
};

let idx = 101; // global counter -> unique email/phone
const nextPhone = () => String(9200000000 + (idx - 101));
const slug = (s) => s.toLowerCase().replace(/[^a-z]/g, "");

async function existingCount() {
  return db.user.count({ where: { email: { endsWith: "@" + EMAIL_DOMAIN } } });
}

const skills = await db.skill.findMany();
const skillId = Object.fromEntries(skills.map((s) => [s.name, s.id]));

const already = await existingCount();
if (already >= 500) {
  console.log(`Already ${already} d500 accounts — skipping creation. (Delete them to regenerate.)`);
  await db.$disconnect(); await adb.$disconnect();
  process.exit(0);
}

const workers = [];
const clients = [];

// ---------------------------------------------------------------- WORKERS (350)
for (const [catSlug, count] of Object.entries(DIST)) {
  const cat = CATS[catSlug];
  for (let k = 0; k < count; k++) {
    const gender = chance(0.5) ? "female" : "male";
    const first = pick(gender === "female" ? FEMALE : MALE);
    const last = pick(SUR);
    const name = `${first} ${last}`;
    const email = `${slug(first)}.${slug(last)}${idx}@${EMAIL_DOMAIN}`;
    const city = chance(0.45) ? pick(TOURIST) : pick(MAJOR);
    const fresher = chance(0.4);
    const yrs = fresher ? 0 : int(1, 15);
    const role = pick(cat.roles);
    const skillSet = shuffle(cat.skills).slice(0, int(1, Math.min(3, cat.skills.length)));
    const proficiency = fresher ? "BEGINNER" : yrs >= 6 ? "EXPERT" : yrs >= 3 ? "SKILLED" : "INTERMEDIATE";
    const langs = ["Hindi", "English"]; const extra = pick(LANGS); if (!langs.includes(extra)) langs.push(extra);
    const juror = !fresher && yrs >= 4 && chance(0.35);

    const bio = fresher
      ? `New to ChainWork — a ${city}-based ${role} looking for gig and part-time work to build a track record. Reliable, quick to learn, and available on short notice.`
      : `${yrs} years as a ${role}, based in ${city}. ${pick(ACHIEVEMENTS[catSlug])[0].toUpperCase() + pick(ACHIEVEMENTS[catSlug]).slice(1)}. Previously ${pick(["freelance","with a local firm","running a small crew","on contract with an agency"])}; now taking escrow-backed gigs on ChainWork.`;
    const headline = fresher ? `${cat.technical ? "Aspiring" : "New"} ${role} · open to gigs` : `${role.charAt(0).toUpperCase() + role.slice(1)} · ${yrs} yrs`;
    const rateHourly = fresher ? int(120, 300) : int(250, 1500);
    const rateWeekly = rateHourly * int(35, 45);

    const u = await db.user.create({
      data: {
        role: "WORKER", email, phone: nextPhone(), passwordHash: PW, name,
        kycTier: yrs >= 8 ? "TRUSTED" : "VERIFIED", emailVerified: true, phoneVerified: true, onboarded: true,
        workerProfile: {
          create: {
            headline, bio, location: city, experienceYears: yrs,
            rateHourly, rateWeekly,
            completedJobsCount: fresher ? 0 : 5 + yrs * int(4, 9),
            ratingAvg: fresher ? 0 : +(4.1 + rnd() * 0.85).toFixed(2),
            ratingPunctuality: fresher ? 0 : +(4.2 + rnd() * 0.7).toFixed(2),
            ratingQuality: fresher ? 0 : +(4.2 + rnd() * 0.7).toFixed(2),
            ratingCommunication: fresher ? 0 : +(4.1 + rnd() * 0.8).toFixed(2),
            availability: pick(["Available Now", "Available This Week", "Flexible"]),
            languages: langs, juryOptIn: juror,
            skills: { create: skillSet.filter((s) => skillId[s]).map((s) => ({ skillId: skillId[s], proficiency })) },
          },
        },
        wallet: { create: { custodialAddress: addr(email), balanceCache: 0, demoCredit: DEMO_CREDIT } },
      },
      include: { workerProfile: { select: { id: true } } },
    });
    workers.push({ id: u.id, wpId: u.workerProfile.id, email, name, catSlug, city, fresher, yrs, gender, juror, skillSet });
    idx++;
  }
  console.log(`  workers: ${cat.label} +${count}`);
}

// ---------------------------------------------------------------- CLIENTS (150)
const ORG_SUFFIX = ["Solutions Pvt Ltd", "Enterprises", "Services", "& Co", "Interiors", "Events", "Hospitality Group", "Constructions", "Technologies", "Caterers", "Facilities", "Ventures"];
const ORG_PREFIX = ["Sunrise", "Metro", "Prime", "Royal", "Green", "Blue", "Star", "Apex", "Elite", "Grand", "Urban", "Coastal", "Heritage", "Nova", "Peak", "Silver", "Orient", "Skyline"];
for (let c = 0; c < 150; c++) {
  const gender = chance(0.5) ? "female" : "male";
  const first = pick(gender === "female" ? FEMALE : MALE);
  const last = pick(SUR);
  const name = `${first} ${last}`;
  const isOrg = chance(0.42);
  const email = `${slug(first)}.${slug(last)}${idx}@${EMAIL_DOMAIN}`;
  const company = isOrg ? `${pick(ORG_PREFIX)} ${pick(ORG_SUFFIX)}` : null;
  const city = chance(0.4) ? pick(TOURIST) : pick(MAJOR);
  const u = await db.user.create({
    data: {
      role: "CLIENT", email, phone: nextPhone(), passwordHash: PW, name,
      kycTier: chance(0.3) ? "TRUSTED" : "VERIFIED", emailVerified: true, phoneVerified: true, onboarded: true,
      clientProfile: { create: { clientType: isOrg ? "BUSINESS" : "INDIVIDUAL", companyName: company, escrowReliabilityScore: int(78, 99), hiresCount: int(0, 24) } },
      wallet: { create: { custodialAddress: addr(email), balanceCache: 0, demoCredit: DEMO_CREDIT } },
    },
  });
  clients.push({ id: u.id, email, name, isOrg, company, city });
  idx++;
}
console.log(`  clients: +150 (${clients.filter((c) => c.isOrg).length} organizations, ${clients.filter((c) => !c.isOrg).length} individuals)`);

await db.wallet.updateMany({ data: { demoCredit: DEMO_CREDIT } });

// ---------------------------------------------------------------- extra jurors
let newJurors = 0;
for (const w of workers.filter((w) => w.juror)) {
  const exists = await adb.jurorProfile.findUnique({ where: { platformUserId: w.id } });
  if (!exists) {
    await adb.jurorProfile.create({ data: { platformUserId: w.id, displayName: w.name, status: "ACTIVE", stakeBalance: 1000, agreementRate: int(62, 92), casesCount: int(0, 9) } });
    newJurors++;
  }
}
const allJurors = await adb.jurorProfile.findMany({ where: { status: "ACTIVE" } });

// ---------------------------------------------------------------- helpers
const catName = (s) => CATS[s].label;
async function makeJob(client, worker, { published = true } = {}) {
  const cat = await db.category.findUnique({ where: { slug: worker.catSlug } });
  const roleName = pick(CATS[worker.catSlug].roles);
  const rate = int(2000, 30000);
  const title = `${roleName.charAt(0).toUpperCase() + roleName.slice(1)} needed — ${worker.city.split(" ")[0]}`;
  const job = await db.job.create({
    data: {
      clientId: client.id, title, description: `${client.company ?? client.name} needs a ${roleName} in ${worker.city}. Escrow-backed, milestone-based.`,
      categoryId: cat.id, location: worker.city, status: "PUBLISHED", urgent: chance(0.2),
      publishedAt: new Date(Date.now() - int(1, 25) * 86400e3),
    },
  });
  const skillName = worker.skillSet[0];
  const roleItem = await db.jobRoleLineItem.create({ data: { jobId: job.id, roleName, skillId: skillId[skillName] ?? null, headcount: 1, perPersonRate: rate, hiredCount: published ? 0 : 1 } });
  return { job, roleItem, rate, roleName };
}

// ---------------------------------------------------------------- active hires (~55 currently working)
let hiresMade = 0;
const experienced = workers.filter((w) => !w.fresher);
for (let i = 0; i < 55; i++) {
  const worker = pick(experienced);
  const client = pick(clients);
  const { job, roleItem, rate, roleName } = await makeJob(client, worker, { published: false });
  const nPhases = int(1, 3);
  const per = Math.round(rate / nPhases);
  const total = per * nPhases;
  const hire = await db.hire.create({ data: { jobId: job.id, roleLineItemId: roleItem.id, clientId: client.id, workerId: worker.id, totalValue: total, status: "ACTIVE" } });
  await db.contract.create({
    data: {
      hireId: hire.id, totalValue: total, scope: job.description, startDate: new Date(Date.now() - int(3, 20) * 86400e3),
      documentHash: createHash("sha256").update(hire.id).digest("hex"),
      clientSignature: client.name, clientSignedAt: new Date(Date.now() - int(3, 18) * 86400e3),
      workerSignature: worker.name, workerSignedAt: new Date(Date.now() - int(2, 17) * 86400e3),
    },
  });
  for (let p = 0; p < nPhases; p++) {
    const status = p < nPhases - 1 ? "RELEASED" : pick(["FUNDED", "IN_PROGRESS", "DELIVERED"]);
    await db.phase.create({ data: { hireId: hire.id, index: p + 1, name: `Phase ${p + 1} — ${roleName}`, amount: per, status,
      deliveredAt: status === "DELIVERED" || status === "RELEASED" ? new Date(Date.now() - int(1, 6) * 86400e3) : null,
      releasedAt: status === "RELEASED" ? new Date(Date.now() - int(1, 5) * 86400e3) : null } });
  }
  hiresMade++;
}

// ---------------------------------------------------------------- live disputes (~14 with jury)
let disputesMade = 0;
const DISPUTE_REASONS = [
  ["QUALITY", "Delivered work fell short of the approved sample; requesting a refund of the phase escrow."],
  ["PAYMENT", "Work delivered and demoed; client has gone quiet and won't approve release of the escrow."],
  ["NO_SHOW", "Worker missed the agreed start and stopped responding while escrow is locked."],
  ["CONDUCT", "Client keeps expanding scope beyond the signed milestones and pressuring for unpaid extra work."],
];
for (let i = 0; i < 14; i++) {
  const worker = pick(experienced);
  const client = pick(clients);
  const { job, roleItem, rate, roleName } = await makeJob(client, worker, { published: false });
  const hire = await db.hire.create({ data: { jobId: job.id, roleLineItemId: roleItem.id, clientId: client.id, workerId: worker.id, totalValue: rate, status: "ACTIVE" } });
  await db.contract.create({ data: { hireId: hire.id, totalValue: rate, scope: job.description, startDate: new Date(Date.now() - 12 * 86400e3), documentHash: createHash("sha256").update("d-" + hire.id).digest("hex"), clientSignature: client.name, clientSignedAt: new Date(Date.now() - 11 * 86400e3), workerSignature: worker.name, workerSignedAt: new Date(Date.now() - 10 * 86400e3) } });
  const phase = await db.phase.create({ data: { hireId: hire.id, index: 1, name: `${roleName} milestone`, amount: rate, status: "DISPUTED", deliveredAt: new Date(Date.now() - 4 * 86400e3) } });
  const [cat, desc] = pick(DISPUTE_REASONS);
  const workerRaised = cat === "PAYMENT";
  const complaint = await db.complaint.create({ data: { hireId: hire.id, phaseId: phase.id, filedById: workerRaised ? worker.id : client.id, category: cat, triageLane: "FINANCIAL", status: "ESCALATED", description: desc } });

  const tier = rate < 5000 ? "SMALL" : rate < 20000 ? "STANDARD" : "LARGE";
  const panelSize = tier === "SMALL" ? 3 : tier === "STANDARD" ? 5 : 7;
  const partyIds = [worker.id, client.id];
  const panel = shuffle(allJurors.filter((j) => !partyIds.includes(j.platformUserId))).slice(0, panelSize);
  if (panel.length < panelSize) continue;
  const now = Date.now();
  const c = await adb.disputeCase.create({ data: { complaintId: complaint.id, subjectHireId: hire.id, subjectPhaseId: phase.id, clientLabel: anon("Client", client.id), workerLabel: anon("Worker", worker.id), reason: desc.slice(0, 120), valueTier: tier, panelSize, escrowAmount: rate, status: "COMMIT", commitDeadline: new Date(now + 48 * 3600e3), revealDeadline: new Date(now + 72 * 3600e3) } });
  const committedCount = int(1, panelSize - 1); // some committed, some not -> live
  for (const [j, jr] of panel.entries()) {
    await adb.juryAssignment.create({ data: { caseId: c.id, jurorId: jr.id } });
    if (j < committedCount) {
      const choice = pick(["RELEASE_WORKER", "REFUND_CLIENT", "SPLIT"]);
      await adb.juryVote.create({ data: { caseId: c.id, jurorId: jr.id, commitHash: commitHash(choice, choice === "SPLIT" ? int(30, 70) : 0, "d500-" + c.id + "-" + j), committedAt: new Date(now - (j + 1) * 3600e3) } });
    } else {
      await adb.juryVote.create({ data: { caseId: c.id, jurorId: jr.id } });
    }
  }
  disputesMade++;
}

// ---------------------------------------------------------------- open jobs + fresher applications
let openJobs = [];
for (let i = 0; i < 45; i++) {
  const client = pick(clients);
  const w = pick(workers); // just for category flavour
  const { job, roleItem, rate } = await makeJob(client, w, { published: true });
  openJobs.push({ job, roleItem, rate });
}
let apps = 0;
const freshers = workers.filter((w) => w.fresher);
for (const oj of openJobs) {
  const n = int(0, 4);
  const applicants = shuffle(freshers).slice(0, n);
  for (const a of applicants) {
    try {
      await db.jobApplication.create({ data: { jobId: oj.job.id, roleLineItemId: oj.roleItem.id, workerId: a.id, status: pick(["APPLIED", "APPLIED", "UNDER_REVIEW"]), coverNote: `Keen to take this on — available immediately and happy to start with a small milestone.`, proposedRate: Math.round(oj.rate * (0.85 + rnd() * 0.25)), fitScore: int(55, 92) } });
      apps++;
    } catch { /* @@unique(roleLineItemId, workerId) collision — skip */ }
  }
}

console.log("\n=== SEED-500 COMPLETE ===");
console.log({
  d500_users: await db.user.count({ where: { email: { endsWith: "@" + EMAIL_DOMAIN } } }),
  total_users: await db.user.count(),
  workers_made: workers.length, clients_made: clients.length,
  active_hires: hiresMade, disputes: disputesMade, open_jobs: openJobs.length, applications: apps,
  new_jurors: newJurors, total_jurors: await adb.jurorProfile.count(),
});
await db.$disconnect();
await adb.$disconnect();
