import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface ExpenseLedgerBandProps {
  readonly title?: string;
  readonly leading?: boolean;
  readonly headerAction?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}

export function ExpenseLedgerBand({
  title,
  headerAction,
  children,
  className,
}: ExpenseLedgerBandProps): ReactNode {
  return (
    <section className={cn("space-y-3 py-4", className)}>
      {title || headerAction ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          {title ? (
            <h2 className="text-md tracking-tight font-heading font-medium">{title}</h2>
          ) : (
            <div />
          )}
          {headerAction}
        </div>
      ) : null}
      {children}
    </section>
  );
}

interface ExpenseLedgerMetricsGridProps {
  readonly children: ReactNode;
  readonly className?: string;
}

export function ExpenseLedgerMetricsGrid({
  children,
  className,
}: ExpenseLedgerMetricsGridProps): ReactNode {
  return (
    <div
      className={cn(
        "grid gap-4 sm:grid-cols-3",
        "[&>*+*]:sm:border-l [&>*+*]:sm:border-border/60 [&>*+*]:sm:pl-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

interface ExpenseLedgerEmptyProps {
  readonly children: ReactNode;
  readonly className?: string;
}

export function ExpenseLedgerEmpty({ children, className }: ExpenseLedgerEmptyProps): ReactNode {
  return (
    <div className={cn("py-4 text-center text-sm text-muted-foreground", className)}>
      {children}
    </div>
  );
}

interface ExpenseLedgerMetricProps {
  readonly title: string;
  readonly value: string | number | undefined;
  readonly subtitle?: string;
  readonly subvalueTitle?: string;
  readonly subvalue?: string | number | undefined;
  readonly isLoading?: boolean;
  readonly className?: string;
}

export function ExpenseLedgerMetric({
  title,
  value,
  subtitle,
  subvalueTitle,
  subvalue,
  isLoading,
  className,
}: ExpenseLedgerMetricProps): ReactNode {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <p className="text-xs font-orbitron font-normal lowercase text-muted-foreground">{title}</p>
      {isLoading ? (
        <Skeleton className="h-8 w-24" />
      ) : (
        <div className="flex items-baseline gap-2">
          <p className="animate-data-in text-2xl font-medium tabular-nums tracking-tight text-foreground">
            {value}
          </p>
          {subvalueTitle && subvalue !== undefined ? (
            <div className="animate-data-in flex items-baseline gap-1 [--data-in-delay:60ms]">
              <span className="text-xs text-muted-foreground tabular-nums">{subvalue}</span>
              <span className="text-xs text-muted-foreground">{subvalueTitle}</span>
            </div>
          ) : null}
        </div>
      )}
      {subtitle ? <p className="text-xs text-muted-foreground italic">{subtitle}</p> : null}
    </div>
  );
}
