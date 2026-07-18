"use server";

import { revalidatePath } from "next/cache";
import { platformDb } from "@/lib/platformDb";
import { requireUser } from "@/lib/auth/guards";

/*
  Notification-center actions, shared by both dashboards. Every write is scoped to
  the signed-in user's own rows (never by id alone), so one user can't touch another's.
*/

export async function markNotificationReadAction(id: string): Promise<{ ok: boolean }> {
  const user = await requireUser();
  await platformDb.notification.updateMany({ where: { id, userId: user.id }, data: { read: true } });
  revalidatePath("/dashboard/worker/notifications");
  revalidatePath("/dashboard/client/notifications");
  return { ok: true };
}

export async function markAllNotificationsReadAction(): Promise<{ ok: boolean }> {
  const user = await requireUser();
  await platformDb.notification.updateMany({ where: { userId: user.id, read: false }, data: { read: true } });
  revalidatePath("/dashboard/worker/notifications");
  revalidatePath("/dashboard/client/notifications");
  return { ok: true };
}
