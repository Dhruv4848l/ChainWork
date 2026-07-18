"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { fundPhaseAction, approvePhaseAction, requestChangesAction } from "./actions";
import { ForgeComplete } from "@/features/shared/ForgeComplete";
import { formatInr } from "@/lib/format";

/*
  CL-07 client-side phase controls (all stubbed to Phase 7 — they log a TODO and
  report which phase wires them, never faking a release):
   - PENDING_FUNDING + fundable -> Fund Phase
   - PENDING_FUNDING + locked   -> "unlocks once previous phase closes"
   - DELIVERED / VERIFICATION_WINDOW_OPEN -> Approve & Release / Request Changes / Reject
*/
export function ClientPhaseControls({
  phaseId,
  status,
  amount,
  fundable,
  revisionCount,
}: {
  phaseId: string;
  status: string;
  amount: number;
  fundable: boolean;
  revisionCount: number;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const [forge, setForge] = useState(false);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ message?: string; error?: string; released?: boolean }>) =>
    start(async () => {
      const r = await fn();
      setMsg(r.message ?? r.error ?? null);
      if (r.released) setForge(true);
    });

  if (status === "PENDING_FUNDING") {
    if (!fundable) {
      return <p className="mt-1 text-xs text-ink3">Funding unlocks once the previous phase closes.</p>;
    }
    return (
      <div>
        <Button variant="primary" size="sm" disabled={pending} onClick={() => run(() => fundPhaseAction(phaseId))}>
          Fund Phase — {formatInr(amount)}
        </Button>
        {msg && <p className="mt-1.5 text-xs text-ink3">{msg}</p>}
      </div>
    );
  }

  if (status === "DELIVERED" || status === "VERIFICATION_WINDOW_OPEN") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <ForgeComplete show={forge} onDone={() => setForge(false)} />
        <Button variant="success" size="sm" disabled={pending} onClick={() => run(() => approvePhaseAction(phaseId))}>
          Approve — Release {formatInr(amount)}
        </Button>
        <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(() => requestChangesAction(phaseId))}>
          Request Changes <span className="text-ink3">(Rev {revisionCount + 1} of 2)</span>
        </Button>
        <a href="/dashboard/client/complaint" className="text-[12.5px] font-medium text-ember hover:underline">
          Reject / File Complaint
        </a>
        {msg && <p className="mt-1 w-full text-xs text-ink3">{msg}</p>}
      </div>
    );
  }

  return null;
}
