import { PrismaClient } from "@/generated/platform";

/*
  Platform DB client (singleton).
  Everything Workers and Clients touch goes through this client. In dev, Next.js
  hot-reload would otherwise create a new PrismaClient on every reload and exhaust
  connections — so we cache one instance on globalThis.
*/
const globalForPlatformDb = globalThis as unknown as {
  platformDb?: PrismaClient;
};

export const platformDb =
  globalForPlatformDb.platformDb ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPlatformDb.platformDb = platformDb;
}
