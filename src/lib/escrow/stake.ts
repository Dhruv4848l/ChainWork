import "server-only";
import { platformDb } from "@/lib/platformDb";
import * as chain from "@/lib/chain/escrow";
import { getPlatformSettings } from "@/lib/config/platformConfig";
import { runPayment, type PaymentOutcome } from "@/lib/payments/service";
import { custodialAddressOf, escrowAddressLabel, refreshBalanceCache } from "@/lib/payments/parties";
import { notify } from "@/lib/notify";
import { stakeAmountInr, stakeRequired, stakeState, type StakeState } from "./stakeRules";

/*
  The worker's delivery stake, on-chain (payment plan P3.6 / F5). Every movement goes
  through runPayment, so it is recorded before the chain call, receipted (success and
  failure) and reconciled like any payment:

    lock    — STAKE_LOCK, signed by the worker's custodial wallet, from their real balance
    refund  — STAKE_REFUND, when the hire completes (attestor)
    forfeit — STAKE_FORFEIT, to the client, when the worker ghosts a phase (attestor)

  The DeliveryStake row mirrors the on-chain stake and is only written in the same DB
  transaction that confirms the payment.
*/

export interface HireStake {
  state: StakeState;
  required: boolean;
  amountInr: number;
}

export async function hireStake(hire: { id: string; totalValue: unknown }): Promise<HireStake> {
  const [settings, recorded] = await Promise.all([
    getPlatformSettings(),
    platformDb.deliveryStake.findUnique({ where: { hireId: hire.id }, select: { status: true, amount: true } }),
  ]);
  const total = Number(hire.totalValue);
  const required = stakeRequired(total, settings.deliveryStakeThresholdInr);
  return {
    state: stakeState(required, recorded?.status ?? null),
    required,
    amountInr: recorded ? Number(recorded.amount) : stakeAmountInr(total, settings.deliveryStakePct),
  };
}

/** Worker locks the stake for a hire. Refuses if not required, already locked, or not theirs. */
export async function lockDeliveryStake(hireId: string, workerUserId: string): Promise<PaymentOutcome | { ok: false; reason: string; code: string }> {
  const hire = await platformDb.hire.findFirst({ where: { id: hireId, workerId: workerUserId } });
  if (!hire) return { ok: false, code: "NOT_FOUND", reason: "Hire not found." };
  const stake = await hireStake(hire);
  if (stake.state !== "AWAITING") return { ok: false, code: "NOT_NEEDED", reason: "No delivery stake is due for this hire." };

  const from = await custodialAddressOf(workerUserId);
  return runPayment(
    {
      kind: "STAKE_LOCK", operation: "lockStake", signer: "CUSTODIAL", amountInr: stake.amountInr,
      payerUserId: workerUserId, payeeUserId: workerUserId,
      fromAddress: from, toAddress: escrowAddressLabel(), hireId,
    },
    () => chain.lockStake(hireId, workerUserId, hire.clientId, stake.amountInr),
    {
      onConfirmedTx: async (tx, payment) => {
        await tx.deliveryStake.create({
          data: { hireId, amount: stake.amountInr, status: "LOCKED", onChainTxHash: payment.txHash },
        });
        await tx.notification.create({
          data: {
            userId: hire.clientId, type: "ESCROW", title: "Worker locked their delivery stake",
            body: `A ₹${stake.amountInr.toLocaleString("en-IN")} delivery stake is now held in escrow — you can fund phase 1.`,
            linkUrl: `/dashboard/client/hires/${hireId}`,
          },
        });
      },
      afterConfirmed: () => refreshBalanceCache(workerUserId),
    },
  );
}

/** Return a LOCKED stake to the worker (hire completed). No-op if there's none. */
export async function refundDeliveryStake(hireId: string): Promise<PaymentOutcome | null> {
  const hire = await platformDb.hire.findUnique({ where: { id: hireId }, include: { deliveryStake: true } });
  if (!hire?.deliveryStake || hire.deliveryStake.status !== "LOCKED") return null;
  const amountInr = Number(hire.deliveryStake.amount);
  return runPayment(
    {
      kind: "STAKE_REFUND", operation: "refundStake", signer: "RELAYER", amountInr,
      payerUserId: hire.workerId, payeeUserId: hire.workerId,
      fromAddress: escrowAddressLabel(), toAddress: await custodialAddressOf(hire.workerId), hireId,
    },
    () => chain.refundStake(hireId),
    {
      onConfirmedTx: async (tx) => {
        await tx.deliveryStake.updateMany({ where: { hireId, status: "LOCKED" }, data: { status: "REFUNDED", resolvedAt: new Date() } });
      },
      afterConfirmed: async (_p, receipt) => {
        await refreshBalanceCache(hire.workerId);
        await notify({
          userId: hire.workerId, type: "PAYMENT", title: "Delivery stake returned",
          body: `Your ₹${amountInr.toLocaleString("en-IN")} delivery stake was returned. Receipt ${receipt.receiptNo}.`,
          linkUrl: "/dashboard/worker/earnings",
        });
      },
    },
  );
}

/** Forfeit a LOCKED stake to the client (worker ghosted a phase). No-op if there's none. */
export async function forfeitDeliveryStake(hireId: string): Promise<PaymentOutcome | null> {
  const hire = await platformDb.hire.findUnique({ where: { id: hireId }, include: { deliveryStake: true } });
  if (!hire?.deliveryStake || hire.deliveryStake.status !== "LOCKED") return null;
  const amountInr = Number(hire.deliveryStake.amount);
  return runPayment(
    {
      kind: "STAKE_FORFEIT", operation: "forfeitStake", signer: "RELAYER", amountInr,
      payerUserId: hire.workerId, payeeUserId: hire.clientId,
      fromAddress: escrowAddressLabel(), toAddress: await custodialAddressOf(hire.clientId), hireId,
    },
    () => chain.forfeitStake(hireId),
    {
      onConfirmedTx: async (tx) => {
        await tx.deliveryStake.updateMany({ where: { hireId, status: "LOCKED" }, data: { status: "FORFEITED", resolvedAt: new Date() } });
      },
      afterConfirmed: async (_p, receipt) => {
        await refreshBalanceCache(hire.clientId);
        await notify({
          userId: hire.clientId, type: "PAYMENT", title: "Delivery stake paid to you",
          body: `The worker's ₹${amountInr.toLocaleString("en-IN")} delivery stake was forfeited to you. Receipt ${receipt.receiptNo}.`,
          linkUrl: "/dashboard/client/payments",
        });
      },
    },
  );
}
