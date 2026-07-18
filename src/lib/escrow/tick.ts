import "server-only";
import { platformDb } from "@/lib/platformDb";
import { Prisma } from "@/generated/platform";
import { getPlatformSettings } from "@/lib/config/platformConfig";
import { addBusinessDays } from "@/lib/calendar/businessDays";
import * as chain from "@/lib/chain/escrow";
import { maybeCompleteHire } from "@/lib/hires";

/*
  The escrow timing engine (spec 13.2 + 13.4). Runs periodically (a cron route hits
  runEscrowTick). It:
   1) sends up to `reminderCap` reminders during a phase's verification window, then
      auto-releases to the worker once the window lapses and the reminders are spent;
   2) applies the symmetric worker-side rule — a funded phase past its due date with
      no delivery gets reminders, then auto-cancels (escrow rolled back to the client,
      delivery stake forfeited, a strike applied, suspension past a threshold).

  Every transition is guarded by the current status, so running the tick repeatedly
  never double-releases or double-reminds.
*/

export interface TickResult {
  remindersSent: number;
  autoReleased: number;
  autoCancelled: number;
  errors: string[];
}

/** When the i-th (0-based) reminder is due within [start, end], for `cap` reminders. */
function reminderDueAt(start: Date, end: Date, index: number, cap: number): Date {
  const span = end.getTime() - start.getTime();
  return new Date(start.getTime() + (span * (index + 1)) / (cap + 1));
}

export async function runEscrowTick(now: Date = new Date()): Promise<TickResult> {
  const res: TickResult = { remindersSent: 0, autoReleased: 0, autoCancelled: 0, errors: [] };
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
      try {
        const txHash = await chain.autoRelease(p.id);
        const workerBal = await chain.balanceOfInr((await chain.readEscrow(p.id)).worker);
        await platformDb.$transaction([
          platformDb.phase.update({ where: { id: p.id }, data: { status: "RELEASED", releasedAt: now } }),
          platformDb.escrowTransaction.create({ data: { phaseId: p.id, type: "RELEASE", status: "CONFIRMED", amount: p.amount, onChainTxHash: txHash } }),
          platformDb.wallet.updateMany({ where: { userId: p.hire.workerId }, data: { balanceCache: workerBal } }),
          platformDb.notification.create({ data: { userId: p.hire.workerId, type: "PAYMENT", title: "Payment auto-released", body: `The verification window on "${p.name}" lapsed — funds were released to you automatically.` } }),
          platformDb.notification.create({ data: { userId: p.hire.clientId, type: "ESCROW", title: "Phase auto-released", body: `"${p.name}" auto-released to the worker after the verification window closed.` } }),
        ]);
        await maybeCompleteHire(p.hireId); // last phase? → hire completes, reviews open
        res.autoReleased++;
      } catch (e) {
        res.errors.push(`autoRelease ${p.id}: ${(e as Error).message.slice(0, 120)}`);
      }
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
        res.remindersSent++;
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
      // Auto-cancel: roll the escrow back to the client on-chain.
      try {
        const txHash = await chain.refundToClient(p.id);
        const ops: Prisma.PrismaPromise<unknown>[] = [
          platformDb.phase.update({ where: { id: p.id }, data: { status: "AUTO_CANCELLED" } }),
          platformDb.escrowTransaction.create({ data: { phaseId: p.id, type: "REFUND", status: "CONFIRMED", amount: p.amount, onChainTxHash: txHash } }),
          platformDb.notification.create({ data: { userId: p.hire.clientId, type: "ESCROW", title: "Phase rolled back", body: `"${p.name}" wasn't delivered — the escrow was returned to you.` } }),
          platformDb.notification.create({ data: { userId: p.hire.workerId, type: "SYSTEM", title: "Phase auto-cancelled", body: `You missed the delivery window on "${p.name}". The escrow was returned to the client and a strike was applied.` } }),
        ];
        // Forfeit the delivery stake to the client if one was required for this hire.
        if (p.hire.deliveryStake && p.hire.deliveryStake.status === "LOCKED" && Number(p.hire.totalValue) >= settings.deliveryStakeThresholdInr) {
          ops.push(
            platformDb.deliveryStake.update({ where: { id: p.hire.deliveryStake.id }, data: { status: "FORFEITED", resolvedAt: now } }),
            platformDb.escrowTransaction.create({ data: { phaseId: p.id, type: "STAKE_FORFEIT", status: "CONFIRMED", amount: p.hire.deliveryStake.amount } })
          );
        }
        // Strike the worker; suspend past the threshold.
        const worker = await platformDb.user.findUnique({ where: { id: p.hire.workerId } });
        const newStrikes = (worker?.strikes ?? 0) + 1;
        ops.push(
          platformDb.user.update({
            where: { id: p.hire.workerId },
            data: { strikes: newStrikes, suspended: newStrikes >= settings.workerStrikeSuspendThreshold ? true : undefined },
          })
        );
        await platformDb.$transaction(ops);
        res.autoCancelled++;
      } catch (e) {
        res.errors.push(`refundToClient ${p.id}: ${(e as Error).message.slice(0, 120)}`);
      }
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
        res.remindersSent++;
      }
    }
  }

  return res;
}
