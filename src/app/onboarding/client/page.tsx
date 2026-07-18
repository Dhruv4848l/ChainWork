import { AuthShell } from "@/features/auth/AuthShell";
import { ClientOnboardingForm } from "@/features/auth/ClientOnboardingForm";
import { requireRole } from "@/lib/auth/guards";

export default async function ClientOnboardingPage() {
  const user = await requireRole("CLIENT", "/onboarding/client");
  return (
    <AuthShell>
      <ClientOnboardingForm
        isBusiness={user.clientProfile?.clientType === "BUSINESS"}
      />
    </AuthShell>
  );
}
