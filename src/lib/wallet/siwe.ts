import { getAddress, isAddress } from "viem";
import { createSiweMessage, parseSiweMessage, validateSiweMessage } from "viem/siwe";

/*
  Sign-In with Ethereum (EIP-4361) for linking an external payout wallet — payment plan
  P3.5 (W5). Pure (no DB) so the security rules are unit-tested (siwe.test.ts).

  The server builds the message — the browser only asks the wallet to sign it — and it
  binds: our domain + URI (no phishing site can reuse a signature), the chain, the
  account (requestId), a single-use server nonce, and a 10-minute expiry. The server
  then requires that EXACT text back, signed by that address.
*/

export const LINK_TTL_MS = 10 * 60_000;
export const LINK_STATEMENT =
  "Link this wallet to your ChainWork account to receive escrow payouts. Signing does not move funds or give ChainWork any spending access.";

export interface LinkMessageInput {
  domain: string;
  uri: string;
  address: string;
  chainId: number;
  nonce: string;
  userId: string;
  issuedAt: Date;
}

export function requestIdFor(userId: string): string {
  return `chainwork-user:${userId}`;
}

export function buildLinkMessage(i: LinkMessageInput): string {
  if (!isAddress(i.address)) throw new Error("Invalid wallet address.");
  return createSiweMessage({
    domain: i.domain,
    uri: i.uri,
    address: getAddress(i.address),
    chainId: i.chainId,
    nonce: i.nonce,
    version: "1",
    statement: LINK_STATEMENT,
    issuedAt: i.issuedAt,
    expirationTime: new Date(i.issuedAt.getTime() + LINK_TTL_MS),
    requestId: requestIdFor(i.userId),
  });
}

export type LinkCheck = { ok: true } | { ok: false; reason: string };

/**
 * Validate a signed-back message against what the server issued. The signature itself is
 * verified separately (it needs viem's async verifyMessage); this checks the content.
 */
export function checkLinkMessage(
  message: string,
  expected: { domain: string; uri: string; address: string; nonce: string; chainId: number; userId: string; now: Date },
): LinkCheck {
  let parsed: ReturnType<typeof parseSiweMessage>;
  try {
    parsed = parseSiweMessage(message);
  } catch {
    return { ok: false, reason: "That isn't a valid sign-in message." };
  }
  const valid = validateSiweMessage({
    message: parsed,
    address: getAddress(expected.address),
    domain: expected.domain,
    nonce: expected.nonce,
    time: expected.now,
  });
  if (!valid) {
    if (parsed.expirationTime && parsed.expirationTime <= expected.now) return { ok: false, reason: "The signing request expired. Start again." };
    return { ok: false, reason: "The signed message doesn't match this request." };
  }
  if (parsed.uri !== expected.uri) return { ok: false, reason: "The signed message was made for a different site." };
  if (parsed.chainId !== expected.chainId) return { ok: false, reason: "The signed message is for a different network." };
  if (parsed.requestId !== requestIdFor(expected.userId)) return { ok: false, reason: "The signed message belongs to a different account." };
  if (parsed.statement !== LINK_STATEMENT) return { ok: false, reason: "The signed message was altered." };
  return { ok: true };
}

// ---- payout safety hold (W5: a hijacked session can't redirect money instantly) ----

export function payoutCooldownMs(env: string | undefined = process.env.WALLET_PAYOUT_COOLDOWN_HOURS): number {
  const hours = Number(env ?? 24);
  return (Number.isFinite(hours) && hours >= 0 ? hours : 24) * 3_600_000;
}

/** When a link made at `linkedAt` starts receiving new payouts. null linkedAt = legacy link, already active. */
export function payoutActiveFrom(linkedAt: Date | null, cooldownMs: number = payoutCooldownMs()): Date | null {
  return linkedAt ? new Date(linkedAt.getTime() + cooldownMs) : null;
}

export function isExternalPayoutActive(linkedAt: Date | null, now: Date = new Date(), cooldownMs: number = payoutCooldownMs()): boolean {
  const from = payoutActiveFrom(linkedAt, cooldownMs);
  return from == null || now >= from;
}
