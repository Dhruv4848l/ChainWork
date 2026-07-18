import "server-only";
import { platformDb } from "@/lib/platformDb";
import type { NotificationType } from "@/generated/platform";
import { sendEmail, sendSms } from "./channels";

/*
  The notification delivery layer. `notify()` is the single entry point every part
  of the app uses to tell a user something happened. It:
    1. writes the in-app Notification record (drives the bell + notification center), and
    2. fans out to the out-of-band channels (email/SMS — mocked in `channels.ts`).

  Which extra channels fire is decided per event type by `DEFAULT_CHANNELS` (high-signal
  money/dispute events also email; everything shows in-app). Callers can override.
*/

type Channel = "email" | "sms";

// In-app is always on; these are the ADDITIONAL channels per event type.
const DEFAULT_CHANNELS: Record<NotificationType, Channel[]> = {
  APPLICATION: ["email"],
  ESCROW: ["email"],
  PAYMENT: ["email"],
  REMINDER: ["email"],
  DISPUTE: ["email", "sms"],
  JURY: ["email"],
  MESSAGE: [], // in-app only — messages would be too noisy over email/SMS
  REVIEW: [],
  SYSTEM: [],
};

export type NotifyInput = {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  linkUrl?: string;
  /** Override the default extra channels for this event type. */
  channels?: Channel[];
};

export async function notify(input: NotifyInput) {
  const record = await platformDb.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      linkUrl: input.linkUrl ?? null,
    },
  });

  // Out-of-band fan-out. Best-effort: a channel failure must never break the action
  // that triggered the notification, and the in-app record is already saved.
  const channels = input.channels ?? DEFAULT_CHANNELS[input.type];
  await Promise.allSettled([
    channels.includes("email") ? sendEmail(input.userId, input.title, input.body ?? "") : null,
    channels.includes("sms") ? sendSms(input.userId, input.title) : null,
  ].filter(Boolean) as Promise<void>[]);

  return record;
}

/** Convenience for fanning the same event to several users (e.g. a jury panel). */
export async function notifyMany(userIds: string[], input: Omit<NotifyInput, "userId">) {
  return Promise.all(userIds.map((userId) => notify({ ...input, userId })));
}
