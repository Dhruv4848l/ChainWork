import "server-only";
import { platformDb } from "@/lib/platformDb";

/*
  One transaction at a time per signing account (W6).

  The relayer signs every attestor/dispute call, gas top-up and mint — from concurrent
  requests AND the cron tick. Two sends that read the same pending nonce collide
  ("nonce too low" / "replacement underpriced"). We serialise the SEND (nonce read +
  sign + broadcast) per address with a Postgres transaction-scoped advisory lock, which
  holds across serverless instances, not just inside one Node process. Waiting for
  the receipt happens after the lock is released, so throughput stays reasonable.
*/
const LOCK_TIMEOUT_MS = 30_000;

export async function withSignerLock<T>(address: string, send: () => Promise<T>): Promise<T> {
  return platformDb.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"signer:" + address.toLowerCase()}))`;
      return send();
    },
    { timeout: LOCK_TIMEOUT_MS, maxWait: LOCK_TIMEOUT_MS },
  );
}
