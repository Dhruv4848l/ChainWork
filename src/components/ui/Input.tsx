import { InputHTMLAttributes, forwardRef, useId } from "react";

/*
  Input — a labelled text field with optional hint and error message.
  Focus shows a bronze ring; an error swaps the border/ring to ember and displays
  the message below. Pass any native <input> prop (type, placeholder, value, …).

  Usage:
    <Input label="Email" type="email" placeholder="you@example.com" />
    <Input label="Phone" error="Enter a valid number" />
*/

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, hint, error, className = "", id, ...props }, ref) => {
    const autoId = useId();
    const inputId = id ?? autoId;
    const hasError = Boolean(error);

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-xs font-medium text-ink2"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={hasError}
          className={`w-full rounded-lg border bg-card2 px-3.5 py-2.5 text-sm text-ink placeholder:text-ink3 transition-colors focus:outline-none focus:ring-2 ${
            hasError
              ? "border-ember focus:ring-ember"
              : "border-line focus:border-bronze focus:ring-bronze"
          } ${className}`}
          {...props}
        />
        {hasError ? (
          <span className="text-xs text-ember">{error}</span>
        ) : (
          hint && <span className="text-xs text-ink3">{hint}</span>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
