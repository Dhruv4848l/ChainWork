import { headers } from "next/headers";
import { requireRole } from "@/lib/auth/guards";
import { publicChainInfo } from "@/lib/chain/publicChain";
import { WalletProvider } from "@/features/wallet/web3/WalletProvider";
import { WorkerChrome } from "@/features/worker/WorkerChrome";
import { getWalletChip, getUnreadNotificationCount } from "@/features/worker/queries";

/*
  Shell for every Worker screen (WK-01..17). Enforces the WORKER role, loads the
  top-bar wallet balance, and wraps children in the sidebar + top bar chrome.
*/
export default async function WorkerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("WORKER");
  const [balance, unreadCount] = await Promise.all([
    getWalletChip(user.id),
    getUnreadNotificationCount(user.id),
  ]);
  const cookie = (await headers()).get("cookie");
  return (
    <WalletProvider chain={publicChainInfo()} cookie={cookie}>
      <WorkerChrome name={user.name} kycTier={user.kycTier} walletBalance={balance} unreadCount={unreadCount}>
        {children}
      </WorkerChrome>
    </WalletProvider>
  );
}
