import "server-only";
import { platformDb } from "@/lib/platformDb";
import { canTransitionPhase, isPhaseSettled } from "./phaseMachine";
import { hireStake } from "./stake";

/*
  Every rule that must hold before a phase may be funded — ONE place, so the ChainWork-
  wallet button, payment quotes and external-wallet payments (payment plan P6) can never
  disagree. KYC is checked separately by the actions (it redirects).
*/

export async function loadFundablePhase(phaseId: string) {
  return platformDb.phase.findUnique({
    where: { id: phaseId },
    include: { hire: { include: { client: true, worker: true, contract: true, job: { select: { title: true } } } } },
  });
}

type FundablePhase = NonNullable<Awaited<ReturnType<typeof loadFundablePhase>>>;

/** null = fundable; otherwise the plain-language reason it isn't. */
export async function fundingBlocker(phase: FundablePhase | null, clientUserId: string): Promise<string | null> {
  if (!phase || phase.hire.clientId !== clientUserId) return "Phase not found.";
  if (!canTransitionPhase("fund", phase.status)) return "This phase isn't awaiting funding.";

  // Signatures — no escrow moves before both parties have signed the contract.
  const contract = phase.hire.contract;
  if (!contract?.clientSignature || !contract?.workerSignature) {
    const who = !contract?.clientSignature ? "You haven't" : "The worker hasn't";
    return `${who} signed the contract yet — escrow unlocks once both signatures are recorded.`;
  }

  // Delivery stake (P3.6) — above the threshold it must be in escrow first.
  const stake = await hireStake(phase.hire);
  if (stake.state === "AWAITING") {
    return `The worker hasn't locked their ₹${stake.amountInr.toLocaleString("en-IN")} delivery stake yet — funding opens once it's in escrow.`;
  }

  // Sequential funding — a phase can only be funded once the previous one has settled.
  if (phase.index > 1) {
    const prev = await platformDb.phase.findFirst({ where: { hireId: phase.hireId, index: phase.index - 1 } });
    if (prev && !isPhaseSettled(prev.status)) return `Fund Phase ${phase.index} unlocks once Phase ${phase.index - 1} closes.`;
  }
  return null;
}
