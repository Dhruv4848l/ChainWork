import { requireRole } from "@/lib/auth/guards";
import { WorkerChrome } from "@/features/worker/WorkerChrome";
import { getWalletChip } from "@/features/worker/queries";

/*
  Shell for every Worker screen (WK-01..17). Enforces the WORKER role, loads the
  top-bar wallet balance, and wraps children in the sidebar + top bar chrome.
*/
export default async function WorkerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("WORKER");
  const balance = await getWalletChip(user.id);
  return (
    <WorkerChrome name={user.name} kycTier={user.kycTier} walletBalance={balance}>
      {children}
    </WorkerChrome>
  );
}
