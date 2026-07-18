"use client";

import { useState, useTransition } from "react";
import { keccak256, toHex } from "viem";
import { Button } from "@/components/ui";
import { ForgeComplete } from "@/features/shared/ForgeComplete";
import { commitVoteAction, revealVoteAction, finalizeVerdictAction, appealCaseAction } from "./actions";

/*
  ADM-12 commit-reveal voting console. A panellist commits a HASHED vote
  (keccak256 over choice|split|salt), then reveals it later — the server rejects a
  reveal that doesn't match the commitment. When quorum is reached, Finalize tallies
  (median % for split verdicts) and sets the verdict; ADM-08 then executes it on-chain.
*/
type Choice = "RELEASE_WORKER" | "REFUND_CLIENT" | "SPLIT";
const CHOICES: { key: Choice; label: string }[] = [
  { key: "RELEASE_WORKER", label: "Release to Worker" },
  { key: "REFUND_CLIENT", label: "Refund to Client" },
  { key: "SPLIT", label: "Split" },
];

type Juror = { jurorId: string; name: string; committed: boolean; revealed: boolean; choice: string | null };

function hash(choice: Choice, splitPct: number, salt: string): string {
  return keccak256(toHex(`${choice}|${splitPct}|${salt}`));
}

export function JuryVoteControls({
  caseId,
  status,
  panel,
  quorumReached,
  hasVerdict,
}: {
  caseId: string;
  status: string;
  panel: Juror[];
  quorumReached: boolean;
  hasVerdict: boolean;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const [forge, setForge] = useState(false);
  const [pending, start] = useTransition();
  // Remember what each juror committed so reveal can reproduce the hash.
  const [committed, setCommitted] = useState<Record<string, { choice: Choice; splitPct: number; salt: string }>>({});

  function commit(jurorId: string, choice: Choice, splitPct: number) {
    const salt = crypto.randomUUID();
    setCommitted((m) => ({ ...m, [jurorId]: { choice, splitPct, salt } }));
    start(async () => setMsg((await commitVoteAction(caseId, jurorId, hash(choice, splitPct, salt))).message ?? null));
  }
  function reveal(jurorId: string) {
    const v = committed[jurorId];
    if (!v) { setMsg("No local commitment for this juror — commit here first."); return; }
    start(async () => setMsg((await revealVoteAction(caseId, jurorId, v.choice, v.splitPct, v.salt)).message ?? null));
  }
  function finalize() {
    start(async () => { const r = await finalizeVerdictAction(caseId); setMsg(r.message ?? r.error ?? null); if (r.ok) setForge(true); });
  }
  function appeal() {
    start(async () => setMsg((await appealCaseAction(caseId)).message ?? null));
  }

  return (
    <div className="rounded-2xl border border-line bg-card p-6">
      <ForgeComplete show={forge} onDone={() => setForge(false)} />
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[15px] font-semibold text-ink">Commit-reveal voting</h3>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-bronze">{status}</span>
      </div>

      <div className="flex flex-col gap-2.5">
        {panel.map((j) => (
          <div key={j.jurorId} className="rounded-xl border border-hair bg-bg p-3">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[13px] font-medium text-ink">{j.name}</span>
              <span className="text-[11px] text-ink3">
                {j.revealed ? `revealed: ${j.choice}` : j.committed ? "committed" : "not voted"}
              </span>
            </div>
            {!j.committed && (
              <div className="flex flex-wrap gap-1.5">
                {CHOICES.map((c) => (
                  <button
                    key={c.key}
                    disabled={pending}
                    onClick={() => commit(j.jurorId, c.key, 50)}
                    className="rounded-full border border-line-strong px-3 py-1 text-[11.5px] text-ink2 hover:border-bronze disabled:opacity-50"
                  >
                    Commit: {c.label}
                  </button>
                ))}
              </div>
            )}
            {j.committed && !j.revealed && (
              <Button variant="secondary" size="sm" disabled={pending} onClick={() => reveal(j.jurorId)}>
                Reveal vote
              </Button>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        {!hasVerdict && (
          <Button variant="primary" size="sm" disabled={pending || !quorumReached} onClick={finalize}>
            {quorumReached ? "Finalize Verdict" : "Finalize — needs quorum"}
          </Button>
        )}
        <Button variant="secondary" size="sm" disabled={pending} onClick={appeal}>
          Appeal (once, larger panel)
        </Button>
        {msg && <span className="w-full text-[11.5px] text-ink3">{msg}</span>}
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-ink3">
        Committed votes are hidden until reveal; a reveal that doesn&apos;t match the commitment is
        rejected. Tied split proposals resolve to the median %.
      </p>
    </div>
  );
}
