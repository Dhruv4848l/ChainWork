"use client";

import { StubButton } from "@/features/shared/StubButton";
import { fundPhaseAction } from "./actions";
import { formatInr } from "@/lib/format";

export function FundDueButton({ phaseId, amount }: { phaseId: string; amount: number }) {
  return <StubButton label={`Fund ${formatInr(amount)}`} size="sm" run={fundPhaseAction.bind(null, phaseId)} />;
}
