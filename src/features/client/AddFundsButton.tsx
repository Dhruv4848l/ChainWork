"use client";

import { StubButton } from "@/features/shared/StubButton";
import { addFundsAction } from "./actions";

export function AddFundsButton() {
  return <StubButton label="Add Funds" size="sm" run={addFundsAction} />;
}
