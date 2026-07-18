/*
  Local escrow-timing runner (Phase 8). Hits the /api/cron/escrow endpoint on an
  interval so the verification-window reminders + auto-release fire during local dev.
  No external deps — plain setInterval. Run alongside the app:

    node worker/escrow-cron.mjs

  In production a host cron (Vercel Cron, Render cron, etc.) would call the same
  endpoint instead. Interval + target are configurable via env.
*/
const URL = process.env.CRON_URL || "http://127.0.0.1:3000/api/cron/escrow";
const SECRET = process.env.CRON_SECRET || "dev-cron-secret-change-me";
const INTERVAL_MS = Number(process.env.CRON_INTERVAL_MS || 60_000);

async function tick() {
  try {
    const res = await fetch(URL, { headers: { "x-cron-secret": SECRET } });
    const body = await res.json();
    console.log(new Date().toISOString(), res.status, JSON.stringify(body));
  } catch (e) {
    console.error(new Date().toISOString(), "tick failed:", e.message);
  }
}

console.log(`Escrow cron runner → ${URL} every ${INTERVAL_MS}ms`);
tick();
setInterval(tick, INTERVAL_MS);
