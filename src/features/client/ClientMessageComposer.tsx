"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { useToast } from "@/features/shared/Toast";
import { sendMessageAction } from "./actions";

/* CL-09 composer — hire-scoped. Persists via the server action, then refreshes the thread. */
export function ClientMessageComposer({ hireId }: { hireId: string }) {
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();

  function send() {
    const text = body.trim();
    if (!text) return;
    start(async () => {
      const r = await sendMessageAction(hireId, text);
      if (r.error) return toast(r.error, "error");
      setBody("");
      router.refresh();
    });
  }

  return (
    <div className="border-t border-line px-6 py-3.5">
      <div className="flex gap-2.5">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Write a message…"
          className="flex-1 rounded-full border border-line-strong bg-bg px-4 py-3 text-[13.5px] text-ink placeholder:text-ink3 focus:border-bronze focus:outline-none"
        />
        <Button variant="primary" size="sm" disabled={pending || !body.trim()} onClick={send}>
          Send
        </Button>
      </div>
      <p className="mt-2 text-[10.5px] text-ink3">Messages here may be used as evidence if this job is disputed.</p>
    </div>
  );
}
