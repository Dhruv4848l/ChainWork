import { requireRole } from "@/lib/auth/guards";
import { getClientProfile } from "@/features/client/queries";
import { ClientSettingsTabs } from "@/features/client/ClientSettingsTabs";

export default async function ClientSettingsPage() {
  const user = await requireRole("CLIENT");
  const data = await getClientProfile(user.id);
  const c = data?.clientProfile;

  return (
    <div>
      <h1 className="mb-4.5 text-[28px] font-semibold text-ink">Settings</h1>
      <ClientSettingsTabs
        account={{ email: user.email, phone: user.phone ?? "—", kycTier: user.kycTier, emailVerified: user.emailVerified }}
        isBusiness={c?.clientType === "BUSINESS"}
        companyName={c?.companyName}
      />
    </div>
  );
}
