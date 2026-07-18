import { NextRequest } from "next/server";
import { runEscrowTick } from "@/lib/escrow/tick";

/*
  Cron endpoint that drives the escrow timing engine. A scheduler (the local
  worker/escrow-cron.mjs runner, or a Vercel/host cron in production) hits this on
  an interval. Protected by CRON_SECRET so it can't be triggered by just anyone.
  Node runtime (uses Prisma + viem + fs); always dynamic.
*/
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret");
  if (secret && provided !== secret) {
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
