import "server-only";
import { platformDb } from "@/lib/platformDb";

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

/** SMS adapter — mock. Swap the body for a real provider (Twilio/MSG91). */
export async function sendSms(userId: string, text: string): Promise<void> {
  const { phone } = await recipientContact(userId);
  if (!phone) return;
  console.log(`[notify:sms] → ${phone} | ${text}`);
  // --- Real provider (example) -------------------------------------------------
  // await twilio.messages.create({ from: TWILIO_FROM, to: phone, body: text });
  // -----------------------------------------------------------------------------
}
