import { HTMLAttributes } from "react";

/*
  StatusBadge — the small pill that labels the state of a job, application, phase, etc.
  The five tones map onto the design system's status legend:

    draft   -> neutral   (Draft, Withdrawn, Expired)
    info    -> bronze    (In Progress, Under Review, Applied)
    warning -> amber     (Verification Window, Pending, Verified tier)
    success -> emerald   (Released, Paid, Accepted, Completed)
    danger  -> ember     (Disputed, Rejected, Auto-Cancelled, No-Show)

  Each phase/application status in later phases picks one of these tones so colour
  meaning stays consistent everywhere. Usage: <StatusBadge tone="success">Released</StatusBadge>
*/

type Tone = "draft" | "info" | "warning" | "success" | "danger";

const tones: Record<Tone, string> = {
  draft: "text-ink3 border-line-strong bg-transparent",
  info: "text-bronze border-[rgba(217,160,102,0.35)] bg-[rgba(217,160,102,0.1)]",
  warning: "text-amber border-[rgba(255,196,107,0.35)] bg-[rgba(255,196,107,0.1)]",
  success: "text-emerald border-[rgba(52,232,154,0.35)] bg-[rgba(52,232,154,0.1)]",
  danger: "text-ember border-[rgba(224,86,58,0.35)] bg-[rgba(224,86,58,0.1)]",
};

export interface StatusBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

export function StatusBadge({
  tone = "draft",
  className = "",
  children,
  ...props
}: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${tones[tone]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}
