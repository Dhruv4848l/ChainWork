import "server-only";
import { platformDb } from "@/lib/platformDb";
import { sendSms as sendRealSms } from "@/lib/sms";
import { sendEmail as sendRealEmail, emailShell } from "@/lib/email";

/*
  Out-of-band notification channels (email + SMS).

  These are MOCKED — they log what would be sent. The point is the SHAPE: each
  adapter is a single async function with the real provider call sketched in a
  comment, so wiring a live provider later is a drop-in, not a refactor. Nothing
  else in the app knows or cares which provider backs these.
*/

async function recipientContact(userId: string): Promise<{ email: string | null; phone: string | null; name: string }> {
  const u = await platformDb.user.findUnique({ where: { id: userId }, select: { email: true, phone: true, name: true } });
  return { email: u?.email ?? null, phone: u?.phone ?? null, name: u?.name ?? "there" };
}

/** Email adapter — delivers through the pluggable email service (src/lib/email.ts).
    Real with EMAIL_PROVIDER=resend/brevo; mock logs to the console. */
export async function sendEmail(userId: string, subject: string, body: string): Promise<void> {
  const { email, name } = await recipientContact(userId);
  if (!email) return;
  await sendRealEmail(email, subject, emailShell(subject, `<p>Hi ${name},</p><p>${body}</p>`));
}

/** SMS adapter — delivers through the pluggable SMS service (src/lib/sms.ts).
    With SMS_PROVIDER=twilio it sends real texts; mock/fast2sms fall back to a
    console log for these free-form notification messages. */
export async function sendSms(userId: string, text: string): Promise<void> {
  const { phone } = await recipientContact(userId);
  if (!phone) return;
  await sendRealSms(phone, text);
}
