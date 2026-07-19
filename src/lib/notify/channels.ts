import "server-only";
import { platformDb } from "@/lib/platformDb";
import { sendSms as sendRealSms } from "@/lib/sms";

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

/** Email adapter — mock. Swap the body for a real provider (Resend/SES/Sendgrid). */
export async function sendEmail(userId: string, subject: string, body: string): Promise<void> {
  const { email, name } = await recipientContact(userId);
  if (!email) return;
  console.log(`[notify:email] → ${email} | ${subject} — ${body}`);
  // --- Real provider (example) -------------------------------------------------
  // await resend.emails.send({
  //   from: "ChainWork <noreply@chainwork.app>",
  //   to: email,
  //   subject,
  //   html: renderEmail({ name, subject, body }),
  // });
  // -----------------------------------------------------------------------------
  void name;
}

/** SMS adapter — delivers through the pluggable SMS service (src/lib/sms.ts).
    With SMS_PROVIDER=twilio it sends real texts; mock/fast2sms fall back to a
    console log for these free-form notification messages. */
export async function sendSms(userId: string, text: string): Promise<void> {
  const { phone } = await recipientContact(userId);
  if (!phone) return;
  await sendRealSms(phone, text);
}
