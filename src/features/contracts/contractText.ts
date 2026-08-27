import { createHash } from "node:crypto";

/*
  The canonical contract document.

  Both the on-screen contract and the signature hash are generated from THIS
  function, from the same inputs, in a fixed order. That is what makes the typed
  signature meaningful: `documentHash` is a SHA-256 of the exact text the party read
  when they signed. Recompute it later — if a single rupee, date, phase name or
  clause has changed, the hash no longer matches and the signature is visibly void.

  Deliberately dependency-free and free of `server-only` so it can be unit-tested
  and rendered on either side.
*/

export interface ContractParty {
  name: string;
  /** Masked for display in the document body — never the full number. */
  contactHint?: string | null;
}

export interface ContractMilestone {
  index: number;
  name: string;
  amount: number;
  dueDate?: Date | string | null;
}

export interface ContractDocInput {
  reference: string;
  jobTitle: string;
  roleName: string;
  client: ContractParty;
  worker: ContractParty;
  totalValue: number;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  scope: string;
  cancellationTerms?: string | null;
  milestones: ContractMilestone[];
}

function isoDay(d: Date | string | null | undefined): string {
  if (!d) return "not fixed";
  const date = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(date.getTime()) ? "not fixed" : date.toISOString().slice(0, 10);
}

function inr(n: number): string {
  return `INR ${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

/** The fixed clauses every ChainWork contract carries. Numbered for citation. */
export const STANDARD_CLAUSES: string[] = [
  "Payment is by phase. For each phase the client locks the full phase amount in the ChainWork escrow smart contract BEFORE work on that phase begins. Neither party can move locked funds unilaterally.",
  "Phases fund sequentially. Phase N+1 can only be funded once phase N has been released, so the worker is never asked to work beyond the money already locked, and the client is never exposed for more than one phase at a time.",
  "The worker marks a phase delivered. That opens the client's verification window, counted in working days per platform policy.",
  "If the client approves, the phase amount is released to the worker immediately and irreversibly.",
  "If the client neither approves nor responds, the platform sends a capped number of reminders and the escrow then releases to the worker automatically when the window lapses. Silence is not a way to withhold payment.",
  "The client may request changes instead of approving, up to the revision limit shown in the app. Each request resets the verification window on redelivery.",
  "If the worker does not deliver by the phase due date and goes unresponsive through the grace period, the phase escrow is returned to the client and a strike is recorded against the worker.",
  "Either party may raise a dispute on a phase. Raising a dispute FREEZES that phase's escrow on-chain. The dispute is decided by a randomly selected, staked panel of peers voting by commit-reveal — not by a ChainWork employee — and the verdict directs the frozen funds.",
  "Parties may instead agree a mutual settlement (a split or partial refund) at any time, which closes the phase without a jury.",
  "This contract is accepted by both parties typing their full legal name as a digital signature. Each signature is recorded with a timestamp, the signer's network address, and a SHA-256 hash of this document text. Any later change to the terms voids the hash and requires both parties to sign again.",
];

/** Render the canonical, signable contract text. Deterministic for a given input. */
export function renderContractText(input: ContractDocInput): string {
  const lines: string[] = [];
  lines.push("CHAINWORK — PHASE-ESCROW WORK CONTRACT");
  lines.push(`Contract reference: ${input.reference}`);
  lines.push("");
  lines.push("1. PARTIES");
  lines.push(`   Client: ${input.client.name}${input.client.contactHint ? ` (${input.client.contactHint})` : ""}`);
  lines.push(`   Worker: ${input.worker.name}${input.worker.contactHint ? ` (${input.worker.contactHint})` : ""}`);
  lines.push("");
  lines.push("2. ENGAGEMENT");
  lines.push(`   Job: ${input.jobTitle}`);
  lines.push(`   Role: ${input.roleName}`);
  lines.push(`   Period: ${isoDay(input.startDate)} to ${isoDay(input.endDate)}`);
  lines.push(`   Total contract value: ${inr(input.totalValue)}`);
  lines.push("");
  lines.push("3. SCOPE OF WORK");
  for (const para of input.scope.split(/\n+/)) {
    if (para.trim()) lines.push(`   ${para.trim()}`);
  }
  lines.push("");
  lines.push("4. MILESTONE & PAYMENT SCHEDULE");
  for (const m of input.milestones) {
    lines.push(`   Phase ${m.index}: ${m.name} — ${inr(m.amount)} — due ${isoDay(m.dueDate)}`);
  }
  lines.push(`   Schedule total: ${inr(input.milestones.reduce((s, m) => s + m.amount, 0))}`);
  lines.push("");
  lines.push("5. ESCROW, DELIVERY AND DISPUTE TERMS");
  STANDARD_CLAUSES.forEach((c, i) => lines.push(`   5.${i + 1} ${c}`));
  lines.push("");
  lines.push("6. CANCELLATION");
  lines.push(`   ${input.cancellationTerms ?? "Per platform policy."}`);
  lines.push("");
  return lines.join("\n");
}

/** SHA-256 (hex) of the canonical text — what each signature is bound to. */
export function contractHash(input: ContractDocInput): string {
  return createHash("sha256").update(renderContractText(input), "utf8").digest("hex");
}
