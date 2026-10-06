import "server-only";
import { platformDb } from "@/lib/platformDb";
import * as chain from "@/lib/chain/escrow";
import type { EscrowStatus } from "@/lib/chain/escrowRules";
import type { PaymentTransaction, PhaseStatus } from "@/generated/platform";
import { confirmPayment, failPayment, initiatePayment } from "./service";
import { failureReason } from "./errors";
import { escrowAddressLabel } from "./parties";
import { FundingVerificationError, verifyPhaseFunding } from "@/lib/chain/verifyFunding";
import { TOKEN_ADDRESS } from "@/lib/chain/config";
import { toTokenUnits } from "@/lib/chain/viemAdapter";
import type { EscrowView } from "@/lib/chain/types";
import { formatAsset, meetsQuote } from "./quoteMath";
import { escrowAssets } from "./escrowAssets";
import { alertNewFlaggedPayment } from "@/lib/ops/alerts";
import type { PaymentAsset } from "./service";

/*
  THE RECONCILER (payment plan P1.6, fixes F7). Runs at the end of every cron tick.
  "The chain is the source of truth for money": the DB is repaired to follow it,
  never the other way round.

  1) Stale payments — INITIATED/SUBMITTED for longer than STALE_MS (the request that
     started them died, timed out, or the server restarted):
       - with a tx hash: look up the receipt → success = CONFIRMED (effects applied),
         reverted = FAILED; not found after DROP_MS = FAILED (dropped from the mempool);
       - without a hash (or demo mode): ask the escrow itself — if it's already in
         the state this payment would have produced, CONFIRM it; otherwise it never
         happened → FAILED.
  2) Phase drift — for live phases (checked in rotation), if the chain is AHEAD of
     the DB (released / refunded / funded / resolved on-chain but not in the DB),
     record the missing payment as reconciled and move the phase. When the DB is
     ahead of the chain (e.g. seed data that was never funded on-chain) nothing is
     touched: we only ever follow the chain.
*/

const STALE_MS = 2 * 60_000;
const DROP_MS = 30 * 60_000;
const BATCH = 25;

export interface ReconcileResult {
  paymentsFinalised: number;
  phasesRepaired: number;
  errors: string[];
}

/** The escrow status a confirmed payment of this kind leaves behind. */
const EXPECTED_ESCROW: Partial<Record<PaymentTransaction["kind"], readonly EscrowStatus[]>> = {
  // A fund shows as FUNDED — or anything later, if the phase moved on since.
  FUND: ["FUNDED", "DELIVERED", "RELEASED", "DISPUTED", "RESOLVED", "REFUNDED"],
  RELEASE: ["RELEASED"],
  REFUND: ["REFUNDED"],
  SPLIT: ["RESOLVED"],
};

async function reconcilePayment(p: PaymentTransaction, now: Date): Promise<boolean> {
  const age = now.getTime() - p.initiatedAt.getTime();

  if (p.txHash && p.mode !== "DEMO") {
    const receipt = await chain.adapter().txReceipt(p.txHash as `0x${string}`);
    if (receipt?.status === "success" && p.kind === "FUND" && p.signer === "EXTERNAL_WALLET") {
      // Paid from the payer's own wallet (P6): a successful tx isn't enough — it must match
      // the quote exactly as at submission time.
      const quote = p.quoteId ? await platformDb.paymentQuote.findUnique({ where: { id: p.quoteId } }) : null;
      try {
        if (!quote || !p.phaseId) throw new FundingVerificationError("NO_QUOTE", "This payment has no quote to check it against.");
        await verifyPhaseFunding({ txHash: p.txHash as `0x${string}`, phaseId: p.phaseId, workerAddress: quote.workerAddress, assetAddress: quote.assetAddress, assetAmount: quote.assetAmount });
      } catch (e) {
        if (e instanceof FundingVerificationError) {
          await failPayment(p.id, { code: e.code, reason: e.message, reconciled: true });
          return true;
        }
        throw e;
      }
      return Boolean(await confirmPayment(p.id, { txHash: p.txHash, ...receipt }, { reconciled: true }));
    }
    if (receipt?.status === "success") {
      return Boolean(await confirmPayment(p.id, { txHash: p.txHash, ...receipt }, { reconciled: true }));
    }
    if (receipt?.status === "reverted") {
      await failPayment(p.id, { code: "REVERTED", reason: failureReason("REVERTED"), reconciled: true });
      return true;
    }
    if (age < DROP_MS) return false; // still possibly pending — look again next tick
    await failPayment(p.id, {
      code: "TIMEOUT",
      reason: "The transaction was never confirmed by the network and has been dropped. No money was moved.",
      reconciled: true,
    });
    return true;
  }

  // No hash (never broadcast, or demo mode): ask the escrow what actually happened.
  const expected = EXPECTED_ESCROW[p.kind];
  if (p.phaseId && expected) {
    const onchain = await chain.readEscrow(p.phaseId);
    if (expected.includes(onchain.status)) {
      return Boolean(await confirmPayment(p.id, { txHash: p.txHash }, { reconciled: true }));
    }
  }
  await failPayment(p.id, {
    code: "UNKNOWN",
    reason: "This payment was interrupted before it completed. No money was moved.",
    reconciled: true,
  });
  return true;
}

/** What the chain status implies for a DB phase that has fallen behind. */
function repairFor(dbStatus: PhaseStatus, onchain: EscrowStatus): { kind: "FUND" | "RELEASE" | "REFUND" | "SPLIT"; operation: string } | null {
  if (onchain === "RELEASED" && dbStatus !== "RELEASED") return { kind: "RELEASE", operation: "reconciled:release" };
  // A slot refunded while the DB phase still awaits funding was a refused (flagged) funding
  // returned to its payer: the phase never had money, so there is nothing to repair.
  if (onchain === "REFUNDED" && dbStatus === "PENDING_FUNDING") return null;
  if (onchain === "REFUNDED" && dbStatus !== "AUTO_CANCELLED") return { kind: "REFUND", operation: "reconciled:refund" };
  if (onchain === "RESOLVED" && dbStatus !== "RESOLVED") return { kind: "SPLIT", operation: "reconciled:resolve" };
  if ((onchain === "FUNDED" || onchain === "DELIVERED") && dbStatus === "PENDING_FUNDING") return { kind: "FUND", operation: "reconciled:fund" };
  return null;
}

/** Is `address` one of this worker's own payout addresses (custodial or linked)? */
async function isWorkersAddress(workerId: string, address: string): Promise<boolean> {
  const w = await platformDb.wallet.findUnique({ where: { userId: workerId }, select: { custodialAddress: true, externalAddress: true } });
  const a = address.toLowerCase();
  return Boolean(w && (w.custodialAddress.toLowerCase() === a || w.externalAddress?.toLowerCase() === a));
}

const sameAddr = (a: string | null | undefined, b: string | null | undefined) => (a ?? "").toLowerCase() === (b ?? "").toLowerCase();
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

type Adoption =
  | { ok: true; signer: "RELAYER" | "EXTERNAL_WALLET"; asset: PaymentAsset | null }
  | { ok: false; reason: string };

/**
 * May a funding found on-chain (but missing from the DB) be adopted as this phase's FUND?
 * Only if it pays THIS worker the FULL amount owed: ≥ the phase's rupees in cwINR, or — for
 * any other asset — matches a quote issued for this phase (asset, worker, amount within
 * tolerance). Anything else (underpaid, wrong currency, wrong worker) is flagged, never
 * adopted: adopting it would mark a phase funded that isn't (P7 security regression).
 */
/** "15.26 USDT" — a raw on-chain amount in the asset's own units, readable for admins. */
function describeAmount(raw: bigint, asset: string): string {
  const a = sameAddr(asset, ZERO_ADDRESS) ? escrowAssets().find((x) => x.address === null) : escrowAssets().find((x) => sameAddr(x.address, asset));
  if (!a) return `${raw} units of token ${asset.slice(0, 6)}…${asset.slice(-4)}`;
  const shown = formatAsset(raw, a.decimals);
  return `${shown === "0" && raw > BigInt(0) ? "less than 0.000001" : shown} ${a.symbol}`;
}

async function adoptableFunding(phase: { id: string; amount: unknown; hire: { clientId: string; workerId: string } }, onchain: EscrowView): Promise<Adoption> {
  if (!(await isWorkersAddress(phase.hire.workerId, onchain.worker))) {
    return { ok: false, reason: `funded on-chain to unexpected worker ${onchain.worker}` };
  }
  const payerWallet = await platformDb.wallet.findUnique({ where: { userId: phase.hire.clientId }, select: { custodialAddress: true } });
  const fromCustodial = sameAddr(payerWallet?.custodialAddress, onchain.client);

  if (sameAddr(onchain.asset, TOKEN_ADDRESS)) {
    if (onchain.amountRaw < toTokenUnits(String(phase.amount))) {
      return { ok: false, reason: `paid ${describeAmount(onchain.amountRaw, onchain.asset)}, short of the ₹${Number(phase.amount).toLocaleString("en-IN")} phase` };
    }
    return { ok: true, signer: fromCustodial ? "RELAYER" : "EXTERNAL_WALLET", asset: null };
  }

  const assetAddress = sameAddr(onchain.asset, ZERO_ADDRESS) ? null : onchain.asset;
  const quotes = await platformDb.paymentQuote.findMany({ where: { phaseId: phase.id }, orderBy: { createdAt: "desc" } });
  const q = quotes.find(
    (x) => sameAddr(x.assetAddress, assetAddress) && sameAddr(x.workerAddress, onchain.worker) && meetsQuote(onchain.amountRaw, BigInt(x.assetAmount)),
  );
  if (!q) {
    const paid = describeAmount(onchain.amountRaw, onchain.asset);
    const sameAsset = quotes.filter((x) => sameAddr(x.assetAddress, assetAddress));
    if (!sameAsset.length) return { ok: false, reason: `paid ${paid} — a currency no quote for this phase asked for` };
    const latest = sameAsset[0];
    if (!sameAddr(latest.workerAddress, onchain.worker)) return { ok: false, reason: `paid ${paid} to a different worker address than quoted` };
    return { ok: false, reason: `paid ${paid}, short of the ${describeAmount(BigInt(latest.assetAmount), onchain.asset)} quoted` };
  }
  return {
    ok: true,
    signer: "EXTERNAL_WALLET",
    asset: { symbol: q.assetSymbol, address: q.assetAddress, chainId: q.chainId, amount: onchain.amountRaw.toString(), quoteId: q.id, rate: Number(q.rate) },
  };
}

const LIVE_PHASE_STATUSES: PhaseStatus[] = ["PENDING_FUNDING", "FUNDED", "IN_PROGRESS", "DELIVERED", "VERIFICATION_WINDOW_OPEN", "DISPUTED"];

async function repairPhaseDrift(now: Date, errors: string[]): Promise<number> {
  // Skip phases with a payment still in flight — the payment pass owns those.
  const phases = await platformDb.phase.findMany({
    where: {
      status: { in: LIVE_PHASE_STATUSES },
      payments: { none: { status: { in: ["INITIATED", "SUBMITTED"] } } },
    },
    include: { hire: true },
    orderBy: [{ lastReconciledAt: { sort: "asc", nulls: "first" } }],
    take: BATCH,
  });

  let repaired = 0;
  for (const phase of phases) {
    try {
      const onchain = await chain.readEscrow(phase.id);
      const fix = repairFor(phase.status, onchain.status);
      const adoption = fix?.kind === "FUND" ? await adoptableFunding(phase, onchain) : null;
      if (adoption && !adoption.ok) {
        // A tampered / short wallet payment sits in escrow. Never adopt it — flag it for an
        // admin (ADM-10 "Flagged wallet payments"). Re-seen every tick; a review closes it.
        const isNew = !(await platformDb.flaggedEscrow.findUnique({ where: { phaseId: phase.id }, select: { id: true } }));
        await platformDb.flaggedEscrow.upsert({
          where: { phaseId: phase.id },
          create: {
            phaseId: phase.id, reason: adoption.reason, onchainClient: onchain.client, onchainWorker: onchain.worker,
            asset: onchain.asset, amountRaw: onchain.amountRaw.toString(), detectedAt: now, lastSeenAt: now,
          },
          update: { reason: adoption.reason, onchainClient: onchain.client, onchainWorker: onchain.worker, asset: onchain.asset, amountRaw: onchain.amountRaw.toString(), lastSeenAt: now },
        });
        if (isNew) await alertNewFlaggedPayment({ phaseName: phase.name, reason: adoption.reason, amount: describeAmount(onchain.amountRaw, onchain.asset) });
        errors.push(`drift ${phase.id}: ${adoption.reason} — not adopted`);
      } else if (fix) {
        // A SPLIT's worker share can't be recovered from the escrow's final state, so a
        // repaired split records the movement without ledger shares (see memo).
        const toClient = fix.kind === "REFUND";
        const payment = await initiatePayment({
          kind: fix.kind,
          operation: fix.operation,
          signer: adoption?.ok ? adoption.signer : "RELAYER",
          amountInr: Number(phase.amount),
          asset: adoption?.ok ? adoption.asset : undefined,
          payerUserId: phase.hire.clientId,
          payeeUserId: toClient ? phase.hire.clientId : phase.hire.workerId,
          fromAddress: fix.kind === "FUND" ? onchain.client : escrowAddressLabel(),
          toAddress: fix.kind === "FUND" ? escrowAddressLabel() : toClient ? onchain.client : onchain.worker,
          splitWorkerBps: fix.kind === "SPLIT" ? null : undefined,
          phaseId: phase.id,
          hireId: phase.hireId,
        });
        await confirmPayment(payment.id, {}, { reconciled: true });
        console.warn(`[reconcile] phase ${phase.id}: DB ${phase.status} behind chain ${onchain.status} → recorded ${fix.kind}`);
        repaired++;
      }
    } catch (e) {
      errors.push(`drift ${phase.id}: ${(e as Error).message.slice(0, 100)}`);
    }
    await platformDb.phase.update({ where: { id: phase.id }, data: { lastReconciledAt: now } });
  }
  return repaired;
}

export async function reconcile(now: Date = new Date()): Promise<ReconcileResult> {
  const errors: string[] = [];
  let paymentsFinalised = 0;

  const stale = await platformDb.paymentTransaction.findMany({
    where: { status: { in: ["INITIATED", "SUBMITTED"] }, initiatedAt: { lt: new Date(now.getTime() - STALE_MS) } },
    orderBy: { initiatedAt: "asc" },
    take: BATCH,
  });
  for (const p of stale) {
    try {
      if (await reconcilePayment(p, now)) paymentsFinalised++;
    } catch (e) {
      errors.push(`payment ${p.id}: ${(e as Error).message.slice(0, 100)}`);
    }
  }

  const phasesRepaired = await repairPhaseDrift(now, errors);
  return { paymentsFinalised, phasesRepaired, errors };
}
