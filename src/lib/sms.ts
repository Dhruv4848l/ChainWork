import "server-only";

/*
  Real SMS delivery with a pluggable provider, selected by SMS_PROVIDER in .env:

    SMS_PROVIDER="twilio"    → Twilio Messages API (works worldwide; on a trial
                               account it can only text numbers you've verified
                               in the Twilio console, with a trial prefix).
                               Needs TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
                               TWILIO_FROM (an SMS-capable Twilio number).
    SMS_PROVIDER="fast2sms"  → Fast2SMS OTP route (India; sends a fixed
                               "your OTP is …" template, so it works without a
                               DLT-registered sender for OTP use).
                               Needs FAST2SMS_API_KEY.
    SMS_PROVIDER="mock"      → (default) logs to the server console, exactly the
                               dev behavior the app has always had.

  If a real provider is selected but its env vars are missing or the API call
  fails, we FALL BACK to the mock log (so a misconfigured dev box never blocks
  signups) and report the failure in the result — callers can decide whether to
  surface it. Plain REST calls; no SDK dependency.
*/

export type SmsResult = { delivered: boolean; provider: string; error?: string };

function provider(): string {
  return (process.env.SMS_PROVIDER ?? "mock").trim().toLowerCase();
}

/** Normalize a stored phone ("8141910049") to E.164 ("+918141910049"). */
export function toE164(phone: string): string {
  const cleaned = phone.replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+")) return cleaned;
  const cc = (process.env.SMS_DEFAULT_COUNTRY_CODE ?? "+91").trim();
  return cc + cleaned.replace(/^0+/, "");
}

function mockLog(phone: string, text: string): SmsResult {
  console.log(`\n[SMS mock] → ${phone}: ${text}\n`);
  return { delivered: false, provider: "mock" };
}

async function sendViaTwilio(phone: string, text: string): Promise<SmsResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  if (!sid || !token || !from) {
    return { delivered: false, provider: "twilio", error: "TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM not set" };
  }
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: toE164(phone), From: from, Body: text }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return { delivered: false, provider: "twilio", error: `HTTP ${res.status}: ${detail.slice(0, 200)}` };
  }
  return { delivered: true, provider: "twilio" };
}

/** Fast2SMS "otp" route — India-only, OTP messages only (fixed template). */
async function sendViaFast2Sms(phone: string, otpCode: string): Promise<SmsResult> {
  const key = process.env.FAST2SMS_API_KEY;
  if (!key) return { delivered: false, provider: "fast2sms", error: "FAST2SMS_API_KEY not set" };
  // The OTP route wants a bare 10-digit Indian number.
  const number = toE164(phone).replace(/^\+91/, "");
  const res = await fetch("https://www.fast2sms.com/dev/bulkV2", {
    method: "POST",
    headers: { authorization: key, "Content-Type": "application/json" },
    body: JSON.stringify({ route: "otp", variables_values: otpCode, numbers: number }),
  });
  const body = (await res.json().catch(() => null)) as { return?: boolean; message?: string[] } | null;
  if (!res.ok || !body?.return) {
    return { delivered: false, provider: "fast2sms", error: `HTTP ${res.status}: ${JSON.stringify(body)?.slice(0, 200)}` };
  }
  return { delivered: true, provider: "fast2sms" };
}

/**
 * Send an SMS. `otpCode` should be passed for verification codes — OTP-route
 * providers (Fast2SMS) can only send those, and use the code directly.
 */
export async function sendSms(phone: string, text: string, opts?: { otpCode?: string }): Promise<SmsResult> {
  const p = provider();
  try {
    if (p === "twilio") {
      const r = await sendViaTwilio(phone, text);
      if (r.delivered) return r;
      console.warn(`[SMS] twilio send failed (${r.error}) — falling back to mock log.`);
      mockLog(phone, text);
      return r;
    }
    if (p === "fast2sms") {
      if (!opts?.otpCode) {
        console.warn("[SMS] fast2sms is OTP-only — non-OTP message logged instead.");
        return mockLog(phone, text);
      }
      const r = await sendViaFast2Sms(phone, opts.otpCode);
      if (r.delivered) return r;
      console.warn(`[SMS] fast2sms send failed (${r.error}) — falling back to mock log.`);
      mockLog(phone, text);
      return r;
    }
  } catch (e) {
    console.warn(`[SMS] ${p} send threw (${(e as Error).message.slice(0, 120)}) — falling back to mock log.`);
    mockLog(phone, text);
    return { delivered: false, provider: p, error: (e as Error).message };
  }
  return mockLog(phone, text);
}
