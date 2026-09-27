// Backfill the payment ledger from pre-ledger EscrowTransaction rows (idempotent).
//   npm run script -- scripts/backfill-payments.mts
// Uses whatever DATABASE_URL is in the environment — for local dev, load .env.local first:
//   set -a; . ./.env.local; set +a; npm run script -- scripts/backfill-payments.mts
import { backfillPaymentsFromEscrowTransactions } from "@/lib/payments/backfill";
import { platformDb } from "@/lib/platformDb";

const res = await backfillPaymentsFromEscrowTransactions();
console.log(`[backfill-payments] created ${res.created}, skipped ${res.skipped} (no hire)`);
await platformDb.$disconnect();
