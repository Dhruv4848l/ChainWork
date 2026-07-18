"use client";

import { useState, useTransition } from "react";
import { Button, type ButtonProps } from "@/components/ui";
import type { AdminActionState } from "./actions";

/*
  Runs a (bound) admin server action and shows the result. Every admin action writes
  to the audit log server-side, so this is the standard way to render a privileged
  control. (ANALYST role never reaches screens that render these.)
*/
export function AdminActionButton({
  label,
  run,
  variant = "secondary",
  size = "sm",
  onDone,
}: {
  label: string;
  run: () => Promise<AdminActionState>;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  onDone?: () => void;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        variant={variant}
        size={size}
        disabled={pending}
        onClick={() => start(async () => { const r = await run(); setMsg(r.message ?? r.error ?? null); onDone?.(); })}
      >
        {label}
      </Button>
      {msg && <span className="text-[11px] text-ink3">{msg}</span>}
    </span>
  );
}
