import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { adminDb } from "@/lib/adminDb";
import { getAdminSession } from "./session";
import { canAccess, type NavKey } from "./roles";
import type { AdminUser } from "@/generated/admin";

/*
  Admin-side guards. Mirror the consumer guards but read the ADMIN session + AdminUser.
*/

export const getCurrentAdmin = cache(async (): Promise<AdminUser | null> => {
  const session = await getAdminSession();
  if (!session) return null;
  const admin = await adminDb.adminUser.findUnique({ where: { id: session.sub } });
  if (!admin || !admin.active) return null;
  return admin;
});

export async function requireAdmin(): Promise<AdminUser> {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}

/** Require access to a specific console section; sends the unauthorized to the dashboard. */
export async function requireAdminAccess(key: NavKey): Promise<AdminUser> {
  const admin = await requireAdmin();
  if (!canAccess(admin.role, key)) redirect("/admin/dashboard");
  return admin;
}
