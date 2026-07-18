import { AuthShell } from "@/features/auth/AuthShell";
import { KycForm } from "@/features/auth/KycForm";
import { requireUser } from "@/lib/auth/guards";

export default async function KycPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; returnTo?: string }>;
}) {
  const { reason, returnTo } = await searchParams;
  const user = await requireUser("/kyc");
  return (
    <AuthShell>
      <KycForm currentTier={user.kycTier} reason={reason} returnTo={returnTo} />
    </AuthShell>
  );
}
