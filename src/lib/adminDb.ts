import { PrismaClient } from "@/generated/admin";

/*
  Admin/Jury DB client (singleton) — a SEPARATE client for the physically separate
  Admin database. This client must only ever be imported by admin-side / bridge-service
  code, never by consumer (Worker/Client) code. It has no access to Platform tables.
  See the boundary rule in CLAUDE.md.
*/
const globalForAdminDb = globalThis as unknown as {
  adminDb?: PrismaClient;
};

export const adminDb =
  globalForAdminDb.adminDb ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForAdminDb.adminDb = adminDb;
}
