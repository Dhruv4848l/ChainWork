import "server-only";
import { recordDevMessage } from "@/lib/devOutbox";

/*
  Real email delivery with a pluggable provider, selected by EMAIL_PROVIDER in .env:

    EMAIL_PROVIDER="resend" → Resend API (resend.com). Free tier; WITHOUT a verified
                              domain you must send from "onboarding@resend.dev" and
                              only TO the email you signed up to Resend with — ideal
                              for testing. Verify a domain to email anyone.
                              Needs RESEND_API_KEY.
    EMAIL_PROVIDER="brevo"  → Brevo API (brevo.com, ex-Sendinblue). Free tier can
                              email any recipient once your sender address is
                              validated in their dashboard. Needs BREVO_API_KEY.
    EMAIL_PROVIDER="mock"   → (default) logs to the server console — dev behavior.

  EMAIL_FROM sets the sender (e.g. 'ChainWork <onboarding@resend.dev>').
  Same fail-safe contract as src/lib/sms.ts: missing keys or a provider failure
  falls back to the console log so signup/reset flows never block; the result
  reports delivered:false + the error. Plain REST, no SDK dependency.
*/

export type EmailResult = { delivered: boolean; provider: string; error?: string };

function provider(): string {
  return (process.env.EMAIL_PROVIDER ?? "mock").trim().toLowerCase();
}

function fromAddress(): string {
  return process.env.EMAIL_FROM?.trim() || "ChainWork <onboarding@resend.dev>";
}

/** Absolute URL for links that leave the app (emails). */
export function absoluteUrl(path: string): string {
  const base = (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  return path.startsWith("http") ? path : base + path;
}

function mockLog(to: string, subject: string, html: string): EmailResult {
  // Surface any link or one-time code prominently so dev flows stay easy to drive.
  const link = html.match(/href="([^"]+)"/)?.[1];
  const code = html.match(/>(\d{6})</)?.[1];
  console.log(`\n[EMAIL mock] → ${to} | ${subject}${link ? ` | link: ${link}` : ""}${code ? ` | code: ${code}` : ""}\n`);
  // Mirror into the gitignored dev outbox (see src/lib/devOutbox.ts) so the
  // verification link can be followed without reading the terminal. Dev + mock only.
  recordDevMessage({ channel: "email", to, subject, text: html, link, code });
  return { delivered: false, provider: "mock" };
}

async function sendViaResend(to: string, subject: string, html: string): Promise<EmailResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { delivered: false, provider: "resend", error: "RESEND_API_KEY not set" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: fromAddress(), to: [to], subject, html }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return { delivered: false, provider: "resend", error: `HTTP ${res.status}: ${detail.slice(0, 200)}` };
  }
  return { delivered: true, provider: "resend" };
}

async function sendViaBrevo(to: string, subject: string, html: string): Promise<EmailResult> {
  const key = process.env.BREVO_API_KEY;
  if (!key) return { delivered: false, provider: "brevo", error: "BREVO_API_KEY not set" };
  // Brevo wants sender split into {name, email}; parse 'Name <addr>' or bare addr.
  const m = fromAddress().match(/^(.*?)\s*<([^>]+)>$/);
  const sender = m ? { name: m[1].replace(/^"|"$/g, ""), email: m[2] } : { name: "ChainWork", email: fromAddress() };
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": key, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ sender, to: [{ email: to }], subject, htmlContent: html }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return { delivered: false, provider: "brevo", error: `HTTP ${res.status}: ${detail.slice(0, 200)}` };
  }
  return { delivered: true, provider: "brevo" };
}

export async function sendEmail(to: string, subject: string, html: string): Promise<EmailResult> {
  const p = provider();
  try {
    if (p === "resend" || p === "brevo") {
      const r = p === "resend" ? await sendViaResend(to, subject, html) : await sendViaBrevo(to, subject, html);
      if (r.delivered) return r;
      console.warn(`[EMAIL] ${p} send failed (${r.error}) — falling back to mock log.`);
      mockLog(to, subject, html);
      return r;
    }
  } catch (e) {
    console.warn(`[EMAIL] ${p} send threw (${(e as Error).message.slice(0, 120)}) — falling back to mock log.`);
    mockLog(to, subject, html);
    return { delivered: false, provider: p, error: (e as Error).message };
  }
  return mockLog(to, subject, html);
}

/*
  Branded template system. Table-based layout + inline styles only, so it renders
  faithfully in Gmail/Outlook/mobile clients (no external assets, no CSS classes).
  The dark forge look is deliberate brand — it matches the app.
*/

/** The outer shell: preheader, wordmark, card, footer. `preheader` is the hidden
    one-liner inbox preview shown next to the subject. */
export function emailShell(title: string, bodyHtml: string, preheader = ""): string {
  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background-color:#0f0d0b;">
  <!-- inbox preview text (hidden in the body) -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f0d0b;">
    <tr><td align="center" style="padding:36px 16px;">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

        <!-- wordmark -->
        <tr><td align="center" style="padding-bottom:22px;font-family:Georgia,'Times New Roman',serif;">
          <span style="font-size:15px;color:#D9A066;">&#9903;&#9903;</span>
          <span style="font-size:19px;letter-spacing:6px;color:#F5EFE6;">&nbsp;CHAINWORK</span>
        </td></tr>

        <!-- card -->
        <tr><td style="background-color:#151312;border:1px solid #2a2522;border-radius:16px;padding:34px 32px;font-family:Arial,Helvetica,sans-serif;">
          <h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:#F5EFE6;font-weight:bold;">${title}</h1>
          <div style="font-size:14px;line-height:1.7;color:#cfc6b8;">${bodyHtml}</div>
        </td></tr>

        <!-- footer -->
        <tr><td align="center" style="padding-top:20px;font-family:Arial,Helvetica,sans-serif;">
          <p style="margin:0 0 6px;font-size:12px;color:#8a8175;font-style:italic;">Work, forged in trust.</p>
          <p style="margin:0;font-size:11px;line-height:1.6;color:#6f675c;">
            You're receiving this because of activity on your ChainWork account.<br>
            If this wasn't you, you can safely ignore this email — nothing changes without the code or link inside.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** A bronze CTA button for links, with a plain-text fallback link below it. */
export function emailButton(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto 10px;"><tr>
    <td style="background-color:#D9A066;border-radius:999px;">
      <a href="${href}" style="display:inline-block;padding:13px 30px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:#1a1512;text-decoration:none;">${label}</a>
    </td>
  </tr></table>
  <p style="margin:14px 0 0;font-size:12px;line-height:1.6;color:#8a8175;">Button not working? Paste this link into your browser:<br>
  <a href="${href}" style="color:#D9A066;word-break:break-all;">${href}</a></p>`;
}

/** A large spaced one-time code block, for OTP-by-email. */
export function emailCode(code: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 10px;"><tr>
    <td align="center" style="background-color:#0f0d0b;border:1px dashed #3a332e;border-radius:12px;padding:20px;">
      <span style="font-family:'Courier New',Courier,monospace;font-size:30px;font-weight:bold;letter-spacing:10px;color:#D9A066;">${code}</span>
    </td>
  </tr></table>
  <p style="margin:6px 0 0;font-size:12px;color:#8a8175;text-align:center;">This code expires in 10 minutes. Never share it — ChainWork staff will never ask for it.</p>`;
}
