import { paymentModeInfo } from "@/lib/payments/mode";

/*
  States the payment mode on every money surface (Payments, Earnings, hire pages,
  and later the payment window), so nobody mistakes demo or test money for real
  money. Renders nothing in live (mainnet) mode.
*/
export function PaymentModeBanner({ className = "" }: { className?: string }) {
  const info = paymentModeInfo();
  if (info.mode === "mainnet") return null;
  const demo = info.mode === "demo";
  return (
    <div
      role="note"
      aria-label={`Payment mode: ${info.label}`}
      className={`mb-4 flex items-start gap-3 rounded-xl border px-4 py-3 text-[12.5px] leading-relaxed ${
        demo ? "border-amber/40 bg-amber/[0.07] text-ink2" : "border-bronze/40 bg-bronze/[0.07] text-ink2"
      } ${className}`}
    >
      <span
        className={`mt-px shrink-0 rounded-md px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider ${
          demo ? "bg-amber/20 text-amber" : "bg-bronze/20 text-bronze"
        }`}
      >
        {info.label}
      </span>
      <span>{info.notice}</span>
    </div>
  );
}
