/*
  Rotate admin console credentials (security fix, 2026-10-03).

  For every AdminUser in the target admin DB (or only the emails given): a new strong
  random password + a personal TOTP secret (2FA via any authenticator app), audit-logged.
  The new logins are written ONLY to a git-ignored local page with a QR code per admin:

    .admin-credentials/<db-host>-<date>.html   ← scan the QRs, store the passwords in a
                                                 password manager, then DELETE the file.

  Nothing secret is printed. Every admin's old password and old 2FA stop working at once.

    ADMIN_DATABASE_URL=<target> ROTATE_ADMINS=yes npm run script -- scripts/rotate-admin-credentials.mts [email …]
*/
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import QRCode from "qrcode";
import { generateSync, verifySync } from "otplib";
import { adminDb as db } from "@/lib/adminDb";
import { writeAudit } from "@/lib/admin/audit";

const host = (process.env.ADMIN_DATABASE_URL ?? "").replace(/^.*@([^/?]+).*$/, "$1") || "unknown";
if (process.env.ROTATE_ADMINS !== "yes") {
  console.error(`Refusing to run without ROTATE_ADMINS=yes (target admin DB: ${host}).`);
  process.exit(1);
}

/** RFC 4648 base32, no padding — the format authenticator apps expect. */
function base32(buf: Buffer): string {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += A[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += A[(value << (5 - bits)) & 31];
  return out;
}

const only = process.argv.slice(2).map((e) => e.toLowerCase());
const admins = await db.adminUser.findMany({ where: only.length ? { email: { in: only } } : {}, orderBy: { role: "asc" } });
if (!admins.length) throw new Error("No matching admin accounts.");

const rows: { email: string; name: string; role: string; password: string; secret: string; uri: string; qr: string }[] = [];
for (const a of admins) {
  const password = randomBytes(18).toString("base64url"); // 24 chars, ~144 bits
  const secret = base32(randomBytes(20)); // 160-bit TOTP secret (32 chars)
  if (!verifySync({ token: generateSync({ secret }), secret }).valid) throw new Error("TOTP self-check failed.");

  await db.adminUser.update({
    where: { id: a.id },
    data: { passwordHash: await bcrypt.hash(password, 12), totpSecret: secret, twoFactorEnabled: true },
  });
  const check = await db.adminUser.findUniqueOrThrow({ where: { id: a.id } });
  if (!(await bcrypt.compare(password, check.passwordHash)) || check.totpSecret !== secret) throw new Error(`Verification failed for ${a.email}.`);

  await writeAudit({
    actorLabel: "maintenance: rotate-admin-credentials",
    action: "ADMIN_CREDENTIALS_ROTATED",
    targetType: "AdminUser",
    targetId: a.id,
    after: { passwordChanged: true, totpEnrolled: true },
  });

  const label = encodeURIComponent(`ChainWork Admin:${a.email}`);
  const uri = `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent("ChainWork Admin")}&algorithm=SHA1&digits=6&period=30`;
  rows.push({ email: a.email, name: a.name, role: a.role, password, secret, uri, qr: await QRCode.toDataURL(uri, { margin: 1, width: 200 }) });
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>ChainWork admin credentials</title>
<style>body{font:15px/1.5 system-ui,sans-serif;max-width:860px;margin:24px auto;padding:0 16px;color:#1a1512;background:#faf7f2}
.card{display:flex;gap:20px;align-items:center;background:#fff;border:1px solid #e5ddd0;border-radius:12px;padding:16px;margin:14px 0}
code{background:#f2ece2;padding:2px 6px;border-radius:4px;user-select:all}.warn{background:#fff3e0;border:1px solid #ffc46b;padding:12px;border-radius:8px}</style></head><body>
<h1>ChainWork admin credentials</h1>
<p class="warn"><b>Secret.</b> Generated ${new Date().toISOString()} for admin DB <code>${esc(host)}</code>. For each admin: scan the QR in an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…), save the password in a password manager — then <b>delete this file</b>.</p>
${rows
  .map(
    (r) => `<div class="card"><img src="${r.qr}" width="200" height="200" alt="2FA QR for ${esc(r.email)}"><div>
<div><b>${esc(r.name)}</b> — ${esc(r.role)}</div>
<div>Email: <code>${esc(r.email)}</code></div>
<div>Password: <code>${esc(r.password)}</code></div>
<div>2FA key (if you can't scan): <code>${esc(r.secret)}</code></div></div></div>`,
  )
  .join("\n")}
</body></html>`;

const dir = path.join(process.cwd(), ".admin-credentials");
fs.mkdirSync(dir, { recursive: true });
const safeHost = host.split(".")[0].replace(/[^a-zA-Z0-9-]/g, "-"); // Windows forbids ":" in file names
const file = path.join(dir, `${safeHost}-${new Date().toISOString().slice(0, 10)}.html`);
fs.writeFileSync(file, html, { mode: 0o600 });
console.log(`Rotated ${rows.length} admin account(s) on ${host}: ${rows.map((r) => r.email).join(", ")}`);
console.log(`New logins + 2FA QR codes: ${file}`);
await db.$disconnect();
process.exit(0);
