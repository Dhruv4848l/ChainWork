import "server-only";
import { forfeitDeliveryStake } from "./stake";
import { platformDb } from "@/lib/platformDb";
import { getPlatformSettings } from "@/lib/config/platformConfig";
import { addBusinessDays } from "@/lib/calendar/businessDays";
import * as chain from "@/lib/chain/escrow";
import { maybeCompleteHire } from "@/lib/hires";
import { payoutAddressFor } from "@/lib/chain/wallet";
import { runPayment } from "@/lib/payments/service";
import { custodialAddressOf, escrowAddressLabel, refreshBalanceCache } from "@/lib/payments/parties";
import { reconcile } from "@/lib/payments/reconcile";

/*
  The escrow timing engine (spec 13.2 + 13.4). Runs periodically (a cron route hits
  runEscrowTick). It:
   1) sends up to `reminderCap` reminders during a phase's verification window, then
      auto-releases to the worker once the window lapses and the reminders are spent;
   2) applies the symmetric worker-side rule — a funded phase past its due date with
      no delivery gets reminders, then auto-cancels (escrow rolled back to the client,
      delivery stake forfeited, a strike applied, suspension past a threshold).

  Every transition is guarded by the current status, so running the tick repeatedly
  never double-releases or double-reminds. Money movements go through the payment
  service (src/lib/payments/service.ts), so each one is a recorded PaymentTransaction.
  3) Finally the reconciler finishes payments whose request died mid-way and repairs
     phases whose DB status fell behind the chain (src/lib/payments/reconcile.ts).
*/

export interface TickResult {
  remindersSent: number;
  autoReleased: number;
  autoCancelled: number;
  /** Stale payments the reconciler finalised this tick. */
  reconciledPayments: number;
  /** Phases whose DB status was repaired to match the chain. */
  repairedPhases: number;
  errors: string[];
}

/** When the i-th (0-based) reminder is due within [start, end], for `cap` reminders. */
function reminderDueAt(start: Date, end: Date, index: number, cap: number): Date {
  const span = end.getTime() - start.getTime();
  return new Date(start.getTime() + (span * (index + 1)) / (cap + 1));
}

export async function runEscrowTick(now: Date = new Date()): Promise<TickResult> {
  const res_: TickResult = { remindersSent: 0, autoReleased: 0, autoCancelled: 0, reconciledPayments: 0, repairedPhases: 0, errors: [] };
  const settings = await getPlatformSettings();
  const holidays = new Set(settings.holidays);

  // ---- 1) Verification window: remind the client, then auto-release to the worker ----
  const openPhases = await platformDb.phase.findMany({
    where: { status: "VERIFICATION_WINDOW_OPEN", verificationDeadline: { not: null } },
    include: { hire: true },
  });

  for (const p of openPhases) {
    const deadline = p.verificationDeadline!;
    const deliveredAt = p.deliveredAt ?? p.updatedAt;

    if (now >= deadline && p.reminderCount >= settings.reminderCap) {
      // Auto-release. The contract only permits this at/after releaseEligibleAfter,
      // which was set to the same deadline on markDelivered — so this is safe.
      const res = await runPayment(
        {
          kind: "RELEASE", operation: "autoRelease", signer: "RELAYER", amountInr: Number(p.amount),
          payerUserId: p.hire.clientId, payeeUserId: p.hire.workerId,
          fromAddress: escrowAddressLabel(), toAddress: await payoutAddressFor(p.hire.workerId),
          phaseId: p.id, hireId: p.hireId,
        },
        () => chain.autoRelease(p.id),
        {
          onConfirmedTx: async (tx, _payment, receipt) => {
            await tx.notification.createMany({
              data: [
                { userId: p.hire.workerId, type: "PAYMENT", title: "Payment auto-released", body: `The verification window on "${p.name}" lapsed — funds were released to you automatically. Receipt ${receipt.receiptNo}.`, linkUrl: "/dashboard/worker/earnings" },
                { userId: p.hire.clientId, type: "ESCROW", title: "Phase auto-released", body: `"${p.name}" auto-released to the worker after the verification window closed. Receipt ${receipt.receiptNo}.`, linkUrl: "/dashboard/client/payments" },
              ],
            });
          },
          afterConfirmed: async () => {
            await refreshBalanceCache(p.hire.workerId);
            await maybeCompleteHire(p.hireId); // last phase? → hire completes, reviews open
          },
        },
      );
      if (res.ok) res_.autoReleased++;
      else res_.errors.push(`autoRelease ${p.id}: ${res.code}${res.pending ? " (pending)" : ""}`);
      continue;
    }

    // Otherwise, send the next reminder if it's due and we're under the cap.
    if (p.reminderCount < settings.reminderCap) {
      const due = reminderDueAt(deliveredAt, deadline, p.reminderCount, settings.reminderCap);
      if (now >= due) {
        await platformDb.$transaction([
          platformDb.phase.update({ where: { id: p.id }, data: { reminderCount: { increment: 1 } } }),
          platformDb.notification.create({ data: { userId: p.hire.clientId, type: "REMINDER", title: "Verification window closing", body: `Please approve or request changes on "${p.name}" — it auto-releases to the worker when the window ends.` } }),
        ]);
        console.log(`[escrow tick] reminder ${p.reminderCount + 1}/${settings.reminderCap} sent for phase ${p.id}`);
        res_.remindersSent++;
      }
    }
  }

  // ---- 2) Worker ghosting: funded phase past due with no delivery ----
  const fundedPhases = await platformDb.phase.findMany({
    where: { status: { in: ["FUNDED", "IN_PROGRESS"] }, dueDate: { not: null } },
    include: { hire: { include: { deliveryStake: true } } },
  });

  for (const p of fundedPhases) {
    const due = p.dueDate!;
    if (now < due) continue; // not due yet
    const graceDeadline = addBusinessDays(due, settings.workerGraceBusinessDays, holidays);

    if (now >= graceDeadline && p.reminderCount >= settings.reminderCap) {
      // Auto-cancel: roll the escrow back to the client.
      const res = await runPayment(
        {
          kind: "REFUND", operation: "refundToClient", signer: "RELAYER", amountInr: Number(p.amount),
          payerUserId: p.hire.clientId, payeeUserId: p.hire.clientId,
          fromAddress: escrowAddressLabel(), toAddress: await custodialAddressOf(p.hire.clientId),
          phaseId: p.id, hireId: p.hireId,
        },
        () => chain.refundToClient(p.id),
        {
          onConfirmedTx: async (tx, _payment, receipt) => {
            await tx.notification.createMany({
              data: [
                { userId: p.hire.clientId, type: "ESCROW", title: "Phase rolled back", body: `"${p.name}" wasn't delivered — the escrow was returned to you. Receipt ${receipt.receiptNo}.`, linkUrl: "/dashboard/client/payments" },
                { userId: p.hire.workerId, type: "SYSTEM", title: "Phase auto-cancelled", body: `You missed the delivery window on "${p.name}". The escrow was returned to the client and a strike was applied.` },
              ],
            });
            // The delivery stake is forfeited ON-CHAIN after this refund commits (afterConfirmed
            // below → forfeitDeliveryStake, its own receipted payment — payment plan P3.6).
            // Strike the worker; suspend past the threshold.
            const worker = await tx.user.update({ where: { id: p.hire.workerId }, data: { strikes: { increment: 1 } } });
            if (worker.strikes >= settings.workerStrikeSuspendThreshold && !worker.suspended) {
              await tx.user.update({ where: { id: worker.id }, data: { suspended: true } });
            }
          },
          afterConfirmed: async () => {
            await refreshBalanceCache(p.hire.clientId);
            const f = await forfeitDeliveryStake(p.hireId);
            if (f && !f.ok) res_.errors.push(`forfeitStake ${p.hireId}: ${f.code}`);
          },
        },
      );
      if (res.ok) res_.autoCancelled++;
      else res_.errors.push(`refundToClient ${p.id}: ${res.code}${res.pending ? " (pending)" : ""}`);
      continue;
    }

    // Escalating reminders to the worker while past due, under the cap.
    if (p.reminderCount < settings.reminderCap) {
      const dueAt = reminderDueAt(due, graceDeadline, p.reminderCount, settings.reminderCap);
      if (now >= dueAt) {
        await platformDb.$transaction([
          platformDb.phase.update({ where: { id: p.id }, data: { reminderCount: { increment: 1 } } }),
          platformDb.notification.create({ data: { userId: p.hire.workerId, type: "REMINDER", title: "Delivery overdue", body: `"${p.name}" is past its delivery date. Deliver or message the client — the phase auto-cancels if you go quiet.` } }),
        ]);
        res_.remindersSent++;
      }
    }
  }

  // ---- 3) Reconcile: finish stale payments, then repair DB↔chain drift ----
  try {
    const r = await reconcile(now);
    res_.reconciledPayments = r.paymentsFinalised;
    res_.repairedPhases = r.phasesRepaired;
    res_.errors.push(...r.errors);
  } catch (e) {
    res_.errors.push(`reconcile: ${(e as Error).message.slice(0, 120)}`);
  }

  return res_;
}
