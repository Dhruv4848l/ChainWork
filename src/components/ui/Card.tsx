import { HTMLAttributes } from "react";

/*
  Card — the standard surface container used across every dashboard screen.
  A card sits one step above the page background (bg-card) with a hairline border.
  Set `hover` for cards that are clickable (adds a subtle bronze border on hover).

  Usage: <Card className="p-6">…</Card>
*/

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
}

export function Card({
  hover = false,
  className = "",
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={`rounded-2xl border border-line bg-card ${
        hover ? "transition-colors hover:border-bronze" : ""
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
