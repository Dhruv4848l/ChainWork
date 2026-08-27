import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui";
import { requireRole } from "@/lib/auth/guards";
import { getWorkerHireDetail } from "@/features/worker/queries";
import { PhaseTracker, type PhaseView } from "@/features/shared/PhaseTracker";
import { ContractRenderer } from "@/features/shared/ContractRenderer";
import { StubButton } from "@/features/worker/StubButton";
import { markPhaseDeliveredAction, checkInAction } from "@/features/worker/actions";
import { formatInr } from "@/lib/format";

const PHASE_NOTE: Record<string, string> = {
  RELEASED: "Released to your wallet",
  DELIVERED: "Awaiting client approval",
  VERIFICATION_WINDOW_OPEN: "Verification window open",
  DISPUTED: "Frozen — jury reviewing",
  FUNDED: "Funds locked — start when ready",
  IN_PROGRESS: "In progress",
  PENDING_FUNDING: "Unlocks once the previous phase closes",
  AUTO_CANCELLED: "Rolled back to client",
};

export default async function WorkerHireDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("WORKER");
  const { id } = await params;
  const hire = await getWorkerHireDetail(id, user.id);
  if (!hire) notFound();

  const phaseViews: PhaseView[] = hire.phases.map((p) => ({
    id: p.id,
    index: p.index,
    name: p.name,
    amount: Number(p.amount),
    dueDate: p.dueDate,
    status: p.status,
    note: PHASE_NOTE[p.status],
  }));

  const fullySigned = Boolean(
    hire.contract?.clientSignature && hire.contract?.workerSignature
  );
  const youNeedToSign = Boolean(hire.contract && !hire.contract.workerSignature);

  // The worker can mark a FUNDED/IN_PROGRESS phase delivered.
  const actionsByPhase: Record<string, React.ReactNode> = {};
  for (const p of hire.phases) {
    if (p.status === "FUNDED" || p.status === "IN_PROGRESS") {
      actionsByPhase[p.id] = (
        <StubButton label="Mark Delivered" size="sm" run={markPhaseDeliveredAction.bind(null, p.id)} />
      );
    }
  }

  return (
    <div className="max-w-4xl">
      <Link href="/dashboard/worker/hires" className="mb-4 inline-block text-[12.5px] font-semibold uppercase tracking-wider text-bronze hover:underline">
        ← Active hires
      </Link>

      <div className="mb-4.5 flex items-start justify-between gap-4">
        <div>
          <h1 className="m-0 text-2xl font-semibold text-ink">{hire.job.title} — Phase contract</h1>
          <div className="mt-1.5 text-[13px] text-ink3">
            Client: {hire.client.name} · Hire #{hire.id.slice(-6)}
          </div>
        </div>
        {hire.deliveryStake && (
          <div className="flex items-center gap-2 rounded-full border border-bronze/30 bg-card px-4 py-2 text-[11.5px] font-semibold text-bronze">
            Delivery stake: {formatInr(Number(hire.deliveryStake.amount))} {hire.deliveryStake.status.toLowerCase()}
          </div>
        )}
      </div>

      {!fullySigned && (
        <Link
          href={`/dashboard/worker/hires/${hire.id}/contract`}
          className="mb-4 block rounded-xl border border-amber/40 bg-amber/10 px-5 py-4 text-[13px] text-amber hover:border-amber"
        >
          <span className="font-semibold">
            {youNeedToSign
              ? "Contract awaiting your signature"
              : "Waiting on the client's signature"}
          </span>{" "}
          — nothing is funded until both parties sign. Read the terms &amp; sign →
        </Link>
      )}

      <div className="grid gap-3.5 lg:grid-cols-[1.5fr_1fr]">
        <div className="flex flex-col gap-3.5">
          <Card className="p-6">
            <h3 className="mb-4 text-[15px] font-semibold text-ink">Phase Tracker</h3>
            <PhaseTracker phases={phaseViews} actionsByPhase={actionsByPhase} />
            <p className="mt-3.5 text-xs leading-relaxed text-ink3">
              Verification windows count working days only. The client gets at most 2 reminders —
              then the phase releases to you automatically.
            </p>
          </Card>

          {hire.contract && (
            <ContractRenderer
              contract={{
                parties: `${hire.worker.name} ↔ ${hire.client.name}`,
                totalValue: Number(hire.contract.totalValue),
                startDate: hire.contract.startDate,
                endDate: hire.contract.endDate,
                scope: hire.contract.scope,
                cancellationTerms: hire.contract.cancellationTerms,
                onChainEscrowAddress: hire.contract.onChainEscrowAddress,
                acceptedByBoth: fullySigned,
                clientSignature: hire.contract.clientSignature,
                workerSignature: hire.contract.workerSignature,
                documentHash: hire.contract.documentHash,
                contractHref: `/dashboard/worker/hires/${hire.id}/contract`,
              }}
            />
          )}
        </div>

        <div className="flex flex-col gap-3.5">
          <Card className="p-5">
            <h3 className="mb-2.5 text-[15px] font-semibold text-ink">Today&apos;s check-in</h3>
            <StubButton label="Check in (QR)" variant="success" run={checkInAction.bind(null, hire.id)} className="w-full" />
          </Card>
          <Card className="flex flex-col gap-2.5 p-5">
            <Link href="/dashboard/worker/messages">
              <span className="block rounded-full border border-line-strong px-4 py-3 text-center text-[13px] font-medium text-ink hover:border-bronze">
                Open chat with {hire.client.name.split(" ")[0]}
              </span>
            </Link>
            <Link href={`/dashboard/worker/complaint?hire=${hire.id}`} className="py-1.5 text-center text-[12.5px] text-ink3 hover:text-ember">
              Report an issue
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}
