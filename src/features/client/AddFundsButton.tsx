"use client";

import { AddFundsForm } from "@/features/wallet/AddFundsForm";

/* CL-08 / WK-12 Add Funds — the mocked fiat on-ramp, the only way money enters a wallet (P3.1). */
export function AddFundsButton() {
  return <AddFundsForm />;
}
