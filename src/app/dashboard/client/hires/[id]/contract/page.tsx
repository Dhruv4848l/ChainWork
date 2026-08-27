import { requireRole } from "@/lib/auth/guards";
import { ContractSigningScreen } from "@/features/contracts/ContractSigningScreen";

export default async function ClientContractPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireRole("CLIENT");
  const { id } = await params;
  return <ContractSigningScreen hireId={id} userId={user.id} viewer="client" />;
}
