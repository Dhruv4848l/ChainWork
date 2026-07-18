"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/*
  Near-real-time messaging, v1: poll. Every `intervalMs` we ask the router to
  re-fetch the server component, so a message the other party sent appears without
  a manual reload. Polling (not websockets) is a deliberate v1 choice — simple,
  stateless, and good enough at chat volume. Pauses while the tab is hidden.
*/
export function ThreadPoller({ intervalMs = 5000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => { if (!document.hidden) router.refresh(); };
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);
  return null;
}
