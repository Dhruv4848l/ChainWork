/** E2E helper: make the newest price quote for a phase of this hire run out now. */
import { platformDb as db } from "@/lib/platformDb";

const hireId = process.argv[2];
const phase = await db.phase.findFirstOrThrow({ where: { hireId } });
const q = await db.paymentQuote.findFirstOrThrow({ where: { phaseId: phase.id }, orderBy: { createdAt: "desc" } });
await db.paymentQuote.update({ where: { id: q.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
console.log("expired", q.id);
process.exit(0);
