import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, StatusBadge } from "@/components/ui";
import { requireAdminAccess } from "@/lib/admin/guards";
import { adminDb } from "@/lib/adminDb";
import { bridgePhaseSummary } from "@/lib/admin/bridge";
import { jurorForAdmin, stateOf } from "@/lib/admin/jury";
import { disputeBlocker } from "@/lib/admin/voting";
import { JuryVoteControls } from "@/features/admin/JuryVoteControls";
import { formatInr } from "@/lib/format";

/*
  ADM-12 Case detail. Shows the anonymized case, the subject phase (resolved through
  the bridge), the panel, and evidence. A JURY login sees only cases it's seated on,
  sees fellow jurors only as "Juror n", and gets a ballot for itself alone.
*/
function when(d: Date | null): string {
  return d ? `${d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })} IST` : "—";
}

export default async function CaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminAccess("disputes");
  const { id } = await params;
  const c = await adminDb.disputeCase.findUnique({
    where: { id },
    include: { assignments: { where: { removedAt: null }, include: { juror: true }, orderBy: { assignedAt: "asc" } }, votes: true, evidence: true },
  });
  if (!c) notFound();

  const isJury = admin.role === "JURY";
  const me = await jurorForAdmin(admin.id);
  const seated = !!me && c.assignments.some((a) => a.jurorId === me.id);
  if (isJury && !seated) notFound(); // a juror sees only their own cases

  const phase = await bridgePhaseSummary(c.subjectPhaseId); // bridge — platform data by id
  const appeal = await adminDb.disputeCase.findFirst({ where: { appealOfCaseId: c.id }, select: { id: true } });

  const state = stateOf(c, c.votes);
  const now = new Date();
  const finalizeBlocker = disputeBlocker(state, "finalize", now);
  const appealBlocker = isJury ? "Jurors can't open an appeal." : appeal ? "Already appealed." : disputeBlocker(state, "appeal", now);

  const myVote = me ? c.votes.find((v) => v.jurorId === me.id) : undefined;
  const panel = c.assignments.map((a, i) => {
    const vote = c.votes.find((v) => v.jurorId === a.jurorId);
    const mine = a.jurorId === me?.id;
    return {
      key: a.id,
      label: isJury ? (mine ? "You" : `Juror ${i + 1}`) : a.juror.displayName,
      agreement: isJury ? null : a.juror.agreementRate,
      committed: !!vote?.commitHash,
      revealed: vote?.revealedChoice ?? null,
    };
  });

  return (
    <div className="max-w-4xl">
      <Link href="/admin/disputes" className="mb-4 inline-block text-[12px] font-semibold uppercase tracking-wider text-bronze hover:underline">
        ← Dispute queue
      </Link>
      <div className="mb-1 flex flex-wrap items-center gap-3">
        <h1 className="m-0 text-[22px] font-semibold text-ink">{c.clientLabel} vs {c.workerLabel}</h1>
        <StatusBadge tone="warning">{c.status}</StatusBadge>
      </div>
      <p className="mb-1 text-[13px] text-ink3">{c.reason} · {formatInr(Number(c.escrowAmount))} · {c.valueTier} tier · {c.assignments.length} jurors</p>
      <p className="mb-5 text-[12px] text-ink3">
        Commit by {when(c.commitDeadline)} · Reveal by {when(c.revealDeadline)}
        {c.appealOfCaseId && !isJury && <> · Appeal of <Link className="text-bronze hover:underline" href={`/admin/disputes/${c.appealOfCaseId}`}>the original case</Link></>}
        {appeal && !isJury && <> · Appealed — <Link className="text-bronze hover:underline" href={`/admin/disputes/${appeal.id}`}>open the appeal</Link></>}
      </p>

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
          <h3 className="mb-3 text-[15px] font-semibold text-ink">Panel ({panel.length})</h3>
          <p className="mb-3 text-[12px] text-ink3">
            {panel.filter((p) => p.committed).length}/{panel.length} committed · {state.revealed}/{panel.length} revealed
          </p>
          {panel.length === 0 && <p className="text-[12px] text-amber">No eligible jurors yet — the jury timer seats them as they become available.</p>}
          {panel.map((p) => (
            <div key={p.key} className="flex items-center justify-between border-b border-hair py-2 text-[12.5px] last:border-b-0">
              <span className="text-ink2">{p.label}</span>
              <span className="text-[11px] text-ink3">
                {p.revealed ? `revealed: ${p.revealed}` : p.committed ? "committed" : "not voted"}
                {p.agreement != null && ` · ${p.agreement.toFixed(0)}% agree`}
              </span>
            </div>
          ))}
          {c.verdictChoice && (
            <p className="mt-3 rounded-lg border border-emerald/30 bg-emerald/[0.06] px-3 py-2 text-[12px] text-emerald">
              Verdict: {c.verdictChoice}{c.verdictSplitPct != null ? ` · ${c.verdictSplitPct}% to worker` : ""}
              {c.status === "VERDICT" ? " — ready to settle (ADM-08)." : c.status === "APPEALED" ? " — appealed; the appeal's verdict is the one settled." : "."}
            </p>
          )}
        </Card>
      </div>

      <div className="mt-3.5">
        <JuryVoteControls
          caseId={c.id}
          status={c.status}
          ballot={me && myVote ? { jurorId: me.id, committed: !!myVote.commitHash, revealed: myVote.revealedChoice ?? null } : null}
          finalizeBlocker={c.status === "REVEAL" && (!isJury || seated) ? finalizeBlocker : null}
          showFinalize={c.status === "REVEAL" && (!isJury || seated)}
          appealBlocker={appealBlocker}
          showAppeal={!isJury && c.status === "VERDICT"}
        />
      </div>
    </div>
  );
}
