import { Card } from "@/components/ui";
import { platformDb } from "@/lib/platformDb";
import { formatInr } from "@/lib/format";
import { kindLabel } from "@/lib/receipts/present";
import { PaymentTracker } from "./PaymentTracker";

/*
  In-flight payments (payment plan P5.3) — anything of the user's still INITIATED /
  SUBMITTED, e.g. a transaction that was broadcast but not confirmed before the request
  returned. Each is tracked live until it finalises; nothing renders when there are none.
*/
export async function PendingPayments({ userId }: { userId: string }) {
  const pending = await platformDb.paymentTransaction.findMany({
    where: { status: { in: ["INITIATED", "SUBMITTED"] }, OR: [{ payerUserId: userId }, { payeeUserId: userId }] },
    orderBy: { initiatedAt: "desc" },
    take: 10,
  });
  if (pending.length === 0) return null;
  return (
    <Card className="mb-3.5 border-amber/35 p-5">
      <h3 className="mb-2.5 text-[15px] font-semibold text-ink">In progress</h3>
      <ul className="divide-y divide-hair">
        {pending.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
            <span>
              <span className="block text-[13px] font-medium text-ink">{kindLabel(p)}</span>
              <span className="block text-[11px] text-ink3">{formatInr(Number(p.amountInr))} · started {p.initiatedAt.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</span>
            </span>
            <PaymentTracker paymentId={p.id} />
          </li>
        ))}
      </ul>
    </Card>
  );
}
