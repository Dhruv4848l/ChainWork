/*
  ChainWork seed — populates BOTH databases with realistic demo data that mirrors
  the design pack's examples (the 3-phase "Shop interior rewiring" hire on WK-11/CL-07,
  the ADM-12 dispute "Client #4521 vs Worker #1187", the ADM-17 PlatformConfig values).

  Idempotent: it clears both databases first, then recreates everything, so
  `npm run db:seed` can be run repeatedly. Platform data is created first so its IDs
  can be referenced (by ID only) from the Admin DB — demonstrating the two-DB boundary.

  Run: npm run db:seed
*/
import bcrypt from "bcryptjs";
import { PrismaClient as PlatformClient } from "../src/generated/platform";
import { PrismaClient as AdminClient } from "../src/generated/admin";

const platform = new PlatformClient();
const admin = new AdminClient();

// ---- date helpers (relative to "now") ----
const now = new Date();
const daysAgo = (n: number) => new Date(now.getTime() - n * 864e5);
const daysAhead = (n: number) => new Date(now.getTime() + n * 864e5);

// deterministic fake wallet address
const addr = (seed: string) =>
  "0x" +
  Buffer.from(seed).toString("hex").padEnd(40, "0").slice(0, 40);
const txHash = (seed: string) =>
  "0x" + Buffer.from(seed).toString("hex").padEnd(64, "0").slice(0, 64);

async function clearPlatform() {
  await platform.blogPost.deleteMany();
  await platform.notification.deleteMany();
  await platform.message.deleteMany();
  await platform.review.deleteMany();
  await platform.escrowTransaction.deleteMany();
  await platform.deliveryStake.deleteMany();
  await platform.complaint.deleteMany();
  await platform.phase.deleteMany();
  await platform.contract.deleteMany();
  await platform.hire.deleteMany();
  await platform.jobApplication.deleteMany();
  await platform.jobRoleLineItem.deleteMany();
  await platform.job.deleteMany();
  await platform.workerSkill.deleteMany();
  await platform.wallet.deleteMany();
  await platform.workerProfile.deleteMany();
  await platform.clientProfile.deleteMany();
  await platform.skill.deleteMany();
  await platform.category.deleteMany();
  await platform.user.deleteMany();
}

async function clearAdmin() {
  await admin.juryVote.deleteMany();
  await admin.juryAssignment.deleteMany();
  await admin.evidence.deleteMany();
  await admin.disputeCase.deleteMany();
  await admin.moderationAction.deleteMany();
  await admin.auditLog.deleteMany();
  await admin.jurorProfile.deleteMany();
  await admin.platformConfig.deleteMany();
  await admin.adminUser.deleteMany();
}

async function main() {
  console.log("Clearing both databases…");
  await clearPlatform();
  await clearAdmin();

  const pw = await bcrypt.hash("password123", 10);
  const adminPw = await bcrypt.hash("admin123", 10);

  // ------------------------------------------------------------------
  // Taxonomy
  // ------------------------------------------------------------------
  console.log("Seeding categories & skills…");
  // Domains → roles, Fiverr-style. Mirrored in scripts/update-taxonomy.mjs (the
  // additive updater for a live DB) — keep the two in sync.
  const catData = [
    { name: "Tech & Digital", slug: "tech-digital", icon: "💻", skills: [
      "Web Design", "Web Development", "Mobile App Development", "UI/UX Design",
      "Graphic Design", "SEO & Digital Marketing", "IT Support", "Data Entry",
    ] },
    { name: "Electrical & Appliances", slug: "electrical", icon: "⚡", skills: [
      "Electrician", "Wiring", "Panel Installation", "Fan & Cooler Repair",
      "AC Repair", "Washing Machine Repair", "Refrigerator Repair",
    ] },
    { name: "Kitchen & Catering", slug: "cooking", icon: "🍳", skills: [
      "Chef", "Cook", "Kitchen Helper (Commis)", "Baker", "Catering", "Barista",
    ] },
    { name: "Construction & Repair", slug: "construction", icon: "🔨", skills: [
      "Carpenter", "Plumber", "Mason", "Welder", "Tiling & Flooring",
    ] },
    { name: "Decoration", slug: "decoration", icon: "🎨", skills: ["Decorator", "Painter", "Event Decor"] },
    { name: "Driving", slug: "driving", icon: "🚗", skills: ["Driver", "Delivery"] },
    { name: "Cleaning", slug: "cleaning", icon: "🧹", skills: ["Cleaner", "Housekeeping", "Pest Control"] },
    { name: "Hospitality", slug: "hospitality", icon: "🍽️", skills: ["Waiter", "Helper", "Event Staff"] },
  ];
  const skillByName: Record<string, string> = {};
  for (const c of catData) {
    const cat = await platform.category.create({
      data: { name: c.name, slug: c.slug, icon: c.icon },
    });
    for (const s of c.skills) {
      const skill = await platform.skill.create({
        data: { name: s, categoryId: cat.id },
      });
      skillByName[s] = skill.id;
    }
  }
  const categories = await platform.category.findMany();
  const catByName = Object.fromEntries(categories.map((c) => [c.name, c.id]));

  // ------------------------------------------------------------------
  // Users, profiles, wallets
  // ------------------------------------------------------------------
  console.log("Seeding users…");

  async function makeWorker(opts: {
    name: string; email: string; phone: string; kycTier: string;
    headline: string; location: string; experienceYears: number;
    completedJobs: number; rating: number; skills: [string, string][];
    juryOptIn?: boolean; languages: string[]; balance: number;
  }) {
    const user = await platform.user.create({
      data: {
        role: "WORKER", email: opts.email, phone: opts.phone, passwordHash: pw,
        name: opts.name, kycTier: opts.kycTier as never,
        emailVerified: true, phoneVerified: true,
        workerProfile: {
          create: {
            headline: opts.headline, location: opts.location,
            experienceYears: opts.experienceYears,
            completedJobsCount: opts.completedJobs,
            ratingAvg: opts.rating, ratingPunctuality: opts.rating,
            ratingQuality: opts.rating, ratingCommunication: opts.rating,
            availability: "Weekdays", languages: opts.languages,
            juryOptIn: opts.juryOptIn ?? false,
          },
        },
        wallet: { create: { custodialAddress: addr("w-" + opts.email), balanceCache: opts.balance } },
      },
      include: { workerProfile: true },
    });
    for (const [skillName, prof] of opts.skills) {
      await platform.workerSkill.create({
        data: { workerProfileId: user.workerProfile!.id, skillId: skillByName[skillName], proficiency: prof as never },
      });
    }
    return user;
  }

  async function makeClient(opts: {
    name: string; email: string; phone: string; type: string;
    company?: string; kycTier: string; balance: number; hires?: number;
  }) {
    return platform.user.create({
      data: {
        role: "CLIENT", email: opts.email, phone: opts.phone, passwordHash: pw,
        name: opts.name, kycTier: opts.kycTier as never,
        emailVerified: true, phoneVerified: true,
        clientProfile: {
          create: {
            clientType: opts.type as never, companyName: opts.company,
            hiresCount: opts.hires ?? 0,
          },
        },
        wallet: { create: { custodialAddress: addr("c-" + opts.email), balanceCache: opts.balance } },
      },
    });
  }

  const ravi = await makeWorker({
    name: "Ravi Kumar", email: "ravi@chainwork.dev", phone: "+919800000001",
    kycTier: "VERIFIED", headline: "Licensed electrician · 8 yrs",
    location: "Bengaluru", experienceYears: 8, completedJobs: 142, rating: 4.9,
    languages: ["Hindi", "English", "Kannada"], balance: 24500,
    skills: [["Electrician", "EXPERT"], ["Wiring", "EXPERT"], ["Panel Installation", "SKILLED"]],
  });
  const suresh = await makeWorker({
    name: "Suresh Patel", email: "suresh@chainwork.dev", phone: "+919800000002",
    kycTier: "TRUSTED", headline: "Cook & caterer · 12 yrs",
    location: "Bengaluru", experienceYears: 12, completedJobs: 210, rating: 4.8,
    languages: ["Hindi", "English"], balance: 40100, juryOptIn: true,
    skills: [["Cook", "EXPERT"], ["Catering", "EXPERT"]],
  });
  const meena = await makeWorker({
    name: "Meena Nair", email: "meena@chainwork.dev", phone: "+919800000003",
    kycTier: "VERIFIED", headline: "Event decorator", location: "Bengaluru",
    experienceYears: 6, completedJobs: 88, rating: 4.7,
    languages: ["English", "Malayalam"], balance: 15200, juryOptIn: true,
    skills: [["Decorator", "EXPERT"], ["Event Decor", "SKILLED"]],
  });
  const arjun = await makeWorker({
    name: "Arjun Singh", email: "arjun@chainwork.dev", phone: "+919800000004",
    kycTier: "VERIFIED", headline: "Driver · 5 yrs", location: "Bengaluru",
    experienceYears: 5, completedJobs: 64, rating: 4.6,
    languages: ["Hindi", "Punjabi"], balance: 9800, juryOptIn: true,
    skills: [["Driver", "SKILLED"], ["Delivery", "SKILLED"]],
  });
  const lakshmi = await makeWorker({
    name: "Lakshmi Rao", email: "lakshmi@chainwork.dev", phone: "+919800000005",
    kycTier: "TRUSTED", headline: "Housekeeping supervisor", location: "Bengaluru",
    experienceYears: 10, completedJobs: 156, rating: 4.9,
    languages: ["Telugu", "English"], balance: 31000, juryOptIn: true,
    skills: [["Cleaner", "EXPERT"], ["Housekeeping", "EXPERT"]],
  });

  const imran = await makeClient({
    name: "Imran K.", email: "imran@chainwork.dev", phone: "+919811000001",
    type: "INDIVIDUAL", kycTier: "VERIFIED", balance: 50000, hires: 4,
  });
  const eventsCo = await makeClient({
    name: "R. Events & Decor", email: "events@chainwork.dev", phone: "+919811000002",
    type: "BUSINESS", company: "R. Events & Decor Pvt Ltd", kycTier: "TRUSTED",
    balance: 220000, hires: 37,
  });
  const quickfix = await makeClient({
    name: "QuickFix Co", email: "quickfix@chainwork.dev", phone: "+919811000003",
    type: "BUSINESS", company: "QuickFix Co", kycTier: "BASIC", balance: 12000, hires: 2,
  });

  // ------------------------------------------------------------------
  // Jobs (incl. a multi-role wedding job) + applications
  // ------------------------------------------------------------------
  console.log("Seeding jobs & applications…");

  // Job 1: Shop interior rewiring (single electrician role) — Ravi gets hired.
  const shopJob = await platform.job.create({
    data: {
      clientId: imran.id, title: "Shop interior rewiring",
      description: "Full rewiring of a 1200 sq ft retail shop: prep, wiring & panel, finish & testing. 3 phases.",
      categoryId: catByName["Electrical"], status: "PUBLISHED",
      location: "Bengaluru", startDate: daysAgo(10), endDate: daysAhead(5),
      fundingMode: "FUND_AT_HIRE", publishedAt: daysAgo(14), expiresAt: daysAhead(20),
      roleLineItems: {
        create: [{ roleName: "Electrician", skillId: skillByName["Electrician"], headcount: 1, perPersonRate: 18000, hiredCount: 1 }],
      },
    },
    include: { roleLineItems: true },
  });
  const shopRole = shopJob.roleLineItems[0];

  // Job 2: Wedding — multi-role (5 helpers, 2 decorators, 3 electricians)
  const weddingJob = await platform.job.create({
    data: {
      clientId: eventsCo.id, title: "Wedding — 2-day setup crew",
      description: "Need a crew for a 2-day wedding: helpers, decorators, and electricians for stage & lighting.",
      categoryId: catByName["Decoration"], status: "PUBLISHED",
      location: "Bengaluru", startDate: daysAhead(7), endDate: daysAhead(9),
      fundingMode: "FUND_NOW", publishedAt: daysAgo(3), expiresAt: daysAhead(6),
      roleLineItems: {
        create: [
          { roleName: "Helper", skillId: skillByName["Helper"], headcount: 5, perPersonRate: 800 },
          { roleName: "Decorator", skillId: skillByName["Decorator"], headcount: 2, perPersonRate: 2500 },
          { roleName: "Electrician", skillId: skillByName["Electrician"], headcount: 3, perPersonRate: 3000 },
        ],
      },
    },
    include: { roleLineItems: true },
  });

  // Job 3: Restaurant waiters (urgent)
  const waiterJob = await platform.job.create({
    data: {
      clientId: quickfix.id, title: "4 waiters — holiday weekend",
      description: "Busy holiday weekend, need 4 experienced waiters for 3 shifts.",
      categoryId: catByName["Hospitality"], status: "PUBLISHED", urgent: true,
      location: "Bengaluru", startDate: daysAhead(2), endDate: daysAhead(4),
      fundingMode: "FUND_AT_HIRE", publishedAt: daysAgo(1), expiresAt: daysAhead(2),
      roleLineItems: { create: [{ roleName: "Waiter", skillId: skillByName["Waiter"], headcount: 4, perPersonRate: 1200 }] },
    },
    include: { roleLineItems: true },
  });

  // Job 4: a draft (unpublished) job by Imran
  await platform.job.create({
    data: {
      clientId: imran.id, title: "Kitchen deep-clean (draft)",
      description: "One-time deep clean of a restaurant kitchen.",
      categoryId: catByName["Cleaning"], status: "DRAFT",
      roleLineItems: { create: [{ roleName: "Cleaner", skillId: skillByName["Cleaner"], headcount: 2, perPersonRate: 1500 }] },
    },
  });

  // Applications
  await platform.jobApplication.create({
    data: { jobId: shopJob.id, roleLineItemId: shopRole.id, workerId: ravi.id, status: "HIRED", proposedRate: 18000, fitScore: 96, coverNote: "8 yrs on commercial rewiring, licensed." },
  });
  const decoratorRole = weddingJob.roleLineItems.find((r) => r.roleName === "Decorator")!;
  const weddingElecRole = weddingJob.roleLineItems.find((r) => r.roleName === "Electrician")!;
  await platform.jobApplication.create({
    data: { jobId: weddingJob.id, roleLineItemId: decoratorRole.id, workerId: meena.id, status: "UNDER_REVIEW", proposedRate: 2500, fitScore: 91, coverNote: "Specialise in wedding stages." },
  });
  await platform.jobApplication.create({
    data: { jobId: weddingJob.id, roleLineItemId: weddingElecRole.id, workerId: ravi.id, status: "APPLIED", proposedRate: 3000, fitScore: 88 },
  });
  await platform.jobApplication.create({
    data: { jobId: waiterJob.id, roleLineItemId: waiterJob.roleLineItems[0].id, workerId: arjun.id, status: "APPLIED", proposedRate: 1200, fitScore: 72 },
  });

  // ------------------------------------------------------------------
  // The key hire: Shop rewiring, 3 phases at different states
  // ------------------------------------------------------------------
  console.log("Seeding the 3-phase shop-rewiring hire…");
  const shopHire = await platform.hire.create({
    data: {
      jobId: shopJob.id, roleLineItemId: shopRole.id, clientId: imran.id, workerId: ravi.id,
      status: "ACTIVE", totalValue: 18000,
      contract: {
        create: {
          totalValue: 18000, startDate: daysAgo(10), endDate: daysAhead(5),
          scope: "Rewire 1200 sq ft retail shop across 3 phases: prep, wiring & panel, finish & testing.",
          cancellationTerms: "10% penalty on pre-work cancellation, per platform policy.",
          onChainEscrowAddress: addr("escrow-shop-hire"),
          acceptedByClient: true, acceptedByWorker: true, acceptedAt: daysAgo(10),
        },
      },
      phases: {
        create: [
          { index: 1, name: "Prep & assessment", amount: 4000, dueDate: daysAgo(7), status: "RELEASED", deliveredAt: daysAgo(8), verificationDeadline: daysAgo(6), releasedAt: daysAgo(6), onChainEscrowAddress: addr("escrow-shop-p1") },
          { index: 2, name: "Wiring & panel", amount: 8000, dueDate: daysAgo(1), status: "DISPUTED", deliveredAt: daysAgo(2), verificationDeadline: daysAhead(0), reminderCount: 1, onChainEscrowAddress: addr("escrow-shop-p2") },
          { index: 3, name: "Finish & testing", amount: 6000, dueDate: daysAhead(4), status: "PENDING_FUNDING" },
        ],
      },
      deliveryStake: { create: { amount: 1800, status: "LOCKED", lockedAt: daysAgo(10), onChainTxHash: txHash("stake-shop") } },
    },
    include: { phases: true },
  });
  const phase1 = shopHire.phases.find((p) => p.index === 1)!;
  const phase2 = shopHire.phases.find((p) => p.index === 2)!;

  // Escrow ledger for phases 1 (fund+release) and 2 (fund, now frozen)
  await platform.escrowTransaction.createMany({
    data: [
      { phaseId: phase1.id, type: "FUND", status: "CONFIRMED", amount: 4000, fromAddress: addr("c-imran@chainwork.dev"), toAddress: addr("escrow-shop-p1"), onChainTxHash: txHash("fund-p1"), createdAt: daysAgo(9) },
      { phaseId: phase1.id, type: "RELEASE", status: "CONFIRMED", amount: 4000, fromAddress: addr("escrow-shop-p1"), toAddress: addr("w-ravi@chainwork.dev"), onChainTxHash: txHash("rel-p1"), createdAt: daysAgo(6) },
      { phaseId: phase2.id, type: "FUND", status: "CONFIRMED", amount: 8000, fromAddress: addr("c-imran@chainwork.dev"), toAddress: addr("escrow-shop-p2"), onChainTxHash: txHash("fund-p2"), createdAt: daysAgo(4) },
    ],
  });

  // The complaint that escalated phase 2 to the jury
  const complaint = await platform.complaint.create({
    data: {
      hireId: shopHire.id, phaseId: phase2.id, filedById: imran.id,
      category: "QUALITY", triageLane: "FINANCIAL", status: "ESCALATED",
      description: "Socket count short of plan — panel phase delivered with fewer outlets than agreed.",
      evidenceRefs: ["photo-panel-1.jpg", "chat-log-16jul.txt"], createdAt: daysAgo(1),
    },
  });

  // A second, fully-completed hire so reviews exist on a completed hire
  console.log("Seeding a completed hire + reviews…");
  const chimneyJob = await platform.job.create({
    data: {
      clientId: imran.id, title: "Kitchen chimney & wiring fix",
      description: "Replace kitchen chimney wiring and install new switchboard.",
      categoryId: catByName["Electrical"], status: "ARCHIVED",
      publishedAt: daysAgo(40), startDate: daysAgo(35), endDate: daysAgo(33),
      roleLineItems: { create: [{ roleName: "Electrician", skillId: skillByName["Electrician"], headcount: 1, perPersonRate: 3500, hiredCount: 1 }] },
    },
    include: { roleLineItems: true },
  });
  const chimneyHire = await platform.hire.create({
    data: {
      jobId: chimneyJob.id, roleLineItemId: chimneyJob.roleLineItems[0].id,
      clientId: imran.id, workerId: ravi.id, status: "COMPLETED", totalValue: 3500,
      contract: { create: { totalValue: 3500, scope: "Chimney wiring + switchboard.", onChainEscrowAddress: addr("escrow-chimney"), acceptedByClient: true, acceptedByWorker: true, acceptedAt: daysAgo(35) } },
      phases: { create: [{ index: 1, name: "Full job", amount: 3500, status: "RELEASED", deliveredAt: daysAgo(34), releasedAt: daysAgo(33) }] },
    },
  });
  await platform.review.createMany({
    data: [
      { hireId: chimneyHire.id, direction: "CLIENT_TO_WORKER", authorId: imran.id, subjectId: ravi.id, ratingOverall: 5, ratingPunctuality: 5, ratingQuality: 5, ratingCommunication: 5, text: "On time, clean work, explained everything.", createdAt: daysAgo(32) },
      { hireId: chimneyHire.id, direction: "WORKER_TO_CLIENT", authorId: ravi.id, subjectId: imran.id, ratingOverall: 5, ratingPunctuality: 5, ratingQuality: 5, ratingCommunication: 5, text: "Clear scope, paid promptly.", createdAt: daysAgo(32) },
    ],
  });

  // Messages on the shop hire
  await platform.message.createMany({
    data: [
      { hireId: shopHire.id, senderId: imran.id, body: "Phase 2 looks short on sockets vs the plan — can you check?", sentAt: daysAgo(1) },
      { hireId: shopHire.id, senderId: ravi.id, body: "The plan revision only listed 6; happy to add the rest as a small extra.", sentAt: daysAgo(1) },
    ],
  });

  // Notifications
  await platform.notification.createMany({
    data: [
      { userId: ravi.id, type: "PAYMENT", title: "Payment released", body: "₹4,000 for Phase 1 (Prep & assessment) was released to your wallet.", createdAt: daysAgo(6) },
      { userId: ravi.id, type: "DISPUTE", title: "Phase under dispute", body: "Phase 2 (Wiring & panel) has been escalated to jury review.", createdAt: daysAgo(1) },
      { userId: imran.id, type: "ESCROW", title: "Escrow funded", body: "₹8,000 locked for Phase 2 (Wiring & panel).", read: true, createdAt: daysAgo(4) },
      { userId: meena.id, type: "APPLICATION", title: "Application under review", body: "R. Events & Decor is reviewing your decorator application.", createdAt: daysAgo(2) },
    ],
  });

  // ------------------------------------------------------------------
  // Blog posts (PUB-05/06) — copy from the design pack
  // ------------------------------------------------------------------
  console.log("Seeding blog posts…");
  const longBody = [
    "After fourteen years of house calls, these are the things I wish every client asked me before I touched a wire. First: ask to see the load calculation, not just a quote. A number without a breakdown means the breakdown happens later — on your bill.",
    "Agree the scope in the ChainWork chat, not on a phone call. If anything is disputed later, that chat is the evidence. It protects both sides equally.",
    "Check the Certified badge — it means an admin has actually reviewed the trade certificate, it isn't self-declared. And fund the escrow before the visit. Every serious tradesperson I know sorts funded jobs to the top.",
  ].join("\n\n");
  await platform.blogPost.createMany({
    data: [
      { slug: "check-before-hiring-electrician", tag: "Electrical", title: "What to check before hiring an electrician", excerpt: "The four things I wish every client asked me before I touched a wire.", body: longBody, authorName: "Ravi Kumar", readMinutes: 4, publishedAt: daysAgo(6) },
      { slug: "how-i-price-a-same-day-repair", tag: "Pricing", title: "How I price a same-day repair", excerpt: "Transparent pricing wins repeat clients. Here's my breakdown.", body: "Same-day work carries a premium, and that's fair — but it should be itemised, not hidden. I split every quote into call-out, parts, and labour, and I put it in the chat before I start.\n\nFunded escrow means I don't pad the price to cover the risk of not being paid. That saving goes straight back to the client.", authorName: "Arif Shaikh", readMinutes: 3, publishedAt: daysAgo(12) },
      { slug: "hiring-a-full-wedding-crew", tag: "Events", title: "Hiring a full wedding crew in one post", excerpt: "One job post can hire a whole crew — each role with its own rate.", body: "A wedding needs helpers, decorators, and electricians all at once. Instead of three separate posts, use role line items: one post, three roles, each with its own headcount and rate.\n\nFund each phase as it comes due, and every worker sees their pay is already locked before they show up.", authorName: "ChainWork Team", readMinutes: 6, publishedAt: daysAgo(20) },
      { slug: "how-escrow-protects-both-sides", tag: "Trust", title: "How escrow actually protects both sides", excerpt: "A plain-language look at what the smart contract really does.", body: "When a client funds a job, the money moves into a smart contract — a locked vault neither side, nor ChainWork, can open alone. It opens on mutual confirmation, on window expiry, or on a jury verdict.\n\nThe worker knows the money is there. The client knows it won't release until the work is done. Nobody has to trust the other's word.", authorName: "ChainWork Team", readMinutes: 7, publishedAt: daysAgo(28) },
    ],
  });

  // ==================================================================
  // ADMIN / JURY DB  — references platform data by ID ONLY
  // ==================================================================
  console.log("Seeding Admin/Jury DB…");

  await admin.adminUser.createMany({
    data: [
      { email: "root@chainwork.local", passwordHash: adminPw, name: "Root Super Admin", role: "ROOT_SUPER_ADMIN", twoFactorEnabled: true, totpSecret: "JBSWY3DPEHPK3PXP" },
      { email: "verify@chainwork.local", passwordHash: adminPw, name: "Verification Officer", role: "VERIFICATION_OFFICER" },
      { email: "finance@chainwork.local", passwordHash: adminPw, name: "Finance & Compliance", role: "FINANCE_COMPLIANCE_OFFICER" },
      { email: "support@chainwork.local", passwordHash: adminPw, name: "Support Agent", role: "SUPPORT_AGENT" },
      { email: "analyst@chainwork.local", passwordHash: adminPw, name: "Analyst (read-only)", role: "ANALYST" },
    ],
  });
  const root = await admin.adminUser.findUniqueOrThrow({ where: { email: "root@chainwork.local" } });

  // PlatformConfig — the exact ADM-17 values.
  console.log("Seeding PlatformConfig (ADM-17)…");
  await admin.platformConfig.createMany({
    data: [
      { key: "commission_worker_pct", value: "5", valueType: "PERCENT", category: "fees", hint: "Platform commission, worker side" },
      { key: "commission_client_pct", value: "3", valueType: "PERCENT", category: "fees", hint: "Platform commission, client side" },
      { key: "verification_window_working_days", value: "2", valueType: "DURATION", category: "escrow", hint: "Escrow auto-release timeout per phase (business days)" },
      { key: "reminder_cap_per_window", value: "2", valueType: "NUMBER", category: "escrow", hint: "Reminders per verification window, then auto-resolve fires" },
      { key: "cancellation_penalty_pct", value: "10", valueType: "PERCENT", category: "fees", hint: "Pre-work cancellation penalty" },
      { key: "delivery_stake_threshold_inr", value: "10000", valueType: "NUMBER", category: "escrow", hint: "Contracts above this lock a worker delivery stake" },
      { key: "kyc_mandatory_threshold_inr", value: "0", valueType: "NUMBER", category: "kyc", hint: "KYC gate before any money movement" },
      { key: "jury_panel_small", value: "3", valueType: "NUMBER", category: "jury", hint: "Panel size — small case value" },
      { key: "jury_panel_standard", value: "5", valueType: "NUMBER", category: "jury", hint: "Panel size — standard case value" },
      { key: "jury_panel_large", value: "7", valueType: "NUMBER", category: "jury", hint: "Panel size — large case value" },
      { key: "juror_stake_inr", value: "1000", valueType: "NUMBER", category: "jury", hint: "Per case, refundable on majority" },
      { key: "voting_commit_hours", value: "48", valueType: "DURATION", category: "jury", hint: "Commit window" },
      { key: "voting_reveal_hours", value: "24", valueType: "DURATION", category: "jury", hint: "Reveal window" },
      { key: "appeal_window_hours", value: "72", valueType: "DURATION", category: "jury", hint: "Either party may appeal once within this window" },
      { key: "appeal_panel_size", value: "7", valueType: "NUMBER", category: "jury", hint: "Appeals go to a larger panel" },
      { key: "appeal_fee_inr", value: "1500", valueType: "NUMBER", category: "jury", hint: "Partially forfeitable appeal fee" },
      { key: "juror_eligibility_min_rating", value: "4.5", valueType: "NUMBER", category: "jury", hint: "Minimum worker rating to be a juror" },
      { key: "juror_eligibility_min_jobs", value: "25", valueType: "NUMBER", category: "jury", hint: "Minimum completed jobs to be a juror" },
      { key: "juror_eligibility_min_kyc", value: "VERIFIED", valueType: "STRING", category: "jury", hint: "Minimum KYC tier to be a juror" },
    ],
  });

  // Jurors — reference platform users by ID only (NO cross-DB FK).
  console.log("Seeding jurors…");
  const jurorSeeds = [
    { u: suresh, agree: 92, cases: 31 },
    { u: meena, agree: 88, cases: 18 },
    { u: arjun, agree: 79, cases: 12 },
    { u: lakshmi, agree: 95, cases: 44 },
  ];
  const jurors = [];
  for (const j of jurorSeeds) {
    jurors.push(
      await admin.jurorProfile.create({
        data: { platformUserId: j.u.id, displayName: j.u.name, stakeBalance: 1000, agreementRate: j.agree, casesCount: j.cases, status: "ACTIVE" },
      })
    );
  }
  // one more juror who is a client (business jurors allowed)
  const businessJuror = await admin.jurorProfile.create({
    data: { platformUserId: eventsCo.id, displayName: eventsCo.name, stakeBalance: 1000, agreementRate: 89, casesCount: 27, status: "ON_LEAVE" },
  });

  // The dispute case (ADM-12) — Phase 2 of the shop hire. Parties anonymized.
  console.log("Seeding the dispute case (ADM-12)…");
  const dispute = await admin.disputeCase.create({
    data: {
      complaintId: complaint.id, subjectHireId: shopHire.id, subjectPhaseId: phase2.id,
      clientLabel: "Client #4521", workerLabel: "Worker #1187",
      reason: "Quality dispute — socket count short of plan (Phase 2: Wiring & panel).",
      valueTier: "STANDARD", panelSize: 5, escrowAmount: 8000,
      escrowInstanceAddress: addr("escrow-shop-p2"), status: "REVEAL",
      commitDeadline: daysAgo(0), revealDeadline: daysAhead(1),
    },
  });
  // Assign a 5-juror panel (STANDARD). We only have 5 jurors — perfect.
  const panel = [...jurors, businessJuror];
  for (const jp of panel) {
    await admin.juryAssignment.create({ data: { caseId: dispute.id, jurorId: jp.id } });
  }
  // Some votes committed; a few revealed (mid-reveal window)
  await admin.juryVote.create({ data: { caseId: dispute.id, jurorId: jurors[0].id, commitHash: txHash("commit-1"), committedAt: daysAgo(1), revealedChoice: "SPLIT", revealedSplitPct: 60, salt: "s1", revealedAt: daysAgo(0) } });
  await admin.juryVote.create({ data: { caseId: dispute.id, jurorId: jurors[1].id, commitHash: txHash("commit-2"), committedAt: daysAgo(1), revealedChoice: "RELEASE_WORKER", salt: "s2", revealedAt: daysAgo(0) } });
  await admin.juryVote.create({ data: { caseId: dispute.id, jurorId: jurors[3].id, commitHash: txHash("commit-3"), committedAt: daysAgo(1) } });

  await admin.evidence.createMany({
    data: [
      { caseId: dispute.id, submittedByLabel: "Client #4521", fileRef: "photo-panel-1.jpg", hash: txHash("ev-1"), createdAt: daysAgo(1) },
      { caseId: dispute.id, submittedByLabel: "Worker #1187", fileRef: "plan-revision.pdf", hash: txHash("ev-2"), createdAt: daysAgo(1) },
    ],
  });

  // Audit log entries
  await admin.auditLog.createMany({
    data: [
      { actorAdminId: root.id, action: "CONFIG_SEEDED", targetType: "PlatformConfig", targetId: "all", after: { note: "Initial ADM-17 values seeded" }, createdAt: daysAgo(30) },
      { actorLabel: "Support Agent", action: "COMPLAINT_ESCALATED", targetType: "DisputeCase", targetId: dispute.id, after: { lane: "FINANCIAL", panelSize: 5 }, createdAt: daysAgo(1) },
    ],
  });

  // ------------------------------------------------------------------
  // Summary
  // ------------------------------------------------------------------
  const counts = {
    users: await platform.user.count(),
    jobs: await platform.job.count(),
    hires: await platform.hire.count(),
    phases: await platform.phase.count(),
    escrowTx: await platform.escrowTransaction.count(),
    admins: await admin.adminUser.count(),
    config: await admin.platformConfig.count(),
    jurors: await admin.jurorProfile.count(),
    disputes: await admin.disputeCase.count(),
  };
  console.log("Seed complete:", counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await platform.$disconnect();
    await admin.$disconnect();
  });
