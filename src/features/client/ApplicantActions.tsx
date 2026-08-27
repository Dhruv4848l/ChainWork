"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { rejectApplicantAction } from "./actions";

/*
  CL-05 applicant row actions. Accept no longer creates the hire on the spot — it
  opens the offer screen where the client builds the milestone payment plan; the
  hire + unsigned contract are created from there, and escrow only unlocks once both
  parties have signed. Reject is immediate.
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
      <Link href={`/dashboard/client/offer/${applicationId}`}>
        <Button variant="primary" size="sm">Accept &amp; set milestones</Button>
      </Link>
    </div>
  );
}
