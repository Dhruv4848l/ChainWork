import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { platformDb } from "@/lib/platformDb";
import { isFinalPaymentStatus, type PaymentStatus } from "@/lib/payments/states";

/*
  GET /api/payments/:id — the live status of one payment, for the pending-transaction
  tracker (payment plan P5.3). Only the payer or the payee may read it; anyone else
  gets a 404 (not 403, so ids can't be probed for existence).
*/
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await ctx.params;

  const p = await platformDb.paymentTransaction.findUnique({ where: { id } });
  if (!p || (p.payerUserId !== user.id && p.payeeUserId !== user.id)) {
    return new Response("Not found", { status: 404 });
  }
  return Response.json(
    {
      id: p.id,
      kind: p.kind,
      mode: p.mode,
      status: p.status,
      final: isFinalPaymentStatus(p.status as PaymentStatus),
      amountInr: Number(p.amountInr),
      txHash: p.txHash,
      blockNumber: p.blockNumber?.toString() ?? null,
      failureReason: p.failureReason,
      initiatedAt: p.initiatedAt,
      finalizedAt: p.finalizedAt,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
