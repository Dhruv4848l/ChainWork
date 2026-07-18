import { AuthShell } from "@/features/auth/AuthShell";
import { ResetPasswordForm } from "@/features/auth/PasswordForms";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ uid?: string; token?: string }>;
}) {
  const { uid, token } = await searchParams;
  return (
    <AuthShell>
      <ResetPasswordForm uid={uid ?? ""} token={token ?? ""} />
    </AuthShell>
  );
}
