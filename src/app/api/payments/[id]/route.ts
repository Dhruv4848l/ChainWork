import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { platformDb } from "@/lib/platformDb";
import { adapter } from "@/lib/chain/escrow";
import { isFinalPaymentStatus, type PaymentStatus } from "@/lib/payments/states";
import { kindLabel } from "@/lib/receipts/present";

/*
  GET /api/payments/:id — the live status of one payment, for the pending-transaction
  tracker (payment plan P5.3). Only the payer or the payee may read it; anyone else
  gets a 404 (not 403, so ids can't be probed for existence).

  While a transaction is in flight it also reports how many blocks have confirmed it
  (0 = broadcast, not yet mined); once final it carries the receipt number.
*/
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONFIRMATIONS_TARGET = 12;

async function confirmations(txHash: string | null, mode: string): Promise<number | null> {
  if (!txHash || mode === "DEMO") return null;
  try {
    const a = adapter();
    const [receipt, head] = await Promise.all([a.txReceipt(txHash as `0x${string}`), a.blockNumber()]);
    if (!receipt || head == null) return 0;
    return Number(head - receipt.blockNumber) + 1;
  } catch {
    return null;
  }
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await ctx.params;

  const p = await platformDb.paymentTransaction.findUnique({ where: { id }, include: { receipt: { select: { receiptNo: true } } } });
  if (!p || (p.payerUserId !== user.id && p.payeeUserId !== user.id)) {
    return new Response("Not found", { status: 404 });
  }
  const final = isFinalPaymentStatus(p.status as PaymentStatus);
  return Response.json(
    {
      id: p.id,
      kind: p.kind,
      label: kindLabel(p),
      mode: p.mode,
      status: p.status,
      final,
      amountInr: Number(p.amountInr),
      txHash: p.txHash,
      blockNumber: p.blockNumber?.toString() ?? null,
      confirmations: final ? null : await confirmations(p.txHash, p.mode),
      confirmationsTarget: CONFIRMATIONS_TARGET,
      failureReason: p.failureReason,
      receiptNo: p.receipt?.receiptNo ?? null,
      initiatedAt: p.initiatedAt,
      finalizedAt: p.finalizedAt,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
