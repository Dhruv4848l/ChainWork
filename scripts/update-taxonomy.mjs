/*
  Additive taxonomy updater — upserts the domain → role catalog into the LIVE
  Platform DB without resetting anything (existing jobs/hires/worker skills keep
  their ids). Mirrors `catData` in prisma/seed.ts — keep the two in sync.

  Run:  node --env-file=.env scripts/update-taxonomy.mjs
*/
import { PrismaClient } from "../src/generated/platform/index.js";

const CATALOG = [
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

const db = new PrismaClient();
let catsCreated = 0, catsUpdated = 0, skillsCreated = 0;

for (const c of CATALOG) {
  // Upsert the domain by slug (renames like Cooking → Kitchen & Catering keep the id).
  const existing = await db.category.findUnique({ where: { slug: c.slug } });
  const cat = existing
    ? await db.category.update({ where: { id: existing.id }, data: { name: c.name, icon: c.icon } })
    : await db.category.create({ data: { name: c.name, slug: c.slug, icon: c.icon } });
  existing ? catsUpdated++ : catsCreated++;

  for (const s of c.skills) {
    // Skill.name is globally unique — create only when missing; if it exists under
    // another category, move it under this domain.
    const skill = await db.skill.findUnique({ where: { name: s } });
    if (!skill) {
      await db.skill.create({ data: { name: s, categoryId: cat.id } });
      skillsCreated++;
    } else if (skill.categoryId !== cat.id) {
      await db.skill.update({ where: { id: skill.id }, data: { categoryId: cat.id } });
    }
  }
}

console.log(`domains: +${catsCreated} created, ${catsUpdated} updated · roles: +${skillsCreated} created`);
console.log("totals:", await db.category.count(), "domains,", await db.skill.count(), "roles");
await db.$disconnect();
