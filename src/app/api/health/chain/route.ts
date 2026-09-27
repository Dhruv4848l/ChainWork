import { getChainHealth } from "@/lib/chain/health";

/*
  GET /api/health/chain — can the platform move escrow right now?
  200 when healthy for the current payment mode, 503 otherwise. Holds no secrets: the
  relayer address and contract addresses are public on-chain anyway.
*/
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const health = await getChainHealth();
  return Response.json(health, { status: health.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
