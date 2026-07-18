import { SignJWT, jwtVerify } from "jose";
import type { AdminRole } from "@/generated/admin";

/*
  Edge-safe admin JWT helpers (jose only — safe to import from the proxy). Namespaced
  key + `kind: "admin"` claim so an admin token can never be verified as a consumer
  one (and vice-versa). Cookie read/write wrappers live in session.ts.
*/
export const ADMIN_COOKIE = "cw_admin";
export const ADMIN_MAX_AGE = 60 * 60 * 8; // 8 hours

export interface AdminClaims {
  sub: string;
  role: AdminRole;
}

function key(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode("admin:" + secret);
}

export async function signAdminToken(claims: AdminClaims): Promise<string> {
  return new SignJWT({ role: claims.role, kind: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${ADMIN_MAX_AGE}s`)
    .sign(key());
}

export async function verifyAdminToken(token: string): Promise<AdminClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key());
    if (payload.kind !== "admin" || !payload.sub || !payload.role) return null;
    return { sub: payload.sub, role: payload.role as AdminRole };
  } catch {
    return null;
  }
}
