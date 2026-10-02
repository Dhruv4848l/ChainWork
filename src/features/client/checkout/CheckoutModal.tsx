"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { erc20Abi, zeroAddress } from "viem";
import { useBalance, useConfig, useConnection, useReadContract } from "wagmi";
import { readContract, signTypedData, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { Button, Modal } from "@/components/ui";
import { formatInr } from "@/lib/format";
import { keyFor } from "@/lib/chain/keys";
import { formatAsset } from "@/lib/payments/quoteMath";
import { demoAuthTypedData } from "@/lib/payments/demoAuth";
import type { QuoteView } from "@/lib/payments/quotes";
import { PaymentTracker } from "@/features/shared/PaymentTracker";
import { AddFundsForm } from "@/features/wallet/AddFundsForm";
import { WalletPicker } from "@/features/wallet/web3/WalletPicker";
import { useChainInfo } from "@/features/wallet/web3/WalletProvider";
import { useEnsureChain } from "@/features/wallet/web3/useEnsureChain";
import { isUserRejection, walletErrorMessage } from "@/features/wallet/web3/walletErrors";
import { fundPhaseAction } from "../actions";
import {
  authorizeDemoPaymentAction,
  checkoutContextAction,
  createQuoteAction,
  submitWalletFundingAction,
  type CheckoutAssetView,
  type CheckoutContext,
  type CheckoutResult,
} from "../checkoutActions";
import { AddressCard } from "./AddressCard";

/*
  The payment window (payment plan P6.7). Opened from "Fund Phase":

    1. what's due, in which currency (with what you hold), paid to whom (worker payout
       address + QR) through which escrow contract;
    2. ChainWork wallet + cwINR → fundPhaseAction, as before (₹1 = 1 cwINR, no quote);
       your own wallet → a 5-minute quote, then
         testnet: approve (tokens) + fundPhaseWith / fundPhaseNative from the wallet; the
                  server verifies the mined PhaseFunded event against the quote;
         demo:    an EIP-712 signature (no gas, nothing on-chain) and demo credit moves;
    3. live status → receipt.

  The browser never decides whether a payment counted — the server's verification does.
*/

// The two escrow functions a payer's wallet calls (v2 ABI, typed for wagmi).
const escrowPayAbi = [
  { type: "function", name: "fundPhaseWith", stateMutability: "nonpayable", inputs: [{ name: "phaseId", type: "bytes32" }, { name: "worker", type: "address" }, { name: "asset", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] },
  { type: "function", name: "fundPhaseNative", stateMutability: "payable", inputs: [{ name: "phaseId", type: "bytes32" }, { name: "worker", type: "address" }], outputs: [] },
] as const;

type Source = "chainwork" | "wallet";
type Outcome = CheckoutResult & { message?: string; shortfallInr?: number };

export function CheckoutModal({ phaseId, open, onClose }: { phaseId: string; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [ctx, setCtx] = useState<CheckoutContext | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [assetKey, setAssetKey] = useState("cwINR");
  const [source, setSource] = useState<Source>("chainwork");
  const [quote, setQuote] = useState<QuoteView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Outcome | null>(null);

  const load = useCallback(() => {
    checkoutContextAction(phaseId).then((r) => (r.ok ? setCtx(r.ctx) : setLoadError(r.error)));
  }, [phaseId]);

  // Mounted fresh each time the window opens (see ClientPhaseControls), so state starts clean.
  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const close = useCallback(() => {
    if (busy) return; // never abandon a payment mid-flight
    if (result?.ok || result?.pending) router.refresh();
    onClose();
  }, [busy, result, router, onClose]);

  const asset = ctx?.assets.find((a) => a.key === assetKey) ?? null;
  const viaWallet = source === "wallet" || (asset != null && !asset.custodialPayable);

  function choose(a: CheckoutAssetView) {
    if (a.unavailable) return;
    setAssetKey(a.key);
    setQuote(null);
    setError(null);
    if (!a.custodialPayable) setSource("wallet");
  }

  return (
    <Modal open={open} onClose={close} title="Fund this phase" size="lg">
      {loadError && <p className="text-sm text-ember">{loadError}</p>}
      {!ctx && !loadError && <p className="text-sm text-ink3">Loading the payment details…</p>}
      {ctx && result ? (
        <ResultPanel ctx={ctx} result={result} onDone={close} onRetry={() => { setResult(null); setQuote(null); }} />
      ) : ctx && asset ? (
        <div className="flex flex-col gap-5">
          <Summary ctx={ctx} />

          <section aria-label="Currency">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink3">Pay in</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {ctx.assets.map((a) => (
                <AssetOption key={a.key} a={a} ctx={ctx} selected={a.key === assetKey} onSelect={() => choose(a)} />
              ))}
            </div>
            {ctx.assets.some((a) => a.unavailable) && (
              <p className="mt-2 text-xs text-ink3">{ctx.assets.find((a) => a.unavailable)!.unavailable}</p>
            )}
          </section>

          {asset.custodialPayable && (
            <section aria-label="Pay from">
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink3">Pay from</h3>
              <div className="flex flex-wrap gap-2" role="radiogroup">
                {(["chainwork", "wallet"] as const).map((s) => (
                  <button
                    key={s}
                    role="radio"
                    aria-checked={source === s}
                    onClick={() => { setSource(s); setQuote(null); setError(null); }}
                    className={`rounded-lg border px-3 py-2 text-[13px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-bronze ${
                      source === s ? "border-bronze bg-bronze/10 text-ink" : "border-line text-ink2 hover:border-line-strong"
                    }`}
                  >
                    {s === "chainwork" ? `ChainWork wallet · ${formatInr(ctx.chainworkWallet.spendableInr)}` : "My own wallet"}
                  </button>
                ))}
              </div>
            </section>
          )}

          <AddressCard
            label={`Released to ${ctx.workerName}`}
            address={ctx.workerAddress}
            note={ctx.workerPaidToOwnWallet ? "Their own linked wallet." : "Their ChainWork wallet."}
            escrowAddress={ctx.escrowAddress}
          />

          {viaWallet ? (
            <WalletPay
              ctx={ctx}
              asset={asset}
              quote={quote}
              setQuote={setQuote}
              busy={busy}
              setBusy={setBusy}
              error={error}
              setError={setError}
              onResult={setResult}
            />
          ) : (
            <ChainworkPay ctx={ctx} busy={busy} setBusy={setBusy} onResult={setResult} onToppedUp={load} />
          )}
        </div>
      ) : null}
    </Modal>
  );
}

function Summary({ ctx }: { ctx: CheckoutContext }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-line bg-card2 px-4 py-3">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-ink3">Amount due</div>
        <div className="font-display text-3xl text-ink">{formatInr(ctx.amountInr)}</div>
        <div className="text-xs text-ink2">{ctx.phaseName} · held in escrow until you approve the work</div>
      </div>
      <span
        className={`rounded-md px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider ${
          ctx.mode === "demo" ? "bg-amber/20 text-amber" : "bg-bronze/20 text-bronze"
        }`}
      >
        {ctx.mode === "demo" ? "Demo money" : ctx.mode === "testnet" ? "Test network" : "Live"}
      </span>
    </div>
  );
}

function AssetOption({ a, ctx, selected, onSelect }: { a: CheckoutAssetView; ctx: CheckoutContext; selected: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      disabled={!!a.unavailable}
      aria-pressed={selected}
      className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-bronze disabled:cursor-not-allowed disabled:opacity-45 ${
        selected ? "border-bronze bg-bronze/10" : "border-line hover:border-line-strong"
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={a.icon} alt="" width={28} height={28} className="shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-medium text-ink">{a.symbol}</span>
        <span className="block truncate text-[11.5px] text-ink3">{a.name}</span>
      </span>
      <span className="text-right text-[11.5px] text-ink2">
        {a.key === "cwINR" && <span className="block">CW {formatInr(ctx.chainworkWallet.spendableInr)}</span>}
        {ctx.mode !== "demo" && <WalletHolding a={a} />}
      </span>
    </button>
  );
}

/** What the connected wallet holds of this asset (testnet / mainnet only). */
function WalletHolding({ a }: { a: CheckoutAssetView }) {
  const info = useChainInfo();
  const { address, isConnected } = useConnection();
  const native = useBalance({ address, chainId: info.id, query: { enabled: isConnected && !a.address } });
  const token = useReadContract({
    address: (a.address ?? zeroAddress) as `0x${string}`,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address ?? zeroAddress],
    chainId: info.id,
    query: { enabled: isConnected && !!a.address },
  });
  if (!isConnected) return null;
  const raw = a.address ? token.data : native.data?.value;
  if (raw == null) return null;
  return <span className="block">Wallet {formatAsset(raw, a.decimals, 4)}</span>;
}

function ChainworkPay({
  ctx, busy, setBusy, onResult, onToppedUp,
}: { ctx: CheckoutContext; busy: string | null; setBusy: (s: string | null) => void; onResult: (r: Outcome) => void; onToppedUp: () => void }) {
  const short = ctx.chainworkWallet.spendableInr < ctx.amountInr;
  async function pay() {
    setBusy("Locking the money in escrow…");
    try {
      const r = await fundPhaseAction(ctx.phaseId);
      onResult({ ...r, ok: !r.error && !r.pending });
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="flex flex-col gap-3">
      {short && (
        <div className="rounded-lg border border-amber/40 bg-amber/10 p-3">
          <AddFundsForm
            defaultAmount={Math.ceil(ctx.amountInr - ctx.chainworkWallet.spendableInr)}
            label="Add funds"
            onAdded={onToppedUp}
            hint={`Your ChainWork wallet is ${formatInr(ctx.amountInr - ctx.chainworkWallet.spendableInr)} short. Add funds, or pay from your own wallet.`}
          />
        </div>
      )}
      <Button variant="primary" disabled={!!busy || short} onClick={pay}>
        {busy ?? `Pay ${formatInr(ctx.amountInr)} from ChainWork wallet`}
      </Button>
    </div>
  );
}

function useCountdown(expiresAt: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [expiresAt]);
  if (!expiresAt) return { left: 0, label: "" };
  const left = Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000));
  return { left, label: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` };
}

function WalletPay({
  ctx, asset, quote, setQuote, busy, setBusy, error, setError, onResult,
}: {
  ctx: CheckoutContext;
  asset: CheckoutAssetView;
  quote: QuoteView | null;
  setQuote: (q: QuoteView | null) => void;
  busy: string | null;
  setBusy: (s: string | null) => void;
  error: string | null;
  setError: (s: string | null) => void;
  onResult: (r: Outcome) => void;
}) {
  const info = useChainInfo();
  const config = useConfig();
  const { address, isConnected } = useConnection();
  const { wrongNetwork, ensure, switching, targetName } = useEnsureChain();
  const { left, label } = useCountdown(quote?.expiresAt ?? null);
  const expired = !!quote && left === 0;

  async function getQuote() {
    setError(null);
    setBusy("Getting a price…");
    try {
      const r = await createQuoteAction(ctx.phaseId, asset.key);
      if (r.quote) setQuote(r.quote);
      else setError(r.error ?? "Couldn't get a price.");
    } finally {
      setBusy(null);
    }
  }

  async function pay() {
    if (!quote || !address) return;
    setError(null);
    try {
      await ensure();
      if (ctx.mode === "demo") {
        setBusy("Approve the request in your wallet (a signature — no fee, nothing leaves your wallet)…");
        const signature = await signTypedData(config, { account: address, ...demoAuthTypedData(quote, info.id) });
        setBusy("Checking your authorisation…");
        onResult(await authorizeDemoPaymentAction(quote.id, address, signature));
        return;
      }

      const escrow = quote.escrowAddress as `0x${string}`;
      const amount = BigInt(quote.assetAmount);
      const phaseKey = keyFor(quote.phaseId);
      const worker = quote.workerAddress as `0x${string}`;
      let hash: `0x${string}`;
      if (quote.assetAddress) {
        const token = quote.assetAddress as `0x${string}`;
        const allowance = await readContract(config, { address: token, abi: erc20Abi, functionName: "allowance", args: [address, escrow], chainId: info.id });
        if (allowance < amount) {
          setBusy(`Step 1 of 2 — allow the escrow to take ${formatAsset(amount, quote.assetDecimals)} ${quote.assetSymbol} (approve in your wallet)…`);
          const approval = await writeContract(config, { address: token, abi: erc20Abi, functionName: "approve", args: [escrow, amount], chainId: info.id });
          setBusy("Waiting for the approval to confirm…");
          await waitForTransactionReceipt(config, { hash: approval, chainId: info.id });
        }
        setBusy(`${allowance < amount ? "Step 2 of 2 — " : ""}send ${formatAsset(amount, quote.assetDecimals)} ${quote.assetSymbol} into escrow (confirm in your wallet)…`);
        hash = await writeContract(config, { address: escrow, abi: escrowPayAbi, functionName: "fundPhaseWith", args: [phaseKey, worker, token, amount], chainId: info.id });
      } else {
        setBusy(`Send ${formatAsset(amount, quote.assetDecimals)} ${quote.assetSymbol} into escrow (confirm in your wallet)…`);
        hash = await writeContract(config, { address: escrow, abi: escrowPayAbi, functionName: "fundPhaseNative", args: [phaseKey, worker], value: amount, chainId: info.id });
      }
      setBusy("Sent — verifying the payment on-chain…");
      onResult(await submitWalletFundingAction(quote.id, hash));
    } catch (e) {
      setError(isUserRejection(e) ? "You cancelled in your wallet. Nothing was paid." : walletErrorMessage(e, { networkName: targetName }));
    } finally {
      setBusy(null);
    }
  }

  if (!isConnected) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-[13px] text-ink2">Connect the wallet you want to pay from.</p>
        <WalletPicker />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-ink3">
        Paying from <span className="font-mono text-ink2">{address?.slice(0, 6)}…{address?.slice(-4)}</span>
        {ctx.mode === "demo" && " — in demo mode you sign an authorisation; demo credit is used, no real coins move."}
      </p>
      {wrongNetwork && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber/40 bg-amber/10 px-3 py-2 text-[13px] text-ink2">
          Your wallet is on another network.
          <Button size="sm" variant="secondary" disabled={switching} onClick={() => ensure().catch((e) => setError(walletErrorMessage(e, { networkName: targetName })))}>
            Switch to {targetName}
          </Button>
        </div>
      )}

      {quote && (
        <div className="rounded-xl border border-line bg-card2 px-4 py-3" aria-live="polite">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-ink3">You pay</div>
              <div className="font-display text-2xl text-ink">
                {formatAsset(BigInt(quote.assetAmount), quote.assetDecimals)} {quote.assetSymbol}
              </div>
            </div>
            <div className={`text-right text-xs ${expired ? "text-ember" : left < 60 ? "text-amber" : "text-ink2"}`}>
              {expired ? "Price expired" : <>Price held for <span className="font-mono">{label}</span></>}
            </div>
          </div>
          <div className="mt-1 text-xs text-ink3">
            {quote.assetSymbol === "cwINR" ? "₹1 = 1 cwINR" : `₹${quote.rate.toLocaleString("en-IN", { maximumFractionDigits: 2 })} per ${quote.assetSymbol}`}
            {quote.pricesStale && " · last known price (live feed unavailable)"} · up to 1% under the quote is still accepted
          </div>
        </div>
      )}

      {error && <p className="text-[13px] text-ember" role="alert">{error}</p>}

      {!quote || expired ? (
        <Button variant="primary" disabled={!!busy} onClick={getQuote}>
          {busy ?? (expired ? "Get a fresh price" : `Get the price in ${asset.symbol}`)}
        </Button>
      ) : (
        <Button variant="primary" disabled={!!busy || wrongNetwork} onClick={pay}>
          {busy ?? (ctx.mode === "demo" ? `Authorise ${formatAsset(BigInt(quote.assetAmount), quote.assetDecimals)} ${quote.assetSymbol}` : `Pay ${formatAsset(BigInt(quote.assetAmount), quote.assetDecimals)} ${quote.assetSymbol}`)}
        </Button>
      )}
      {busy && <p className="text-xs text-ink3">Keep this window open until it finishes.</p>}
    </div>
  );
}

function ResultPanel({ ctx, result, onDone, onRetry }: { ctx: CheckoutContext; result: Outcome; onDone: () => void; onRetry: () => void }) {
  const receipt = result.receiptNo && (
    <a href={`/api/receipts/${result.receiptNo}/pdf`} className="font-medium text-bronze hover:underline">
      Download receipt {result.receiptNo}
    </a>
  );
  if (result.pending && result.paymentId) {
    return (
      <div className="flex flex-col gap-3 text-[13.5px] text-ink2">
        <p>Your payment was sent and is waiting for the network to confirm it. You can close this window — it keeps going, and the phase updates by itself.</p>
        <PaymentTracker paymentId={result.paymentId} />
        <Button variant="secondary" onClick={onDone}>Close</Button>
      </div>
    );
  }
  if (result.ok) {
    return (
      <div className="flex flex-col gap-3 text-[13.5px] text-ink2">
        <p className="font-display text-2xl text-emerald">Escrow funded</p>
        <p>
          {formatInr(ctx.amountInr)} for “{ctx.phaseName}” is locked in escrow. {ctx.workerName} has been told to start; the money is
          released to them when you approve the work.
        </p>
        {receipt}
        <Button variant="primary" onClick={onDone}>Done</Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3 text-[13.5px] text-ink2">
      <p className="font-medium text-ember">The payment didn’t go through.</p>
      <p>{result.error ?? result.message}</p>
      {receipt}
      <div className="flex gap-2">
        <Button variant="primary" onClick={onRetry}>Try again</Button>
        <Button variant="secondary" onClick={onDone}>Close</Button>
      </div>
    </div>
  );
}
