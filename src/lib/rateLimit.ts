/*
  A tiny in-memory sliding-window rate limiter. Used to blunt brute-force on the
  auth surfaces (password login, admin login). `check(key, ...)` records an attempt
  and returns whether it's allowed plus how long to wait when it isn't.

  SCOPE — this is per-process memory. It's correct and useful for a single instance
  (and for dev/demo), but a multi-instance deployment needs a shared store (Redis,
  Upstash, etc.). That swap is called out in PRE_MAINNET_CHECKLIST.md.
*/

type Hit = { count: number; resetAt: number };
const buckets = new Map<string, Hit>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

/**
 * @param key       stable identity for the actor (e.g. `login:ravi@x.com`)
 * @param limit     max attempts allowed within the window
 * @param windowMs  the rolling window length in ms
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const hit = buckets.get(key);

  if (!hit || now >= hit.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterMs: 0 };
  }

  if (hit.count >= limit) {
    return { allowed: false, remaining: 0, retryAfterMs: hit.resetAt - now };
  }

  hit.count++;
  return { allowed: true, remaining: limit - hit.count, retryAfterMs: 0 };
}

/** Clear a key's counter — call after a successful auth so a good login resets the budget. */
export function rateLimitReset(key: string): void {
  buckets.delete(key);
}

/** Test-only: wipe all counters. */
export function _resetAllRateLimits(): void {
  buckets.clear();
}
