"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { acceptApplicantAction, rejectApplicantAction } from "./actions";

/*
  CL-05 applicant row actions. Accept is REAL — it creates a Hire + Contract + Phase
  and redirects to the hire. Reject is REAL. (Escrow funding is stubbed to Phase 7.)
*/
export function ApplicantActions({ applicationId }: { applicationId: string }) {
  const [pending, start] = useTransition();
  const [rejected, setRejected] = useState(false);

  if (rejected) {
    return <span className="text-xs text-ink3">Rejected</span>;
  }

  return (
    <div className="flex flex-shrink-0 gap-2">
      <Link href="/dashboard/client/messages">
        <Button variant="secondary" size="sm">Message</Button>
      </Link>
      <Button
        variant="danger"
        size="sm"
        disabled={pending}
        onClick={() => start(async () => { await rejectApplicantAction(applicationId); setRejected(true); })}
      >
        Reject
      </Button>
      <Button
        variant="primary"
        size="sm"
        disabled={pending}
        onClick={() => start(() => acceptApplicantAction(applicationId).then(() => {}))}
      >
        Accept
      </Button>
    </div>
  );
}
