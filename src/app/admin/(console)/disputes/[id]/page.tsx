import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, StatusBadge } from "@/components/ui";
import { requireAdminAccess } from "@/lib/admin/guards";
import { adminDb } from "@/lib/adminDb";
import { bridgePhaseSummary } from "@/lib/admin/bridge";
import { JuryVoteControls } from "@/features/admin/JuryVoteControls";
import { formatInr } from "@/lib/format";

/*
  ADM-12 Case detail. Shows the anonymized case, the subject phase (resolved through
  the bridge), the panel, and evidence. Commit-reveal voting + verdict execution are
  built in Phase 11 — this is the case shell they plug into.
*/
export default async function CaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminAccess("disputes");
  const { id } = await params;
  const c = await adminDb.disputeCase.findUnique({
    where: { id },
    include: { assignments: { include: { juror: true } }, votes: true, evidence: true },
  });
  if (!c) notFound();
  const phase = await bridgePhaseSummary(c.subjectPhaseId); // bridge — platform data by id

  const revealed = c.votes.filter((v) => v.revealedChoice != null).length;
  const panel = c.assignments.map((a) => {
    const vote = c.votes.find((v) => v.jurorId === a.jurorId);
    return { jurorId: a.jurorId, name: a.juror.displayName, committed: !!vote?.commitHash, revealed: !!vote?.revealedChoice, choice: vote?.revealedChoice ?? null };
  });
  const quorumReached = revealed * 2 > c.panelSize;

  return (
    <div className="max-w-4xl">
      <Link href="/admin/disputes" className="mb-4 inline-block text-[12px] font-semibold uppercase tracking-wider text-bronze hover:underline">
        ← Dispute queue
      </Link>
      <div className="mb-1 flex items-center gap-3">
        <h1 className="m-0 text-[22px] font-semibold text-ink">{c.clientLabel} vs {c.workerLabel}</h1>
        <StatusBadge tone="warning">{c.status}</StatusBadge>
      </div>
      <p className="mb-5 text-[13px] text-ink3">{c.reason} · {formatInr(Number(c.escrowAmount))} · {c.valueTier} tier · {c.panelSize} jurors</p>

      <div className="grid gap-3.5 lg:grid-cols-[1.5fr_1fr]">
        <div className="flex flex-col gap-3.5">
          <Card className="p-6">
            <h3 className="mb-2 text-[15px] font-semibold text-ink">Subject phase</h3>
            {phase ? (
              <div className="text-[13px] text-ink2">
                <div className="font-medium text-ink">{phase.title} — {phase.name}</div>
                <div className="mt-1 text-ink3">{formatInr(phase.amount)} · on-chain status {phase.status}</div>
                <div className="mt-1 text-ink3">Escrow frozen pending verdict.</div>
              </div>
            ) : <p className="text-sm text-ink3">Phase not found.</p>}
          </Card>
          <Card className="p-6">
            <h3 className="mb-3 text-[15px] font-semibold text-ink">Evidence ({c.evidence.length})</h3>
            {c.evidence.map((e) => (
              <div key={e.id} className="flex justify-between border-b border-hair py-2 text-[12.5px] last:border-b-0">
                <span className="text-ink2">{e.submittedByLabel} · {e.fileRef ?? "—"}</span>
                <span className="font-mono text-[11px] text-ink3">{e.hash.slice(0, 10)}…</span>
              </div>
            ))}
          </Card>
        </div>

        <Card className="p-6">
          <h3 className="mb-3 text-[15px] font-semibold text-ink">Panel ({c.assignments.length})</h3>
          <p className="mb-3 text-[12px] text-ink3">{revealed}/{c.votes.length} revealed · {c.votes.length}/{c.assignments.length} voted</p>
          {c.assignments.map((a) => (
            <div key={a.id} className="flex items-center justify-between border-b border-hair py-2 text-[12.5px] last:border-b-0">
              <span className="text-ink2">{a.juror.displayName}</span>
              <span className="text-[11px] text-ink3">{a.juror.agreementRate.toFixed(0)}% agree</span>
            </div>
          ))}
          {c.verdictChoice && (
            <p className="mt-3 rounded-lg border border-emerald/30 bg-emerald/[0.06] px-3 py-2 text-[12px] text-emerald">
              Verdict: {c.verdictChoice}{c.verdictSplitPct != null ? ` · ${c.verdictSplitPct}% to worker` : ""} — ready to settle (ADM-08).
            </p>
          )}
        </Card>
      </div>

      <div className="mt-3.5">
        <JuryVoteControls
          caseId={c.id}
          status={c.status}
          panel={panel}
          quorumReached={quorumReached}
          hasVerdict={c.verdictChoice != null}
        />
      </div>
    </div>
  );
}
