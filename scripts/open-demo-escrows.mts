/*
  Before switching PAYMENT_MODE from demo to testnet (docs/RUNBOOK_DEMO_TO_TESTNET.md):
  lists phases whose escrow lives in DEMO money and is still open. After the switch the
  chain has never heard of them — approve / refund would revert — so close each one
  (approve, refund or settle) while still in demo mode.

    npm run script -- scripts/open-demo-escrows.mts
*/
import { platformDb as db } from "@/lib/platformDb";

const OPEN = ["FUNDED", "IN_PROGRESS", "DELIVERED", "VERIFICATION_WINDOW_OPEN", "DISPUTED"] as const;

const phases = await db.phase.findMany({
  where: { status: { in: [...OPEN] }, payments: { some: { kind: "FUND", status: "CONFIRMED", mode: "DEMO" } } },
  include: { hire: { include: { client: { select: { name: true } }, worker: { select: { name: true } } } } },
  orderBy: { updatedAt: "asc" },
});

if (phases.length === 0) {
  console.log("No open demo-money escrows — safe to switch PAYMENT_MODE.");
} else {
  console.log(`${phases.length} open demo-money escrow(s) — close these before switching:\n`);
  for (const p of phases) {
    console.log(`  ${p.status.padEnd(25)} ₹${String(p.amount).padStart(9)}  "${p.name}"  ${p.hire.client.name} → ${p.hire.worker.name}  /dashboard/client/hires/${p.hireId}`);
  }
}
process.exit(0);
