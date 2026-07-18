"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { verifyAndLinkWalletAction, unlinkWalletAction } from "./actions";

/*
  AUTH-10 / WK-12 / CL-08 external wallet connect (self-custody path). Uses the
  injected provider (MetaMask / Coinbase extension) via window.ethereum + a
  sign-to-verify-ownership step. The signature proves control of the address — it
  moves no funds and grants no spending permission. Once linked, payouts settle to
  the external address. WalletConnect is offered but needs a projectId + wagmi
  config (a clearly-flagged follow-up); the injected path is fully wired.
*/
type Step = "idle" | "connecting" | "signing" | "error";

function shorten(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function ExternalWalletConnect({ linkedAddress }: { linkedAddress: string | null }) {
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [, startUnlink] = useTransition();

  async function connectInjected() {
    setError(null);
    const eth = (window as unknown as { ethereum?: { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum;
    if (!eth) {
      setError("No browser wallet found. Install MetaMask or the Coinbase Wallet extension.");
      setStep("error");
      return;
    }
    try {
      setStep("connecting");
      const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      const address = accounts?.[0];
      if (!address) throw new Error("No account returned.");

      setStep("signing");
      const message = `ChainWork — verify wallet ownership\nAddress: ${address}\nNonce: ${crypto.randomUUID()}\nAt: ${new Date().toISOString()}`;
      const signature = (await eth.request({ method: "personal_sign", params: [message, address] })) as string;

      const res = await verifyAndLinkWalletAction(address, message, signature);
      if (res.error) {
        setError(res.error);
        setStep("error");
        return;
      }
      window.location.reload(); // reflect the linked state
    } catch (e) {
      setError((e as Error).message || "Connection cancelled.");
      setStep("error");
    }
  }

  if (linkedAddress) {
    return (
      <div className="rounded-xl border border-emerald/35 bg-emerald/[0.06] p-5">
        <div className="mb-1 text-[13px] font-semibold text-emerald">✓ External wallet linked</div>
        <div className="text-xs leading-relaxed text-ink2">
          <span className="font-mono">{shorten(linkedAddress)}</span> — escrow releases and withdrawals
          now settle to this address. Gas is still covered by the platform.
        </div>
        <button
          onClick={() => startUnlink(() => unlinkWalletAction().then(() => window.location.reload()))}
          className="mt-3 text-xs text-ink3 hover:text-bronze"
        >
          Switch back to the ChainWork custodial wallet
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-bg p-5">
      <div className="mb-1 text-[13px] font-semibold text-ink">Connect your own wallet</div>
      <p className="mb-3.5 text-xs leading-relaxed text-ink3">
        Self-custody, for advanced users. Escrow works exactly the same — you just hold the keys,
        and payouts land at your address. Signing proves ownership; it moves no funds.
      </p>
      <div className="flex flex-col gap-2">
        <button
          onClick={connectInjected}
          disabled={step === "connecting" || step === "signing"}
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
          title="Needs a WalletConnect projectId + wagmi config"
        >
          <span>WalletConnect</span>
          <span className="text-[11px]">coming soon</span>
        </button>
      </div>
      {error && <p className="mt-3 text-xs text-ember">{error}</p>}
    </div>
  );
}
