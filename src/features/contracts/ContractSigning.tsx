"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, StatusBadge } from "@/components/ui";
import { signContractAction } from "./actions";

/*
  The signing ceremony, shared by both sides.

  A "digital signature" here is: the party reads the generated document, ticks that
  they've read it, and types their full legal name exactly as it appears on their
  verified account. The server checks the name against the account, stamps the time
  and the network address, and binds all of it to a SHA-256 hash of the document
  text. The hash is what makes it more than decoration — recompute it and any change
  to the terms shows up.
*/

export interface SignatureRecord {
  name: string;
  signature: string | null;
  signedAt: string | null;
  ip: string | null;
  isYou: boolean;
  roleLabel: string;
}

export function ContractSigning({
  hireId,
  documentText,
  documentHash,
  intact,
  signatures,
  youSigned,
  bothSigned,
  yourName,
  nextHref,
}: {
  hireId: string;
  documentText: string;
  documentHash: string;
  intact: boolean;
  signatures: SignatureRecord[];
  youSigned: boolean;
  bothSigned: boolean;
  yourName: string;
  nextHref: string;
}) {
  const [typed, setTyped] = useState("");
  const [read, setRead] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function sign() {
    setErr(null);
    setMsg(null);
    start(async () => {
      const res = await signContractAction(hireId, typed);
      if (res.error) setErr(res.error);
      else {
        setMsg(res.message ?? "Signed.");
        router.refresh();
      }
    });
  }

  return (
    <div className="grid max-w-5xl gap-3.5 lg:grid-cols-[1.6fr_1fr]">
      {/* The document */}
      <div className="rounded-2xl border border-line bg-card p-6">
        <div className="mb-3.5 flex items-center justify-between gap-3">
          <h3 className="m-0 text-[15px] font-semibold text-ink">Contract document</h3>
          <StatusBadge tone={bothSigned ? "success" : "warning"}>
            {bothSigned ? "Fully executed" : "Awaiting signatures"}
          </StatusBadge>
        </div>
        <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap rounded-xl border border-hair bg-bg p-5 font-sans text-[12.5px] leading-relaxed text-ink2">
          {documentText}
        </pre>
        <div className="mt-3.5 flex flex-wrap items-center gap-2 text-[11px] text-ink3">
          <span className="font-semibold uppercase tracking-wider">SHA-256</span>
          <code className="break-all font-mono text-[10.5px] text-[#8FC7E8]">{documentHash}</code>
        </div>
        {!intact && (
          <p className="mt-2.5 rounded-lg border border-ember/40 bg-ember/10 px-3 py-2 text-xs text-ember">
            This document no longer matches the hash recorded at signing. Both parties must
            review and re-sign before escrow can move.
          </p>
        )}
      </div>

      {/* Signature panel */}
      <div className="flex flex-col gap-3.5">
        <div className="rounded-2xl border border-line bg-card p-6">
          <h3 className="mb-3.5 text-[15px] font-semibold text-ink">Signatures</h3>
          {signatures.map((s) => (
            <div key={s.roleLabel} className="mb-3.5 border-b border-hair pb-3.5 last:mb-0 last:border-b-0 last:pb-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10.5px] font-semibold uppercase tracking-wider text-ink3">
                  {s.roleLabel}
                  {s.isYou ? " (you)" : ""}
                </span>
                <StatusBadge tone={s.signature ? "success" : "draft"}>
                  {s.signature ? "Signed" : "Pending"}
                </StatusBadge>
              </div>
              {s.signature ? (
                <>
                  <div className="mt-1.5 font-display text-2xl text-bronze">{s.signature}</div>
                  <div className="mt-1 text-[11px] text-ink3">
                    {s.signedAt} · from {s.ip}
                  </div>
                </>
              ) : (
                <div className="mt-1.5 text-[13px] text-ink3">{s.name} — not yet signed</div>
              )}
            </div>
          ))}
        </div>

        {!youSigned && (
          <div className="rounded-2xl border border-bronze/40 bg-card p-6">
            <h3 className="mb-1.5 text-[15px] font-semibold text-ink">Sign this contract</h3>
            <p className="mb-3.5 text-xs leading-relaxed text-ink2">
              Type your full name exactly as on your account. Your signature is recorded with a
              timestamp and bound to the document hash above.
            </p>
            <label className="mb-3 flex cursor-pointer items-start gap-2.5 text-[12.5px] text-ink2">
              <input
                type="checkbox"
                className="mt-0.5 accent-bronze"
                checked={read}
                onChange={(e) => setRead(e.target.checked)}
              />
              <span>I have read the contract in full and agree to be bound by it.</span>
            </label>
            <input
              aria-label="Type your full name to sign"
              className="w-full rounded-[10px] border border-line-strong bg-bg px-4 py-3 font-display text-xl text-bronze placeholder:font-sans placeholder:text-sm placeholder:text-ink3 focus:border-bronze focus:outline-none focus:ring-2 focus:ring-bronze"
              placeholder={`Type "${yourName}" to sign`}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
            {err && (
              <p className="mt-3 rounded-lg border border-ember/40 bg-ember/10 px-3 py-2 text-xs text-ember">
                {err}
              </p>
            )}
            <Button
              variant="primary"
              className="mt-3.5 w-full"
              disabled={pending || !read || !typed.trim()}
              onClick={sign}
            >
              {pending ? "Recording signature…" : "Sign contract"}
            </Button>
          </div>
        )}

        {youSigned && (
          <div className="rounded-2xl border border-line bg-card p-6">
            <p className="text-[13px] leading-relaxed text-ink2">
              {bothSigned
                ? "Both signatures are recorded. Phase 1 escrow can now be funded — nothing before that point moves money."
                : "Your signature is recorded. Escrow stays locked until the other party signs."}
            </p>
            {msg && <p className="mt-2 text-xs text-emerald">{msg}</p>}
            <a
              href={nextHref}
              className="mt-3.5 block rounded-full border border-line-strong px-4 py-3 text-center text-[13px] font-medium text-ink hover:border-bronze"
            >
              Go to the hire
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
