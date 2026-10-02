import "server-only";
import { Prisma, type PaymentQuote } from "@/generated/platform";
import { platformDb } from "@/lib/platformDb";
import { CHAIN_ID, ESCROW_ADDRESS } from "@/lib/chain/config";
import { payoutAddressFor } from "@/lib/chain/payout";
import { fundingBlocker, loadFundablePhase } from "@/lib/escrow/fundGates";
import { pricesInr } from "@/lib/portfolio/prices";
import { paymentMode } from "./mode";
import { escrowAsset, type AssetKey } from "./escrowAssets";
import { QUOTE_TTL_MS, assetAmountFor } from "./quoteMath";

/*
  QuoteService (payment plan P6.2). A quote holds a price for 5 minutes: "₹X of this phase
  = N units of asset A, paid to escrow for worker address W". Rates come from CoinGecko
  (60 s cache) or the fixed demo table; cwINR is ₹1 by definition. The amount is rounded up
  so the worker is never short; the server later accepts the on-chain payment only if it
  matches this quote (within 1 %).
*/

export interface QuoteView {
  id: string;
  phaseId: string;
  assetKey: AssetKey;
  assetSymbol: string;
  assetAddress: string | null;
  assetDecimals: number;
  chainId: number | null;
  rate: number;
  amountInr: number;
  assetAmount: string;
  workerAddress: string;
  escrowAddress: string | null;
  pricesStale: boolean;
  expiresAt: string;
  mode: string;
}

export function quoteView(q: PaymentQuote): QuoteView {
  return {
    id: q.id, phaseId: q.phaseId, assetKey: q.assetKey as AssetKey, assetSymbol: q.assetSymbol,
    assetAddress: q.assetAddress, assetDecimals: q.assetDecimals, chainId: q.chainId,
    rate: Number(q.rate), amountInr: Number(q.amountInr), assetAmount: q.assetAmount,
    workerAddress: q.workerAddress, escrowAddress: q.escrowAddress, pricesStale: q.pricesStale,
    expiresAt: q.expiresAt.toISOString(), mode: q.mode,
  };
}

export type QuoteResult = { ok: true; quote: QuoteView } | { ok: false; error: string };

export async function createQuote(phaseId: string, userId: string, assetKey: string): Promise<QuoteResult> {
  const asset = escrowAsset(assetKey);
  if (!asset) return { ok: false, error: "That currency isn't available." };
  const phase = await loadFundablePhase(phaseId);
  const blocker = await fundingBlocker(phase, userId);
  if (blocker || !phase) return { ok: false, error: blocker ?? "Phase not found." };

  // Crypto other than the rupee stablecoin can only go to a worker who'll receive it in their
  // OWN wallet: a ChainWork (custodial) wallet holds rupees, and couldn't pay out USDT / POL.
  const workerAddress = await payoutAddressFor(phase.hire.workerId);
  if (asset.key !== "cwINR") {
    const w = await platformDb.wallet.findUnique({ where: { userId: phase.hire.workerId }, select: { custodialAddress: true } });
    if (!w || w.custodialAddress.toLowerCase() === workerAddress.toLowerCase()) {
      return { ok: false, error: `${phase.hire.worker.name} is paid into their ChainWork wallet, which holds rupees — pay this phase in cwINR. Other currencies open once they link their own wallet.` };
    }
  }

  let rate = asset.fixedInr ?? 0;
  let stale = false;
  if (!asset.fixedInr) {
    const p = await pricesInr([asset.priceId!]);
    rate = p.prices[asset.priceId!] ?? 0;
    stale = p.stale;
  }
  if (!(rate > 0)) return { ok: false, error: `No price for ${asset.symbol} right now. Try again shortly.` };

  const amountInr = Number(phase.amount);
  const mode = paymentMode();
  const q = await platformDb.paymentQuote.create({
    data: {
      phaseId, userId, mode: mode === "demo" ? "DEMO" : mode === "testnet" ? "TESTNET" : "MAINNET",
      assetKey: asset.key, assetSymbol: asset.symbol, assetAddress: asset.address, assetDecimals: asset.decimals,
      chainId: mode === "demo" ? null : CHAIN_ID,
      rate: new Prisma.Decimal(rate), amountInr: new Prisma.Decimal(amountInr),
      assetAmount: assetAmountFor(amountInr, rate, asset.decimals).toString(),
      workerAddress,
      escrowAddress: mode === "demo" ? null : ESCROW_ADDRESS,
      pricesStale: stale,
      expiresAt: new Date(Date.now() + QUOTE_TTL_MS),
    },
  });
  return { ok: true, quote: quoteView(q) };
}

/** A quote of this user's, or null. */
export async function getQuote(id: string, userId: string): Promise<PaymentQuote | null> {
  const q = await platformDb.paymentQuote.findUnique({ where: { id } });
  return q && q.userId === userId ? q : null;
}
