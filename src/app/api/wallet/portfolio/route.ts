import { NextRequest } from "next/server";
import { isAddress, getAddress } from "viem";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { rateLimit } from "@/lib/rateLimit";
import { getPortfolio } from "@/lib/portfolio/portfolio";

/*
  GET /api/wallet/portfolio?address=0x… — non-zero holdings of a wallet across the
  supported networks, for the live tracker (payment plan P5.1). Signed-in users only and
  rate-limited (it fans out to several RPCs); balances are public on-chain, so any
  address may be looked up — typically the user's connected or linked wallet.
*/
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const raw = req.nextUrl.searchParams.get("address") ?? "";
  if (!isAddress(raw)) return Response.json({ error: "Invalid address." }, { status: 400 });

  // 12 s polling = 5/min per open tab; 40/min leaves room for a few tabs + refreshes.
  const limit = rateLimit(`portfolio:${user.id}`, 40, 60_000);
  if (!limit.allowed) {
    return Response.json({ error: "Too many requests." }, { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } });
  }

  const portfolio = await getPortfolio(getAddress(raw));
  return Response.json(portfolio, { headers: { "Cache-Control": "private, no-store" } });
}
