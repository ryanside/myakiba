import type { ReactNode } from "react";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { cn } from "@/lib/utils";

export function cents(dollars: number): number {
  return Math.round(dollars * 100);
}

export function money(dollars: number): string {
  return formatCurrencyFromMinorUnits(cents(dollars), "USD", "en-US");
}

export function SectionShell({
  color,
  className,
  children,
}: {
  readonly color: string;
  readonly className: string;
  readonly children: ReactNode;
}) {
  return (
    <div className={cn("relative isolate", className)}>
      <div
        aria-hidden
        className="absolute -inset-x-8 -inset-y-6 -z-10 opacity-10 mask-x-from-80% mask-y-from-75%"
        style={{
          background: `radial-gradient(125% 125% at 50% 0%, transparent 40%, ${color} 60%, transparent 80%)`,
        }}
      />
      {children}
    </div>
  );
}
