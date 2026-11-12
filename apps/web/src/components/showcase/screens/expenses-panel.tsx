import type { ReactNode } from "react";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { cn } from "@/lib/utils";

/**
 * The app fades its data in with an animation that leaves each block on its own compositor layer.
 * Blocks the app animates take this class so their antialiasing matches the app's.
 */
export const DATA_LAYER = "will-change-[opacity]";

export const usd = (cents: number): string => formatCurrencyFromMinorUnits(cents, "USD", "en-US");

/** A titled expenses panel: the app's small-spacing frame, header and panel. */
export function Panel({
  title,
  action = null,
  className,
  panelClassName,
  children,
}: {
  readonly title: string;
  readonly action?: ReactNode;
  readonly className?: string;
  readonly panelClassName?: string;
  readonly children: ReactNode;
}) {
  return (
    <div className={cn("relative -mx-3 flex flex-col", className)}>
      <header
        className={cn(
          "flex flex-row items-center justify-between gap-2 px-3",
          action ? "py-1" : "py-2",
        )}
      >
        <h2 className="text-base font-medium">{title}</h2>
        {action}
      </header>
      <div className={cn("relative grow overflow-hidden rounded-2xl p-3", panelClassName)}>
        {children}
      </div>
    </div>
  );
}
