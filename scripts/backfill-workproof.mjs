/*
  Adds 1-2 UNIQUE work-proof photos to each EXPERIENCED worker's portfolio (freshers
  have no track record yet). Images come from Lorem Picsum (free-license Unsplash),
  seeded uniquely per slot, uploaded to Cloudinary; only URLs are stored in
  WorkerProfile.portfolioImages. Resumable: skips workers that already have photos.
  Run:  node --env-file=.env scripts/backfill-workproof.mjs
*/
import crypto from "node:crypto";
import { PrismaClient } from "../src/generated/platform/index.js";
const db = new PrismaClient();
const CLOUD = process.env.CLOUDINARY_CLOUD_NAME, KEY = process.env.CLOUDINARY_API_KEY, SECRET = process.env.CLOUDINARY_API_SECRET;
const CONCURRENCY = 6;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function retry(fn, n = 3) { let e; for (let i = 0; i < n; i++) { try { return await fn(); } catch (x) { e = x; await sleep(400 + i * 600); } } throw e; }

async function uploadPicsum(seed, folder) {
  return retry(async () => {
    const img = await fetch(`https://picsum.photos/seed/${seed}/640/480`, { redirect: "follow" });
    const buf = Buffer.from(await img.arrayBuffer());
    if (buf.length < 2000) throw new Error("tiny");
    const ts = Math.floor(Date.now() / 1000);
    const sig = crypto.createHash("sha1").update(`folder=${folder}&timestamp=${ts}` + SECRET).digest("hex");
    const form = new FormData();
    form.append("file", new Blob([buf], { type: "image/jpeg" }), "work.jpg");
    form.append("api_key", KEY); form.append("timestamp", String(ts)); form.append("folder", folder); form.append("signature", sig);
    const up = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/image/upload`, { method: "POST", body: form });
    const j = await up.json();
    if (!j.secure_url) throw new Error("upload " + JSON.stringify(j).slice(0, 100));
    return j.secure_url;
  });
}

const workers = await retry(() => db.workerProfile.findMany({
  where: { experienceYears: { gt: 0 }, portfolioImages: { isEmpty: true } },
  select: { id: true, userId: true },
}), 5);
console.log(`${workers.length} experienced workers need work photos (concurrency ${CONCURRENCY})…`);

let done = 0, failed = 0;
async function work(queue) {
  while (queue.length) {
    const w = queue.pop();
    try {
      const n = 1 + (parseInt(w.id.slice(-1), 36) % 2); // 1 or 2
      const urls = [];
      for (let i = 0; i < n; i++) urls.push(await uploadPicsum(`${w.id}-${i}`, "chainwork/portfolio"));
      await retry(() => db.workerProfile.update({ where: { id: w.id }, data: { portfolioImages: urls } }), 3);
      done++;
    } catch (e) { failed++; console.error("  FAIL", w.id, (e.message || e).toString().slice(0, 70)); }
    if ((done + failed) % 25 === 0) console.log(`  progress: ${done} done, ${failed} failed, ${queue.length} left`);
  }
}
const queue = [...workers];
await Promise.all(Array.from({ length: CONCURRENCY }, () => work(queue)));
console.log(`\nDONE — ${done} workers got photos, ${failed} failed.`);
await db.$disconnect();
