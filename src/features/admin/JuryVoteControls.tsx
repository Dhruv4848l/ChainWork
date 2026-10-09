"use client";

import { useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { keccak256, toHex } from "viem";
import { Button } from "@/components/ui";
import { ForgeComplete } from "@/features/shared/ForgeComplete";
import { commitVoteAction, revealVoteAction, finalizeVerdictAction, appealCaseAction, type AdminActionState } from "./actions";

/*
  ADM-12 commit-reveal ballot. The logged-in juror votes for THEMSELVES only — the
  server works out who they are from the session. A commit sends just the hash
  keccak256(choice|split|salt); the choice, split and salt stay in this browser (and
  in the vote receipt shown to the juror) until the reveal, which the server checks
  against the hash. Finalize tallies once everyone has revealed or the reveal deadline
  has passed; ADM-08 then executes the verdict on-chain.
*/
type Choice = "RELEASE_WORKER" | "REFUND_CLIENT" | "SPLIT";
const CHOICES: { key: Choice; label: string }[] = [
  { key: "RELEASE_WORKER", label: "Release to Worker" },
  { key: "REFUND_CLIENT", label: "Refund to Client" },
  { key: "SPLIT", label: "Split" },
];

type Ballot = { choice: Choice; splitPct: number; salt: string };

function hash(b: Ballot): string {
  return keccak256(toHex(`${b.choice}|${b.splitPct}|${b.salt}`));
}

// The vote receipt is kept in this browser so the reveal can be one click. Storage can
// be unavailable (private window), so every access is guarded — the juror also gets the
// receipt on screen to note down, and can type it back in to reveal.
const storageKey = (caseId: string, jurorId: string) => `cw-ballot:${caseId}:${jurorId}`;
function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function parseBallot(raw: string | null): Ballot | null {
  try {
    return raw ? (JSON.parse(raw) as Ballot) : null;
  } catch {
    return null;
  }
}
const noSubscribe = () => () => {};
function saveBallot(key: string, b: Ballot) {
  try {
    window.localStorage.setItem(key, JSON.stringify(b));
  } catch {
    /* storage unavailable — the on-screen receipt is the fallback */
  }
}

const pill = (on: boolean) =>
  `rounded-full border px-3 py-1 text-[11.5px] disabled:opacity-50 ${on ? "border-bronze bg-bronze/10 text-ink" : "border-line-strong text-ink2 hover:border-bronze"}`;

export function JuryVoteControls({
  caseId,
  status,
  ballot,
  showFinalize,
  finalizeBlocker,
  showAppeal,
  appealBlocker,
}: {
  caseId: string;
  status: string;
  /** The viewer's own seat on the panel, or null if they aren't a juror on it. */
  ballot: { jurorId: string; committed: boolean; revealed: string | null } | null;
  showFinalize: boolean;
  finalizeBlocker: string | null;
  showAppeal: boolean;
  appealBlocker: string | null;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const [forge, setForge] = useState(false);
  const [pending, start] = useTransition();
  const [choice, setChoice] = useState<Choice | null>(null);
  const [split, setSplit] = useState(50);
  const key = ballot ? storageKey(caseId, ballot.jurorId) : null;
  // The receipt saved in this browser (null on the server), or the one just committed.
  const stored = useSyncExternalStore(noSubscribe, () => (key ? readStored(key) : null), () => null);
  const saved = useMemo(() => parseBallot(stored), [stored]);
  const [justCommitted, setJustCommitted] = useState<Ballot | null>(null);
  const receipt = justCommitted ?? saved;
  // Reveal form — prefilled from the receipt; whatever the juror types overrides it.
  const [edit, setEdit] = useState<Partial<Ballot>>({});
  const rChoice = edit.choice ?? receipt?.choice ?? "RELEASE_WORKER";
  const rSplit = edit.splitPct ?? receipt?.splitPct ?? 0;
  const rSalt = edit.salt ?? receipt?.salt ?? "";

  function show(r: AdminActionState) {
    setMsg(r.message ?? r.error ?? null);
  }

  function commit() {
    if (!key || !choice) return;
    const b: Ballot = { choice, splitPct: choice === "SPLIT" ? split : 0, salt: crypto.randomUUID() };
    saveBallot(key, b); // before sending, so a lost response can't lose the salt
    start(async () => {
      const r = await commitVoteAction(caseId, hash(b));
      show(r);
      if (r.ok) setJustCommitted(b);
    });
  }
  function reveal() {
    start(async () => show(await revealVoteAction(caseId, rChoice, rSplit, rSalt.trim())));
  }
  function finalize() {
    start(async () => {
      const r = await finalizeVerdictAction(caseId);
      show(r);
      if (r.ok) setForge(true);
    });
  }
  function appeal() {
    start(async () => show(await appealCaseAction(caseId)));
  }

  return (
    <div className="rounded-2xl border border-line bg-card p-6">
      <ForgeComplete show={forge} onDone={() => setForge(false)} />
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[15px] font-semibold text-ink">Your ballot</h3>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-bronze">{status}</span>
      </div>

      {!ballot && (
        <p className="text-[12.5px] text-ink3">
          Only the jurors seated on this panel vote, each from their own login. You can follow the
          progress here{showFinalize || showAppeal ? " and act on the result" : ""}.
        </p>
      )}

      {ballot && status === "COMMIT" && !ballot.committed && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Your verdict">
            {CHOICES.map((c) => (
              <button key={c.key} type="button" role="radio" aria-checked={choice === c.key} disabled={pending} onClick={() => setChoice(c.key)} className={pill(choice === c.key)}>
                {c.label}
              </button>
            ))}
          </div>
          {choice === "SPLIT" && (
            <label className="flex items-center gap-3 text-[12.5px] text-ink2">
              Worker gets
              <input type="range" min={0} max={100} step={5} value={split} onChange={(e) => setSplit(Number(e.target.value))} className="w-48 accent-bronze" aria-label="Worker share in percent" />
              <span className="w-10 font-semibold text-ink">{split}%</span>
            </label>
          )}
          <div>
            <Button variant="primary" size="sm" disabled={pending || !choice} onClick={commit}>Commit vote</Button>
          </div>
        </div>
      )}

      {ballot && ballot.committed && !ballot.revealed && status === "COMMIT" && (
        <p className="text-[12.5px] text-ink2">Committed. Reveal opens once every juror on the panel has committed.</p>
      )}

      {ballot && ballot.committed && !ballot.revealed && status === "REVEAL" && (
        <div className="flex flex-col gap-2.5">
          <p className="text-[12.5px] text-ink2">
            {receipt ? "Your vote receipt is filled in below." : "Enter the vote receipt you noted when you committed."}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select value={rChoice} onChange={(e) => setEdit((x) => ({ ...x, choice: e.target.value as Choice }))} aria-label="Committed verdict" className="rounded-lg border border-line bg-bg px-2.5 py-1.5 text-[12.5px] text-ink">
              {CHOICES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-[12px] text-ink3">
              Worker %
              <input type="number" min={0} max={100} value={rSplit} onChange={(e) => setEdit((x) => ({ ...x, splitPct: Number(e.target.value) }))} className="w-16 rounded-lg border border-line bg-bg px-2 py-1.5 text-[12.5px] text-ink" />
            </label>
            <input value={rSalt} onChange={(e) => setEdit((x) => ({ ...x, salt: e.target.value }))} placeholder="Secret (salt)" aria-label="Secret (salt)" className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-2.5 py-1.5 font-mono text-[12px] text-ink" />
          </div>
          <div>
            <Button variant="secondary" size="sm" disabled={pending || !rSalt.trim()} onClick={reveal}>Reveal vote</Button>
          </div>
        </div>
      )}

      {ballot?.revealed && <p className="text-[12.5px] text-ink2">You revealed: <span className="font-semibold text-ink">{ballot.revealed}</span>.</p>}

      {ballot && receipt && !ballot.revealed && (
        <div className="mt-3 rounded-lg border border-amber/30 bg-amber/[0.06] px-3 py-2 text-[11.5px] text-ink2">
          <div className="mb-0.5 font-semibold text-amber">Vote receipt — note it down</div>
          <span className="font-mono">{receipt.choice} · worker {receipt.splitPct}% · {receipt.salt}</span>
          <div className="mt-0.5 text-ink3">Saved in this browser too. Without it you can&apos;t reveal, and an unrevealed vote is slashed.</div>
        </div>
      )}

      {(showFinalize || showAppeal) && (
        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          {showFinalize && (
            <Button variant="primary" size="sm" disabled={pending || !!finalizeBlocker} onClick={finalize} title={finalizeBlocker ?? undefined}>
              Finalize verdict
            </Button>
          )}
          {showAppeal && (
            <Button variant="secondary" size="sm" disabled={pending || !!appealBlocker} onClick={appeal} title={appealBlocker ?? undefined}>
              Appeal (once, larger panel)
            </Button>
          )}
          {showFinalize && finalizeBlocker && <span className="text-[11.5px] text-ink3">{finalizeBlocker}</span>}
          {showAppeal && appealBlocker && <span className="text-[11.5px] text-ink3">{appealBlocker}</span>}
        </div>
      )}
      {msg && <p className="mt-3 text-[11.5px] text-ink3" role="status">{msg}</p>}
      <p className="mt-3 text-[11px] leading-relaxed text-ink3">
        Committed votes stay hidden until reveal; a reveal that doesn&apos;t match the commitment is
        rejected. Split proposals resolve to the median %.
      </p>
    </div>
  );
}
