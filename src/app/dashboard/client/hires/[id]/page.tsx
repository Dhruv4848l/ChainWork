import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui";
import { requireRole } from "@/lib/auth/guards";
import { getClientHireDetail } from "@/features/client/queries";
import { PhaseTracker, type PhaseView } from "@/features/shared/PhaseTracker";
import { ContractRenderer } from "@/features/shared/ContractRenderer";
import { ClientPhaseControls } from "@/features/client/ClientPhaseControls";
import { StubButton } from "@/features/shared/StubButton";
import { markNoShowAction, proposeSettlementAction } from "@/features/client/actions";
import { formatInr } from "@/lib/format";

const PHASE_NOTE: Record<string, string> = {
  RELEASED: "Approved & released to the worker",
  DELIVERED: "Delivered — review and approve",
  VERIFICATION_WINDOW_OPEN: "Verification window open",
  DISPUTED: "Frozen — jury reviewing",
  FUNDED: "Funded — work can begin",
  IN_PROGRESS: "In progress",
  PENDING_FUNDING: "Not yet funded",
  AUTO_CANCELLED: "Rolled back to you",
};

export default async function ClientHireDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("CLIENT");
  const { id } = await params;
  const hire = await getClientHireDetail(id, user.id);
  if (!hire) notFound();

  const phaseViews: PhaseView[] = hire.phases.map((p) => ({
    id: p.id, index: p.index, name: p.name, amount: Number(p.amount),
    dueDate: p.dueDate, status: p.status, note: PHASE_NOTE[p.status],
  }));

  // A PENDING_FUNDING phase is fundable if it's the first phase or the previous one released.
  const actionsByPhase: Record<string, React.ReactNode> = {};
  hire.phases.forEach((p, i) => {
    const fundable = i === 0 || hire.phases[i - 1]?.status === "RELEASED";
    const controls = (
      <ClientPhaseControls
        phaseId={p.id}
        status={p.status}
        amount={Number(p.amount)}
        fundable={fundable}
        revisionCount={p.revisionCount}
      />
    );
    if (["PENDING_FUNDING", "DELIVERED", "VERIFICATION_WINDOW_OPEN"].includes(p.status)) {
      actionsByPhase[p.id] = controls;
    }
  });

  return (
    <div className="max-w-4xl">
      <Link href="/dashboard/client/hires" className="mb-4 inline-block text-[12.5px] font-semibold uppercase tracking-wider text-bronze hover:underline">
        ← Active hires
      </Link>

      <div className="mb-4.5 flex items-start justify-between gap-4">
        <div>
          <h1 className="m-0 text-2xl font-semibold text-ink">{hire.job.title} — {hire.worker.name}</h1>
          <div className="mt-1.5 text-[13px] text-ink3">
            {hire.roleLineItem.roleName} · Hire #{hire.id.slice(-6)}
          </div>
        </div>
        {hire.deliveryStake && (
          <div className="flex items-center gap-2 rounded-full border border-bronze/30 bg-card px-4 py-2 text-[11.5px] font-semibold text-bronze">
            Worker stake: {formatInr(Number(hire.deliveryStake.amount))} locked
          </div>
        )}
      </div>

      <div className="grid gap-3.5 lg:grid-cols-[1.5fr_1fr]">
        <div className="flex flex-col gap-3.5">
          <Card className="p-6">
            <h3 className="mb-4 text-[15px] font-semibold text-ink">Phase Tracker</h3>
            <PhaseTracker phases={phaseViews} actionsByPhase={actionsByPhase} />
            <p className="mt-3.5 text-xs leading-relaxed text-ink3">
              Approve to release a phase to the worker, or request changes (resets the verification
              window). If it goes wrong, a peer jury decides — not us.
            </p>
          </Card>

          {hire.contract && (
            <ContractRenderer
              contract={{
                parties: `${hire.client.name} ↔ ${hire.worker.name}`,
                totalValue: Number(hire.contract.totalValue),
                startDate: hire.contract.startDate,
                endDate: hire.contract.endDate,
                scope: hire.contract.scope,
                cancellationTerms: hire.contract.cancellationTerms,
                onChainEscrowAddress: hire.contract.onChainEscrowAddress,
                acceptedByBoth: hire.contract.acceptedByClient && hire.contract.acceptedByWorker,
              }}
            />
          )}
        </div>

        <div className="flex flex-col gap-3.5">
          <Card className="flex flex-col gap-2.5 p-5">
            <Link href="/dashboard/client/messages">
              <span className="block rounded-full border border-line-strong px-4 py-3 text-center text-[13px] font-medium text-ink hover:border-bronze">
                Open chat with {hire.worker.name.split(" ")[0]}
              </span>
            </Link>
            <StubButton label="Mark No-Show" variant="danger" size="sm" run={markNoShowAction.bind(null, hire.id)} />
          </Card>

          <Card className="p-5">
            <div className="mb-1.5 text-[12.5px] font-semibold text-ink">Mutual Settlement</div>
            <p className="mb-3 text-xs leading-relaxed text-ink2">
              Instead of rejecting, propose a split or partial refund the worker can accept directly —
              no jury involved.
            </p>
            <StubButton label="Propose settlement" variant="secondary" size="sm" run={proposeSettlementAction.bind(null, hire.id)} />
          </Card>
        </div>
      </div>
    </div>
  );
}
