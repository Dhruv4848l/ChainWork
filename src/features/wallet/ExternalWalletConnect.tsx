"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useConnection, useDisconnect, useSignMessage, useWatchAsset } from "wagmi";
import { Button } from "@/components/ui";
import { completeWalletLinkAction, moveToWalletAction, startWalletLinkAction, unlinkWalletAction } from "./actions";
import { WalletPicker } from "./web3/WalletPicker";
import { useEnsureChain } from "./web3/useEnsureChain";
import { useChainInfo } from "./web3/WalletProvider";
import { isUserRejection, walletErrorMessage } from "./web3/walletErrors";

/*
  AUTH-10 / WK-12 / CL-08 — the user's own wallet (payment plans P3.5 + P4).

  Connection is universal (P4): any EIP-6963 extension or WalletConnect, picked from a
  list; the right network is enforced (switch / add) before anything is signed; account
  and network changes in the wallet show up live, without a reload; wallet errors are
  explained in plain language.

  Linking stays the P3.5 flow: sign the SERVER-built Sign-In with Ethereum message, then
  type the one-time code sent to the phone / email on file; new payouts use the wallet
  after a 24-hour safety hold. Signing moves no funds and grants no spending access.
*/

type Step = "idle" | "starting" | "signing" | "code" | "linking";

const shorten = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const istWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) + " IST";
const same = (a?: string | null, b?: string | null) => Boolean(a && b && a.toLowerCase() === b.toLowerCase());

export function ExternalWalletConnect({
  linkedAddress,
  payoutActiveFrom,
  withdrawableInr = 0,
}: {
  linkedAddress: string | null;
  payoutActiveFrom?: string | null;
  /** Shown as the default "move to my wallet" amount (P3.3). */
  withdrawableInr?: number;
}) {
  const router = useRouter();
  const info = useChainInfo();
  const { address, isConnected, connector } = useConnection();
  const { disconnect } = useDisconnect();
  const { signMessageAsync } = useSignMessage();
  const { watchAssetAsync } = useWatchAsset();
  const { wrongNetwork, ensure, switching } = useEnsureChain();

  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<{ message: string; signature: string; sentTo: string; address: string } | null>(null);
  const [code, setCode] = useState("");
  const [unlinking, startUnlink] = useTransition();
  const [moveAmount, setMoveAmount] = useState(String(Math.floor(withdrawableInr)));
  const [moving, startMove] = useTransition();
  const [moveMsg, setMoveMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const explain = (e: unknown) => walletErrorMessage(e, { networkName: info.name });

  /** Sign the server-built SIWE message with the connected account, then ask for the code. */
  async function startLink() {
    if (!address) return;
    setError(null);
    setNotice(null);
    try {
      if (wrongNetwork) await ensure(); // P4.3: never sign on the wrong network
      setStep("starting");
      const start = await startWalletLinkAction(address, info.id);
      if (start.error || !start.siweMessage) {
        setError(start.error ?? "Couldn't start linking.");
        setStep("idle");
        return;
      }
      setStep("signing");
      const signature = await signMessageAsync({ account: address, message: start.siweMessage });
      setPending({ message: start.siweMessage, signature, sentTo: start.sentTo ?? "your phone", address });
      setStep("code");
    } catch (e) {
      setError(isUserRejection(e) ? "You cancelled the signature in your wallet. Nothing was linked." : explain(e));
      setStep("idle");
    }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    if (!pending) return;
    setStep("linking");
    const res = await completeWalletLinkAction(pending.message, pending.signature, code);
    if (res.error) {
      setError(res.error);
      setStep("code");
      return;
    }
    setPending(null);
    setCode("");
    setStep("idle");
    setNotice(res.message ?? "Wallet linked.");
    router.refresh();
  }

  async function addToken() {
    if (!info.token) return;
    setError(null);
    try {
      if (wrongNetwork) await ensure();
      await watchAssetAsync({ type: "ERC20", options: { address: info.token.address, symbol: info.token.symbol, decimals: info.token.decimals } });
      setNotice(`${info.token.symbol} added to your wallet's token list.`);
    } catch (e) {
      if (!isUserRejection(e)) setError(explain(e));
    }
  }

  // ---- shared pieces ------------------------------------------------------

  const networkBanner = isConnected && wrongNetwork && (
    <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ember/40 bg-ember/10 px-3.5 py-2.5 text-xs text-ember">
      <span>Wrong network — your wallet must be on {info.name} to sign.</span>
      <Button
        size="sm"
        variant="secondary"
        disabled={switching}
        onClick={() => ensure().catch((e) => setError(explain(e)))}
      >
        {switching ? "Switching…" : `Switch to ${info.name}`}
      </Button>
    </div>
  );

  const codeForm = (step === "code" || step === "linking") && (
    <form onSubmit={submitCode} className="mt-3 rounded-lg border border-line bg-card p-4">
      <div className="mb-1 text-[13px] font-semibold text-ink">Confirm it&apos;s you</div>
      <p className="mb-3 text-xs leading-relaxed text-ink3">
        Signature received for <span className="font-mono text-ink2">{pending ? shorten(pending.address) : ""}</span>. Enter the 6-digit
        code we sent to {pending?.sentTo}.
      </p>
      <div className="flex items-center gap-2">
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          aria-label="6-digit code"
          className="w-28 rounded-lg border border-line bg-card2 px-3 py-2 font-mono text-[15px] tracking-[0.3em] text-ink focus-visible:outline-2 focus-visible:outline-bronze"
        />
        <Button type="submit" size="sm" variant="primary" disabled={code.length !== 6 || step === "linking"}>
          {step === "linking" ? "Linking…" : "Link wallet"}
        </Button>
        <button type="button" onClick={() => { setPending(null); setStep("idle"); setError(null); }} className="text-xs text-ink3 hover:text-bronze">
          Cancel
        </button>
      </div>
    </form>
  );

  const connectedLine = isConnected && address && (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink2">
      <span>
        Connected: <span className="font-medium text-ink">{connector?.name ?? "wallet"}</span> ·{" "}
        {info.explorerUrl ? (
          <a href={`${info.explorerUrl}/address/${address}`} target="_blank" rel="noreferrer" className="font-mono hover:text-bronze">
            {shorten(address)} ↗
          </a>
        ) : (
          <span className="font-mono">{shorten(address)}</span>
        )}
      </span>
      {info.token && !wrongNetwork && (
        <button onClick={addToken} className="text-bronze hover:underline">
          Add {info.token.symbol} to wallet
        </button>
      )}
      <button onClick={() => disconnect()} className="text-ink3 hover:text-bronze">
        Disconnect
      </button>
    </div>
  );

  const messages = (
    <>
      {notice && <p className="mt-2 text-xs text-emerald">{notice}</p>}
      {error && <p className="mt-2 text-xs text-ember">{error}</p>}
    </>
  );

  // ---- linked ---------------------------------------------------------------

  if (linkedAddress) {
    const cooling = payoutActiveFrom && new Date(payoutActiveFrom) > new Date();
    const mismatch = isConnected && address && !same(address, linkedAddress);
    return (
      <div className={`rounded-xl border p-5 ${cooling ? "border-amber/40 bg-amber/[0.06]" : "border-emerald/35 bg-emerald/[0.06]"}`}>
        <div className={`mb-1 text-[13px] font-semibold ${cooling ? "text-amber" : "text-emerald"}`}>
          {cooling ? "⏳ External wallet linked — safety hold" : "✓ External wallet linked"}
        </div>
        <div className="text-xs leading-relaxed text-ink2">
          <span className="font-mono">{shorten(linkedAddress)}</span>{" "}
          {cooling
            ? `— new escrow payouts switch to this address on ${istWhen(payoutActiveFrom!)}. Until then they go to your ChainWork wallet.`
            : "— new escrow payouts settle to this address. Gas is still covered by the platform."}
        </div>

        {/* P4.4: live — reacts to account switches in the wallet without a reload. */}
        {mismatch && step === "idle" && (
          <div className="mt-3 rounded-lg border border-amber/40 bg-amber/10 px-3.5 py-2.5 text-xs text-amber">
            Your wallet is on <span className="font-mono">{shorten(address!)}</span>, not your linked payout wallet. Switch accounts in your
            wallet — or{" "}
            <button onClick={startLink} className="font-semibold underline">
              re-link to {shorten(address!)}
            </button>{" "}
            (a new link restarts the 24-hour hold).
          </div>
        )}
        {connectedLine}
        {!isConnected && (
          <details className="mt-3 text-xs text-ink2">
            <summary className="cursor-pointer text-bronze hover:underline">Connect it in this browser</summary>
            <p className="mb-2 mt-1.5 text-ink3">Optional — lets you add {info.token?.symbol ?? "the token"} to the wallet and spot an account mix-up.</p>
            <WalletPicker />
          </details>
        )}
        {networkBanner}
        {codeForm}
        {messages}

        {!cooling && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              startMove(async () => {
                const r = await moveToWalletAction(Number(moveAmount));
                setMoveMsg({ text: r.message ?? r.error ?? "", ok: !r.error });
                if (!r.error) router.refresh();
              });
            }}
            className="mt-3 flex flex-wrap items-center gap-2"
          >
            <label className="flex items-center rounded-lg border border-line bg-card2 pl-2.5 text-[13px] text-ink3 focus-within:border-bronze">
              ₹
              <input
                type="number"
                min={1}
                step="0.01"
                value={moveAmount}
                onChange={(e) => setMoveAmount(e.target.value)}
                aria-label="Amount to move to your wallet, in rupees"
                className="w-24 bg-transparent px-1.5 py-1.5 text-[13px] text-ink outline-none"
              />
            </label>
            <Button type="submit" size="sm" variant="secondary" disabled={moving || withdrawableInr <= 0}>
              {moving ? "Moving…" : "Move to my wallet"}
            </Button>
            <span className="text-[11px] text-ink3">from your ChainWork wallet</span>
            {moveMsg && <p className={`w-full text-xs ${moveMsg.ok ? "text-emerald" : "text-ember"}`}>{moveMsg.text}</p>}
          </form>
        )}
        <button
          onClick={() => startUnlink(async () => { await unlinkWalletAction(); router.refresh(); })}
          disabled={unlinking}
          className="mt-3 block text-xs text-ink3 hover:text-bronze"
        >
          {unlinking ? "Switching…" : "Switch back to the ChainWork custodial wallet"}
        </button>
      </div>
    );
  }

  // ---- not linked ----------------------------------------------------------

  return (
    <div className="rounded-xl border border-line bg-bg p-5">
      <div className="mb-1 text-[13px] font-semibold text-ink">Connect your own wallet</div>
      <p className="mb-3.5 text-xs leading-relaxed text-ink3">
        Self-custody, for advanced users. You&apos;ll sign a message (no funds move) and confirm with a code we text you. New payouts reach the
        wallet after a 24-hour safety hold.
      </p>
      {!isConnected ? (
        <WalletPicker />
      ) : (
        <>
          {connectedLine}
          {networkBanner}
          {step !== "code" && step !== "linking" && (
            <Button className="mt-3" size="sm" variant="primary" disabled={wrongNetwork || step !== "idle"} onClick={startLink}>
              {step === "starting" ? "Preparing…" : step === "signing" ? "Sign in your wallet…" : `Link ${address ? shorten(address) : "this wallet"} for payouts`}
            </Button>
          )}
          {codeForm}
        </>
      )}
      {messages}
    </div>
  );
}
