import { AuthShell } from "@/features/auth/AuthShell";
import { EmailVerifyCard } from "@/features/auth/EmailVerifyCard";
import { requireUser } from "@/lib/auth/guards";

function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  return `${name.slice(0, 1)}•••@${domain}`;
}

export default async function VerifyEmailPage() {
  const user = await requireUser("/verify/email");
  const hasRealEmail = !user.email.endsWith("@phone.chainwork.local");
  return (
    <AuthShell>
      <EmailVerifyCard
        emailHint={hasRealEmail ? maskEmail(user.email) : ""}
        hasRealEmail={hasRealEmail}
      />
    </AuthShell>
  );
}
