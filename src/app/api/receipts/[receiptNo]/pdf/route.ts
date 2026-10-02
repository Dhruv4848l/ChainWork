import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { getAdminSession } from "@/lib/admin/session";
import { canAccess } from "@/lib/admin/roles";
import { bridgeReceipt } from "@/lib/admin/bridge";
import { isReceiptNo } from "@/lib/receipts/content";
import { receiptFilename } from "@/lib/receipts/present";
import { findReceipt, isReceiptParty, receiptPdfBytes } from "@/lib/receipts/store";

/*
  GET /api/receipts/:receiptNo/pdf — download a payment receipt (payment plan P2.4).
  Allowed: the payer or payee of that payment, or an admin whose role can see
  payments (read through the bridge — two-DB boundary). Everyone else gets 404, not
  403, so receipt numbers can't be probed. Rendered from the frozen snapshot.
*/
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const notFound = () => new Response("Not found", { status: 404 });

export async function GET(_req: NextRequest, ctx: { params: Promise<{ receiptNo: string }> }) {
  const { receiptNo } = await ctx.params;
  if (!isReceiptNo(receiptNo)) return notFound();

  let receipt: { receiptNo: string; content: Parameters<typeof receiptPdfBytes>[0]["content"]; contentHash: string } | null = null;

  const user = await getCurrentUser();
  if (user) {
    const r = await findReceipt(receiptNo);
    if (r && isReceiptParty(r, user.id)) receipt = r;
  }
  if (!receipt) {
    const admin = await getAdminSession();
    if (admin && canAccess(admin.role, "payments")) receipt = await bridgeReceipt(receiptNo);
  }
  if (!receipt) return notFound();

  const bytes = await receiptPdfBytes(receipt);
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${receiptFilename(receipt.receiptNo)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
