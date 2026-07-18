"use client";

import { StubButton } from "@/features/shared/StubButton";
import { addFundsAction } from "@/features/wallet/actions";

/* CL-08 Add Funds — the mocked fiat on-ramp (credits the custodial wallet). */
export function AddFundsButton() {
  return <StubButton label="Add Funds" size="sm" run={addFundsAction} />;
}
