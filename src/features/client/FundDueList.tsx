"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { formatInr } from "@/lib/format";
import { CheckoutModal } from "./checkout/CheckoutModal";

/*
  CL-08 "Next phase funding due" (payment plan P6.7 follow-up): each row's Fund button opens
  the same payment window as the hire page — currency choice, recipient, receipt — instead
  of paying from the ChainWork wallet behind the scenes. The LIST owns the window: funding
  re-renders the page and drops the row, and the window must survive that to show the
  receipt (same rule as ClientPhaseControls).
*/
export interface FundDueItem {
  id: string;
  name: string;
  hireTitle: string;
  amount: number;
}

export function FundDueList({ items }: { items: FundDueItem[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <>
      {openId && <CheckoutModal phaseId={openId} open onClose={() => setOpenId(null)} />}
      {items.length === 0 && <p className="text-sm text-ink3">Nothing due to fund.</p>}
      {items.map((p) => (
        <div key={p.id} className="flex items-center justify-between border-b border-hair py-3 last:border-b-0">
          <span>
            <span className="block text-[13px] font-medium text-ink">{p.name}</span>
            <span className="block text-[11px] text-ink3">{p.hireTitle}</span>
          </span>
          <Button variant="primary" size="sm" onClick={() => setOpenId(p.id)}>
            Fund {formatInr(p.amount)}
          </Button>
        </div>
      ))}
    </>
  );
}
