import { ButtonHTMLAttributes, forwardRef } from "react";

/*
  Button — the primary interactive control.

  Variants (from the design system):
    primary   -> bronze fill, dark text   (the main CTA; e.g. "Find Jobs", "Post a Job")
    secondary -> outlined, bronze on hover (secondary actions; e.g. "Edit Profile")
    ghost     -> text-only, no chrome      (tertiary / inline actions; e.g. "See all")
    success   -> emerald fill              (confirm / release money)
    danger    -> ember fill                (destructive / dispute / reject)

  All variants are pill-shaped (rounded-full), matching the design pack's CTAs.
  Usage: <Button variant="primary" size="md" onClick={...}>Label</Button>
*/

type Variant = "primary" | "secondary" | "ghost" | "success" | "danger";
type Size = "sm" | "md";

// cw-sheen (hover shine) + cw-press (tactile press) are motion garnish only —
// they no-op on touch devices and under prefers-reduced-motion, so the buttons
// stay plain, obvious, and easy for non-technical users.
const base =
  "cw-sheen cw-press inline-flex items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap cursor-pointer transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bronze focus-visible:ring-offset-2 focus-visible:ring-offset-bg";

const sizes: Record<Size, string> = {
  sm: "text-xs px-4 py-2",
  md: "text-sm px-6 py-3",
};

const variants: Record<Variant, string> = {
  primary: "bg-bronze text-[#1a1512] hover:bg-bronze-hover",
  secondary:
    "bg-transparent text-ink border border-line-strong hover:border-bronze",
  ghost: "bg-transparent text-ink2 hover:text-ink",
  success: "bg-emerald text-[#08130d] hover:brightness-110",
  danger: "bg-ember text-white hover:brightness-110",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", className = "", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";
