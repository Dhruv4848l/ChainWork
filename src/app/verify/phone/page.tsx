import { redirect } from "next/navigation";
import { AuthShell } from "@/features/auth/AuthShell";
import { OtpForm } from "@/features/auth/OtpForm";
import { requireUser } from "@/lib/auth/guards";

function maskPhone(phone: string | null): string {
  if (!phone) return "your phone";
  const last3 = phone.slice(-3);
  return `+•• ••••• ••${last3}`;
}

export default async function VerifyPhonePage() {
  const user = await requireUser("/verify/phone");
  if (user.phoneVerified) {
    if (!user.onboarded)
      redirect(user.role === "WORKER" ? "/onboarding/worker" : "/onboarding/client");
    redirect(user.role === "WORKER" ? "/dashboard/worker" : "/dashboard/client");
  }
  return (
    <AuthShell>
      <OtpForm phoneHint={maskPhone(user.phone)} />
    </AuthShell>
  );
}
