import "server-only";
import { platformDb } from "@/lib/platformDb";
import { renderContractText, contractHash, type ContractDocInput } from "./contractText";

/*
  Contract reads shared by the client and worker signing screens. Both sides see the
  SAME document text — that is the point of a two-sided signature.
*/

/** "ravi@…" / "•••••••901" — enough to identify a party, not enough to leak contact details. */
function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!domain || domain.endsWith("phone.chainwork.local")) return "";
  return `${name.slice(0, 2)}•••@${domain}`;
}

export async function getHireForContract(hireId: string, userId: string) {
  const hire = await platformDb.hire.findFirst({
    where: { id: hireId, OR: [{ clientId: userId }, { workerId: userId }] },
    include: {
      client: true,
      worker: true,
      job: true,
      roleLineItem: true,
      contract: true,
      phases: { orderBy: { index: "asc" } },
    },
  });
  return hire;
}

export type HireForContract = NonNullable<Awaited<ReturnType<typeof getHireForContract>>>;

/** Build the canonical document input from a persisted hire. Single source of truth. */
export function docInputFromHire(hire: HireForContract): ContractDocInput {
  return {
    reference: `CW-${hire.id.slice(-10).toUpperCase()}`,
    jobTitle: hire.job.title,
    roleName: hire.roleLineItem.roleName,
    client: { name: hire.client.name, contactHint: maskEmail(hire.client.email) },
    worker: { name: hire.worker.name, contactHint: maskEmail(hire.worker.email) },
    totalValue: Number(hire.contract?.totalValue ?? hire.totalValue),
    startDate: hire.contract?.startDate ?? hire.job.startDate,
    endDate: hire.contract?.endDate ?? hire.job.endDate,
    scope: hire.contract?.scope ?? hire.job.description,
    cancellationTerms: hire.contract?.cancellationTerms ?? null,
    milestones: hire.phases.map((p) => ({
      index: p.index,
      name: p.name,
      amount: Number(p.amount),
      dueDate: p.dueDate,
    })),
  };
}

/** The rendered text + its hash, plus whether a stored hash still matches (tamper check). */
export function contractDocument(hire: HireForContract) {
  const input = docInputFromHire(hire);
  const text = renderContractText(input);
  const hash = contractHash(input);
  const stored = hire.contract?.documentHash ?? null;
  return { text, hash, storedHash: stored, intact: stored === null || stored === hash };
}
