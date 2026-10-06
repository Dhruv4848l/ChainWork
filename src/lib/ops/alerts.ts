import "server-only";
import { absoluteUrl, emailButton, emailShell, sendEmail } from "@/lib/email";

/*
  Operations alerts — things an admin should hear about without opening the console.
  Sent to OPS_ALERT_EMAIL (unset = no email; the console badge still shows it). Uses the
  normal email provider and its fail-safe fallback, so an alert can never break the caller.
*/

export interface NewFlagAlert {
  phaseName: string;
  reason: string;
  amount: string;
}

/** A wallet payment the reconciler refused to adopt — sent once, when the flag is created. */
export async function alertNewFlaggedPayment(f: NewFlagAlert): Promise<void> {
  const to = process.env.OPS_ALERT_EMAIL?.trim();
  if (!to) return;
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
  try {
    await sendEmail(
      to,
      `Flagged wallet payment: ${f.phaseName}`,
      emailShell(
        "A wallet payment needs review",
        `<p>A payment sent into escrow from a payer's own wallet didn't match what was agreed, so it was <b>not</b> credited to the phase.</p>
<p><b>Phase:</b> ${esc(f.phaseName)}<br><b>In escrow:</b> ${esc(f.amount)}<br><b>Why:</b> ${esc(f.reason)}</p>
${emailButton(absoluteUrl("/admin/payments"), "Review it in the console")}`,
        `Flagged wallet payment — ${f.phaseName}`,
      ),
    );
  } catch (e) {
    console.warn("[ops-alert] flagged-payment email failed:", (e as Error).message?.slice(0, 160));
  }
}
