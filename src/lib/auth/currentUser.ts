import "server-only";
import { cache } from "react";
import { platformDb } from "@/lib/platformDb";
import { getSession } from "@/lib/auth/session";

/*
  getCurrentUser — the full logged-in user (with profiles + wallet), loaded from the
  Platform DB using the session's user id. Wrapped in React's `cache` so multiple
  calls within one request/render hit the DB only once.
*/
export const getCurrentUser = cache(async () => {
  const session = await getSession();
  if (!session) return null;

  const user = await platformDb.user.findUnique({
    where: { id: session.sub },
    include: { workerProfile: true, clientProfile: true, wallet: true },
  });
  return user;
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
