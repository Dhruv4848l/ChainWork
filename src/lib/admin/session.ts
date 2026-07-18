import "server-only";
import { cookies } from "next/headers";
import {
  signAdminToken,
  verifyAdminToken,
  ADMIN_COOKIE,
  ADMIN_MAX_AGE,
  type AdminClaims,
} from "./jwt";

/*
  Admin session cookie wrappers. The JWT sign/verify lives in the edge-safe jwt.ts
  (so the proxy can share it). DELIBERATELY separate from the consumer session —
  different cookie, different key namespace.
*/
export type { AdminClaims };
export { ADMIN_COOKIE };

export async function createAdminSession(claims: AdminClaims): Promise<void> {
  const store = await cookies();
  store.set(ADMIN_COOKIE, await signAdminToken(claims), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ADMIN_MAX_AGE,
  });
}

export async function getAdminSession(): Promise<AdminClaims | null> {
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE)?.value;
  return token ? verifyAdminToken(token) : null;
}

export async function destroyAdminSession(): Promise<void> {
  (await cookies()).delete(ADMIN_COOKIE);
}
