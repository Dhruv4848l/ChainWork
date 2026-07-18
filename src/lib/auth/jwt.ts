import { SignJWT, jwtVerify } from "jose";
import type { Role } from "@/generated/platform";

/*
  Edge-safe JWT helpers (jose only — no next/headers, no DB). Safe to import from
  middleware (edge runtime) AND from server code. The cookie read/write wrappers
  live in session.ts, which layers next/headers on top of these.
*/

export const SESSION_COOKIE_NAME = "cw_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

export interface SessionClaims {
  sub: string; // user id
  role: Role;
}

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export async function signSessionToken(claims: SessionClaims): Promise<string> {
  return new SignJWT({ role: claims.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(secretKey());
}

export async function verifySessionToken(
  token: string
): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (!payload.sub || !payload.role) return null;
    return { sub: payload.sub, role: payload.role as Role };
  } catch {
    return null;
  }
}
