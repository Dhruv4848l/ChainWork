"use client";

import { ReactNode, useEffect } from "react";

/*
  Modal — a centered dialog over a dimmed, blurred backdrop.
  Closes on Escape or backdrop click. Locks body scroll while open.
  This is a client component because it uses effects and event handlers.

  Usage:
    const [open, setOpen] = useState(false);
    <Modal open={open} onClose={() => setOpen(false)} title="Confirm">
      …body…
    </Modal>
*/

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

export function Modal({ open, onClose, title, children }: ModalProps) {
  // Close on Escape + prevent the page behind from scrolling while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
    >
      {/* stopPropagation so clicking inside the panel doesn't close the modal */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-line bg-card p-6 shadow-2xl"
      >
        {title && (
          <h2 className="mb-4 font-display text-2xl text-ink">{title}</h2>
        )}
        {children}
      </div>
    </div>
  );
}
