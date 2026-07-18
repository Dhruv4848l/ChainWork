"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { sendMessageAction } from "./actions";

/* WK-13 composer. Sending is wired in Phase 12 (stub for now). */
export function MessageComposer() {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="border-t border-line px-6 py-3.5">
      <div className="flex gap-2.5">
        <input
          placeholder="Write a message…"
          className="flex-1 rounded-full border border-line-strong bg-bg px-4 py-3 text-[13.5px] text-ink placeholder:text-ink3 focus:border-bronze focus:outline-none"
        />
        <Button
          variant="primary"
          size="sm"
          disabled={pending}
          onClick={() => start(async () => setMsg((await sendMessageAction()).message ?? null))}
        >
          Send
        </Button>
      </div>
      <p className="mt-2 text-[10.5px] text-ink3">
        {msg ?? "Messages here may be used as evidence if this job is disputed."}
      </p>
    </div>
  );
}
