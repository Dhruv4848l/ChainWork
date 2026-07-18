import { requireRole } from "@/lib/auth/guards";
import { getWorkerProfile } from "@/features/worker/queries";
import { SettingsTabs } from "@/features/worker/SettingsTabs";

export default async function SettingsPage() {
  const user = await requireRole("WORKER");
  const data = await getWorkerProfile(user.id);
  const p = data?.workerProfile;
  const rating = p?.ratingAvg ?? 0;
  const jobs = p?.completedJobsCount ?? 0;

  return (
    <div>
      <h1 className="mb-4.5 text-[28px] font-semibold text-ink">Settings</h1>
      <SettingsTabs
        account={{
          email: user.email,
          phone: user.phone ?? "—",
          kycTier: user.kycTier,
          emailVerified: user.emailVerified,
        }}
        jury={{
          kycOk: user.kycTier === "VERIFIED" || user.kycTier === "TRUSTED",
          ratingOk: rating >= 4.5,
          jobsOk: jobs >= 25,
          rating,
          jobs,
        }}
      />
    </div>
  );
}
