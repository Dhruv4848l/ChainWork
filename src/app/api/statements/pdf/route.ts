import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { statementPdfBytes } from "@/lib/receipts/statement";
import { defaultPeriod, parsePeriod } from "@/lib/receipts/statementMath";

/*
  GET /api/statements/pdf?from=YYYY-MM-DD&to=YYYY-MM-DD — the signed-in user's own
  account statement (payment plan P2.6). Dates are inclusive, in India time; the
  default is the last 30 days. A user can only ever get their own statement.
*/
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const def = defaultPeriod();
  const from = req.nextUrl.searchParams.get("from") || def.from;
  const to = req.nextUrl.searchParams.get("to") || def.to;
  let period;
  try {
    period = parsePeriod(from, to);
  } catch (e) {
    return new Response((e as Error).message, { status: 400 });
  }

  const bytes = await statementPdfBytes(user.id, period);
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="ChainWork-Statement-${period.from}-to-${period.to}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
