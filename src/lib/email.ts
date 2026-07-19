import "server-only";

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
  // Surface any link prominently so dev flows stay easy to click through.
  const link = html.match(/href="([^"]+)"/)?.[1];
  console.log(`\n[EMAIL mock] → ${to} | ${subject}${link ? ` | link: ${link}` : ""}\n`);
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

/** Minimal branded shell so every mail looks like ChainWork without a template system. */
export function emailShell(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#0f0d0b;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px">
    <div style="letter-spacing:.15em;font-size:18px;color:#F5EFE6;padding-bottom:18px">⛓ CHAINWORK</div>
    <div style="background:#151312;border:1px solid #2a2522;border-radius:14px;padding:28px">
      <h1 style="margin:0 0 12px;font-size:20px;color:#F5EFE6">${title}</h1>
      <div style="font-size:14px;line-height:1.6;color:#cfc6b8">${bodyHtml}</div>
    </div>
    <p style="font-size:11px;color:#8a8175;padding-top:16px">Sent by ChainWork. If you didn't request this, you can safely ignore it.</p>
  </div>
</body></html>`;
}

/** A bronze CTA button for links. */
export function emailButton(href: string, label: string): string {
  return `<p style="margin:20px 0"><a href="${href}" style="background:#D9A066;color:#1a1512;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:999px;display:inline-block">${label}</a></p>
  <p style="font-size:12px;color:#8a8175">Or paste this link into your browser:<br><a href="${href}" style="color:#D9A066">${href}</a></p>`;
}
