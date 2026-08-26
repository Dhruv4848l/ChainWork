/*
  Open-redirect guard (CWE-601). `returnTo` values arrive from the login/KYC query
  string, so they are attacker-controllable — a crafted link like
  `/login?returnTo=https://evil.example` must never send an authenticated user
  off-site. `safeReturnTo` allows ONLY a same-origin absolute path and rejects
  everything a browser could read as an external destination.

  Allowed:  "/dashboard/worker", "/kyc?reason=money"
  Rejected: "https://evil.example", "//evil.example" (protocol-relative),
            backslash-smuggled variants (browsers normalise "\" to "/"), and any
            control char a browser might strip before parsing the Location header.
*/
export function safeReturnTo(
  raw: string | null | undefined,
  fallback = "/"
): string {
  if (!raw) return fallback;
  // Must be a local absolute path, and not protocol-relative ("//host").
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  // Reject any backslash (92 — browsers normalise it to "/") or control char
  // (< 0x20 or DEL — tabs/newlines get stripped), which can turn a path external.
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    if (c === 92 || c < 0x20 || c === 0x7f) return fallback;
  }
  return raw;
}
