/*
  The phase (DB) state machine — payment plan P1.4 / ROADMAP principle 3.

  Every place that changes Phase.status goes through `phaseTransition()` (or checks
  `canTransitionPhase`), and the actual write is guarded on the status it expects
  (`updateMany({ where: { id, status: { in: from } } })`), so a double click or a
  parallel cron tick can never apply the same change twice.

  Kept in step with the contract (src/lib/chain/escrowRules.ts): the DB can only move
  where the on-chain escrow can.
*/

export type PhaseStatus =
  | "PENDING_FUNDING" | "FUNDED" | "IN_PROGRESS" | "DELIVERED" | "VERIFICATION_WINDOW_OPEN"
  | "RELEASED" | "DISPUTED" | "AUTO_CANCELLED" | "RESOLVED";

export type PhaseEvent =
  | "fund"            // client funded the escrow
  | "start"           // worker checked in / began (optional step)
  | "deliver"         // worker marked delivered → verification window opens
  | "requestChanges"  // client asked for a revision (back to work)
  | "approve"         // client approved → released to worker
  | "autoRelease"     // verification window lapsed → released to worker
  | "refund"          // no-show / ghosting → escrow back to the client
  | "dispute"         // escalated to the jury → frozen
  | "resolve";        // verdict / settlement split executed

/** For each event: the statuses it may start from, and where it lands. */
export const PHASE_TRANSITIONS: Record<PhaseEvent, { from: readonly PhaseStatus[]; to: PhaseStatus }> = {
  fund: { from: ["PENDING_FUNDING"], to: "FUNDED" },
  start: { from: ["FUNDED"], to: "IN_PROGRESS" },
  deliver: { from: ["FUNDED", "IN_PROGRESS"], to: "VERIFICATION_WINDOW_OPEN" },
  // F4: only a phase that has actually been delivered can be sent back for changes.
  requestChanges: { from: ["DELIVERED", "VERIFICATION_WINDOW_OPEN"], to: "IN_PROGRESS" },
  // The contract lets the client release early (FUNDED) as well as after delivery.
  approve: { from: ["FUNDED", "DELIVERED", "VERIFICATION_WINDOW_OPEN"], to: "RELEASED" },
  autoRelease: { from: ["VERIFICATION_WINDOW_OPEN", "DELIVERED"], to: "RELEASED" },
  refund: { from: ["FUNDED", "IN_PROGRESS", "DELIVERED", "VERIFICATION_WINDOW_OPEN"], to: "AUTO_CANCELLED" },
  dispute: { from: ["FUNDED", "IN_PROGRESS", "DELIVERED", "VERIFICATION_WINDOW_OPEN"], to: "DISPUTED" },
  resolve: { from: ["DISPUTED"], to: "RESOLVED" },
};

/** Phases whose money has left escrow for good. */
export const CLOSED_PHASE_STATUSES: readonly PhaseStatus[] = ["RELEASED", "RESOLVED", "AUTO_CANCELLED"];

/** A phase that no longer blocks the next one from being funded. */
export function isPhaseSettled(status: string): boolean {
  return status === "RELEASED" || status === "RESOLVED";
}

export function canTransitionPhase(event: PhaseEvent, from: string): boolean {
  return (PHASE_TRANSITIONS[event].from as readonly string[]).includes(from);
}

export class PhaseTransitionError extends Error {
  constructor(public readonly event: PhaseEvent, public readonly from: string) {
    super(`A phase that is ${from.toLowerCase().replace(/_/g, " ")} can't ${EVENT_VERB[event]}.`);
    this.name = "PhaseTransitionError";
  }
}

const EVENT_VERB: Record<PhaseEvent, string> = {
  fund: "be funded",
  start: "be started",
  deliver: "be marked delivered",
  requestChanges: "be sent back for changes",
  approve: "be approved",
  autoRelease: "auto-release",
  refund: "be refunded",
  dispute: "be disputed",
  resolve: "be settled",
};

/** Validates the event and returns the guarded-update shape `{ from, to }`. */
export function phaseTransition(event: PhaseEvent, current: string): { from: PhaseStatus[]; to: PhaseStatus } {
  if (!canTransitionPhase(event, current)) throw new PhaseTransitionError(event, current);
  const t = PHASE_TRANSITIONS[event];
  return { from: [...t.from], to: t.to };
}
