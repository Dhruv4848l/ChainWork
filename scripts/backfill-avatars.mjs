/*
  Attaches a UNIQUE synthetic face to every user that has no avatar yet — the 500
  demo accounts AND the base-seed users. Each face is freshly generated (gender-matched,
  Asian) at this-person-does-not-exist.com, downloaded, and uploaded to Cloudinary; only
  the res.cloudinary.com URL is stored. No two accounts share an image (each generation
  is unique). Resumable + retrying: safe to re-run until every avatar is filled.

  Run:  node --env-file=.env scripts/backfill-avatars.mjs
*/
import crypto from "node:crypto";
import { PrismaClient } from "../src/generated/platform/index.js";

const db = new PrismaClient();
const CLOUD = process.env.CLOUDINARY_CLOUD_NAME, KEY = process.env.CLOUDINARY_API_KEY, SECRET = process.env.CLOUDINARY_API_SECRET;
if (!CLOUD || !KEY || !SECRET) { console.error("Missing CLOUDINARY_* env"); process.exit(1); }
const BASE = "https://this-person-does-not-exist.com";
const CONCURRENCY = 6;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";

const FEMALE = new Set(["Aanya","Aadhya","Diya","Saanvi","Ananya","Priya","Neha","Pooja","Sneha","Kavya","Ishita","Riya","Divya","Meera","Meena","Anjali","Shreya","Nisha","Swati","Deepika","Preeti","Kirti","Sunita","Rekha","Lakshmi","Radha","Geeta","Aishwarya","Tanvi","Sanya","Kritika","Naina","Simran","Aditi","Bhavna","Payal","Ritu","Sakshi","Fatima","Ayesha","Zoya","Sana","Nikita","Pallavi","Snehal","Vaishnavi","Ishika","Mary","Grace","Rita","Asha","Anita","Kavita","Shanti","Devika","Maria"]);
const genderOf = (name) => (FEMALE.has(name.trim().split(/\s+/)[0]) ? "female" : "male");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function retry(fn, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) { try { return await fn(); } catch (e) { last = e; await sleep(500 + i * 700); } }
  throw last;
}

async function genFaceUrl(gender) {
  return retry(async () => {
    const r = await fetch(`${BASE}/new?gender=${gender}&age=19-40&etnic=asian&_=${Date.now()}${Math.floor(Math.random() * 1e9)}`, { headers: { "User-Agent": UA, "Referer": BASE + "/" } });
    const j = await r.json();
    if (!j.src) throw new Error("no src");
    return BASE + j.src;
  });
}
async function uploadFace(faceUrl, folder) {
  return retry(async () => {
    const img = await fetch(faceUrl, { headers: { "User-Agent": UA, "Referer": BASE + "/" } });
    const buf = Buffer.from(await img.arrayBuffer());
    if (buf.length < 2000) throw new Error("tiny image");
    const ts = Math.floor(Date.now() / 1000);
    const sig = crypto.createHash("sha1").update(`folder=${folder}&timestamp=${ts}` + SECRET).digest("hex");
    const form = new FormData();
    form.append("file", new Blob([buf], { type: "image/jpeg" }), "face.jpg");
    form.append("api_key", KEY); form.append("timestamp", String(ts)); form.append("folder", folder); form.append("signature", sig);
    const up = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/image/upload`, { method: "POST", body: form });
    const j = await up.json();
    if (!j.secure_url) throw new Error("upload: " + JSON.stringify(j).slice(0, 120));
    return j.secure_url;
  });
}

const users = await retry(() => db.user.findMany({ where: { avatarUrl: null }, select: { id: true, name: true } }), 5);
console.log(`${users.length} users need an avatar. Uploading (concurrency ${CONCURRENCY})…`);

let done = 0, failed = 0;
async function worker(queue) {
  while (queue.length) {
    const u = queue.pop();
    try {
      const faceUrl = await genFaceUrl(genderOf(u.name));
      const url = await uploadFace(faceUrl, "chainwork/avatars");
      await retry(() => db.user.update({ where: { id: u.id }, data: { avatarUrl: url } }), 3);
      done++;
    } catch (e) {
      failed++;
      console.error("  FAILED", u.name, "-", (e.message || e).toString().slice(0, 80));
    }
    if ((done + failed) % 25 === 0) console.log(`  progress: ${done} done, ${failed} failed, ${queue.length} left`);
  }
}
const queue = [...users];
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)));

console.log(`\nDONE — ${done} avatars set, ${failed} failed. Remaining without avatar: ${await db.user.count({ where: { avatarUrl: null } })}`);
await db.$disconnect();
