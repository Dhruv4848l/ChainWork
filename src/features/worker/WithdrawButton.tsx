"use client";

import { StubButton } from "./StubButton";
import { withdrawAction } from "./actions";

/* WK-12 withdraw — off-ramp wired in Phase 9 (stub for now). */
export function WithdrawButton() {
  return <StubButton label="Withdraw to Bank / UPI" size="sm" run={withdrawAction} />;
}
