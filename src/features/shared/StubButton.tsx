"use client";

import { useState, useTransition } from "react";
import { Button, type ButtonProps } from "@/components/ui";

/*
  Generic stub-action button: runs a (bound) server action returning a
  { message?, error? } and shows the result inline. Used for Phase-7+ money/on-chain
  stubs — they never fake success, they report which phase wires them up.
*/
export function StubButton({
  label,
  run,
  variant = "primary",
  size,
  className,
}: {
  label: string;
  run: () => Promise<{ message?: string; error?: string }>;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className={className}>
      <Button
        variant={variant}
        size={size}
        disabled={pending}
        onClick={() => start(async () => { const r = await run(); setMsg(r.message ?? r.error ?? null); })}
      >
        {label}
      </Button>
      {msg && <p className="mt-1.5 text-xs text-ink3">{msg}</p>}
    </div>
  );
}
