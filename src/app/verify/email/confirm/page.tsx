import Link from "next/link";
import { AuthShell } from "@/features/auth/AuthShell";
import { Button } from "@/components/ui";
import { confirmEmailAction } from "@/features/auth/actions";

/*
  Handles the (mock) email verification link: /verify/email/confirm?uid=...&token=...
  This route is public in middleware so the link works even if the session lapsed.
*/
export default async function ConfirmEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ uid?: string; token?: string }>;
}) {
  const { uid, token } = await searchParams;
  const result =
    uid && token
      ? await confirmEmailAction(uid, token)
      : { ok: false, error: "Missing verification details." };

  return (
    <AuthShell>
      <div className="w-full max-w-md rounded-2xl border border-line bg-card p-9 text-center">
        {result.ok ? (
          <>
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-emerald/40 text-2xl text-emerald">
              ✓
            </div>
            <h1 className="font-display text-3xl text-ink">Email verified</h1>
            <p className="mb-6 mt-2 text-sm text-ink2">
              Your email is confirmed. You can now post and apply once your profile
              is set up.
            </p>
          </>
        ) : (
          <>
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-ember/40 text-2xl text-ember">
              !
            </div>
            <h1 className="font-display text-3xl text-ink">Link invalid</h1>
            <p className="mb-6 mt-2 text-sm text-ink2">
              {result.error ?? "This link is invalid or has expired."}
            </p>
          </>
        )}
        <Link href="/verify/email">
          <Button variant="primary" className="w-full">
            Continue
          </Button>
        </Link>
      </div>
    </AuthShell>
  );
}
