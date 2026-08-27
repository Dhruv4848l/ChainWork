import { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runEscrowTick } from "@/lib/escrow/tick";

/*
  Cron endpoint that drives the escrow timing engine. A scheduler (the local
  worker/escrow-cron.mjs runner, or a Vercel/host cron in production) hits this on
  an interval. Node runtime (uses Prisma + viem); always dynamic.

  AUTH — three ways to present CRON_SECRET, because schedulers differ:
    x-cron-secret: <secret>        the local runner + any curl-based host cron
    Authorization: Bearer <secret>  what Vercel Cron sends automatically
    ?secret=<secret>               last resort for schedulers that can't set headers

  FAIL-CLOSED: in production a missing or mismatched secret is a 401. (It used to
  wave the request through when CRON_SECRET was unset — on a public deployment that
  would let anyone drive auto-release and reminder sending.) Outside production an
  unset secret stays open so the dev runner works with no configuration.
*/
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The tick walks every open phase and may send several on-chain transactions.
export const maxDuration = 60;

function secretsMatch(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // No secret configured: open in dev, closed in production.
    return process.env.NODE_ENV !== "production";
  }
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const provided =
    req.headers.get("x-cron-secret") ?? bearer ?? req.nextUrl.searchParams.get("secret");
  return Boolean(provided) && secretsMatch(provided as string, secret);
}

async function handle(req: NextRequest) {
  if (!authorized(req)) {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    const result = await runEscrowTick();
    return Response.json({ ok: true, at: new Date().toISOString(), ...result });
  } catch (e) {
    console.error("escrow tick failed:", e);
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
