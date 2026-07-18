import "server-only";
import { cookies } from "next/headers";
import {
  signSessionToken,
  verifySessionToken,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  type SessionClaims,
} from "@/lib/auth/jwt";

/*
  Server-side session cookie wrappers. The actual JWT sign/verify lives in the
  edge-safe jwt.ts (so middleware can share it). This module adds the httpOnly
  cookie read/write, which needs next/headers and therefore server context.
*/

export type { SessionClaims };
export { SESSION_COOKIE_NAME };

/** Create the session cookie (server action / route handler context). */
export async function createSession(claims: SessionClaims): Promise<void> {
  const token = await signSessionToken(claims);
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

/** Read + verify the current session from the cookie store. */
export async function getSession(): Promise<SessionClaims | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/** Clear the session cookie (logout). */
export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
}
