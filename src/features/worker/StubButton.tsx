"use client";

import { useState, useTransition } from "react";
import { Button, type ButtonProps } from "@/components/ui";
import type { ActionState } from "./actions";

/*
  A button that runs a (bound) server action and shows its returned message inline.
  Used for the Phase-7+ stubs (Mark Delivered, Withdraw, Check-in…) — they never
  fake success, they report which phase wires them up.
*/
export function StubButton({
  label,
  run,
  variant = "primary",
  size,
  className,
}: {
  label: string;
  run: () => Promise<ActionState>;
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
        onClick={() =>
          start(async () => {
            const r = await run();
            setMsg(r.message ?? r.error ?? null);
          })
        }
      >
        {label}
      </Button>
      {msg && <p className="mt-1.5 text-xs text-ink3">{msg}</p>}
    </div>
  );
}
