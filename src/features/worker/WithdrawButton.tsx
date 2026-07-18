"use client";

import { StubButton } from "@/features/shared/StubButton";
import { withdrawAction } from "@/features/wallet/actions";

/* WK-12 withdraw — the mocked fiat off-ramp (real on-chain move out of custody). */
export function WithdrawButton() {
  return <StubButton label="Withdraw to Bank / UPI" size="sm" run={withdrawAction} />;
}
