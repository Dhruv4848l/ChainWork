"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { completeWalletLinkAction, moveToWalletAction, startWalletLinkAction, unlinkWalletAction } from "./actions";

/*
  AUTH-10 / WK-12 / CL-08 — link an external self-custody wallet as the payout address
  (payment plan P3.5). Three proofs, in order:
    1. connect the injected wallet (MetaMask / Coinbase extension),
    2. sign the SERVER-built Sign-In with Ethereum message (single-use, 10 minutes),
    3. type the one-time code sent to the phone / email on file.
  New payouts reach the wallet only after a 24-hour safety hold. Signing moves no funds
  and grants no spending access. Universal wallet support (EIP-6963 picker,
  WalletConnect) arrives in P4.
*/
type Step = "idle" | "connecting" | "signing" | "code" | "linking";
type Eth = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };

function shorten(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function istWhen(iso: string) {
  return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) + " IST";
}

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
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<{ message: string; signature: string; sentTo: string; address: string } | null>(null);
  const [code, setCode] = useState("");
  const [unlinking, startUnlink] = useTransition();
  const [moveAmount, setMoveAmount] = useState(String(Math.floor(withdrawableInr)));
  const [moving, startMove] = useTransition();
  const [moveMsg, setMoveMsg] = useState<{ text: string; ok: boolean } | null>(null);

  function fail(msg: string) {
    setError(msg);
    setStep("idle");
  }

  async function connectInjected() {
    setError(null);
    setNotice(null);
    const eth = (window as unknown as { ethereum?: Eth }).ethereum;
    if (!eth) return fail("No browser wallet found. Install MetaMask or the Coinbase Wallet extension.");
    try {
      setStep("connecting");
      const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      const address = accounts?.[0];
      if (!address) return fail("The wallet didn't share an account.");
      const chainId = parseInt((await eth.request({ method: "eth_chainId" })) as string, 16);

      const start = await startWalletLinkAction(address, chainId);
      if (start.error || !start.siweMessage) return fail(start.error ?? "Couldn't start linking.");

      setStep("signing");
      const signature = (await eth.request({ method: "personal_sign", params: [start.siweMessage, address] })) as string;
      setPending({ message: start.siweMessage, signature, sentTo: start.sentTo ?? "your phone", address });
      setStep("code");
    } catch (e) {
      const err = e as { code?: number; message?: string };
      fail(err.code === 4001 ? "You cancelled the request in your wallet." : err.message || "Connection cancelled.");
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

  if (linkedAddress) {
    const cooling = payoutActiveFrom && new Date(payoutActiveFrom) > new Date();
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
        {notice && <p className="mt-2 text-xs text-emerald">{notice}</p>}
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
          className="mt-3 text-xs text-ink3 hover:text-bronze"
        >
          {unlinking ? "Switching…" : "Switch back to the ChainWork custodial wallet"}
        </button>
      </div>
    );
  }

  if (step === "code" || step === "linking") {
    return (
      <form onSubmit={submitCode} className="rounded-xl border border-line bg-bg p-5">
        <div className="mb-1 text-[13px] font-semibold text-ink">Confirm it&apos;s you</div>
        <p className="mb-3 text-xs leading-relaxed text-ink3">
          Signature received for <span className="font-mono text-ink2">{pending ? shorten(pending.address) : ""}</span>. Enter the
          6-digit code we sent to {pending?.sentTo}.
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
        {error && <p className="mt-3 text-xs text-ember">{error}</p>}
      </form>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-bg p-5">
      <div className="mb-1 text-[13px] font-semibold text-ink">Connect your own wallet</div>
      <p className="mb-3.5 text-xs leading-relaxed text-ink3">
        Self-custody, for advanced users. You&apos;ll sign a message (no funds move) and confirm with a code we text you.
        New payouts reach the wallet after a 24-hour safety hold.
      </p>
      <div className="flex flex-col gap-2">
        <button
          onClick={connectInjected}
          disabled={step !== "idle"}
          className="flex items-center justify-between rounded-lg border border-line-strong px-4 py-3 text-[13.5px] font-medium text-ink hover:border-bronze"
        >
          <span>MetaMask / Coinbase (browser extension)</span>
          <span className="text-[11px] text-ink3">
            {step === "connecting" ? "connecting…" : step === "signing" ? "sign in wallet…" : "injected"}
          </span>
        </button>
        <button
          disabled
          className="flex cursor-not-allowed items-center justify-between rounded-lg border border-line px-4 py-3 text-[13.5px] font-medium text-ink3"
          title="Arrives with universal wallet support (payment plan P4)"
        >
          <span>WalletConnect</span>
          <span className="text-[11px]">coming soon</span>
        </button>
      </div>
      {notice && <p className="mt-3 text-xs text-emerald">{notice}</p>}
      {error && <p className="mt-3 text-xs text-ember">{error}</p>}
    </div>
  );
}
