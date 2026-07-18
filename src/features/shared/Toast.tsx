"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

/*
  App-wide toast system. `useToast()` returns a `toast(message, tone?)` fn; toasts
  auto-dismiss after 4s (or on click). Mounted once per dashboard shell via <ToastProvider>.
  Client components call it on a successful action for instant, non-blocking feedback —
  the durable record still lands in the notification center via the server `notify()` layer.
*/

type Tone = "success" | "error" | "info";
type Toast = { id: number; message: string; tone: Tone };

const ToastContext = createContext<(message: string, tone?: Tone) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

let seq = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback((message: string, tone: Tone = "success") => {
    const id = ++seq;
    setToasts((t) => [...t, { id, message, tone }]);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[100] flex w-[min(360px,calc(100vw-2.5rem))] flex-col gap-2">
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  const accent =
    toast.tone === "error" ? "border-ember/50 bg-ember/[0.10]" : toast.tone === "info" ? "border-line-strong bg-card" : "border-emerald/45 bg-emerald/[0.10]";
  const dot = toast.tone === "error" ? "bg-ember" : toast.tone === "info" ? "bg-bronze" : "bg-emerald";

  return (
    <button
      onClick={onDismiss}
      className={`pointer-events-auto flex w-full items-start gap-2.5 rounded-xl border px-4 py-3 text-left shadow-lg backdrop-blur-sm animate-[cwToastIn_0.22s_ease-out] ${accent}`}
    >
      <span className={`mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full ${dot}`} />
      <span className="text-[13px] leading-snug text-ink">{toast.message}</span>
    </button>
  );
}
