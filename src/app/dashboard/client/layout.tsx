import { headers } from "next/headers";
import { requireRole } from "@/lib/auth/guards";
import { publicChainInfo } from "@/lib/chain/publicChain";
import { WalletProvider } from "@/features/wallet/web3/WalletProvider";
import { ClientChrome } from "@/features/client/ClientChrome";
import { getEscrowTotal, getUnreadNotificationCount } from "@/features/client/queries";

/*
  Shell for every Client screen (CL-01..13). Enforces the CLIENT role and loads the
  top-bar escrow total.
*/
export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("CLIENT");
  const [escrow, unreadCount] = await Promise.all([
    getEscrowTotal(user.id),
    getUnreadNotificationCount(user.id),
  ]);
  const cookie = (await headers()).get("cookie");
  return (
    <WalletProvider chain={publicChainInfo()} cookie={cookie}>
      <ClientChrome name={user.name} kycTier={user.kycTier} escrowTotal={escrow} unreadCount={unreadCount}>
        {children}
      </ClientChrome>
    </WalletProvider>
  );
}
