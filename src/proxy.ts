import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/jwt";

/*
  Route protection (Next 16 "proxy" convention — formerly "middleware"). Runs on
  the edge before the request reaches a page.

  - Public: everything not matched below (home, /login, /signup, marketing, the
    email-confirm link, /components-preview).
  - Requires login: /dashboard, /onboarding, /kyc, /verify/phone|email.
  - Role-scoped: /dashboard/worker (WORKER only), /dashboard/client (CLIENT only).

  Deeper checks (KYC gate, resource ownership) happen in server guards/actions —
  proxy only does the cheap id/role check from the signed cookie.
*/

const ROLE_ROUTES: { prefix: string; role: "WORKER" | "CLIENT" }[] = [
  { prefix: "/dashboard/worker", role: "WORKER" },
  { prefix: "/dashboard/client", role: "CLIENT" },
];

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // The email-confirm link must work even when logged out (it self-validates).
  if (pathname.startsWith("/verify/email/confirm")) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?returnTo=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  for (const r of ROLE_ROUTES) {
    if (pathname.startsWith(r.prefix) && session.role !== r.role) {
      const url = req.nextUrl.clone();
      url.pathname =
        session.role === "WORKER" ? "/dashboard/worker" : "/dashboard/client";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/onboarding/:path*", "/kyc", "/verify/:path*"],
};
