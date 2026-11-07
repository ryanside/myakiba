import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";

interface KPICardProps {
  readonly title: string;
  readonly value: string | number | undefined;
  readonly subvalueTitle?: string;
  readonly subvalue?: string | number | undefined;
  readonly isLoading?: boolean;
}

/** One figure in a {@link KPIGroup}: a small label and the value. */
export function KPICard({
  title,
  value,
  subvalueTitle,
  subvalue,
  isLoading,
}: KPICardProps): ReactNode {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <p className="eyebrow">{title}</p>
      {isLoading ? (
        <Skeleton className="my-1 h-6 w-24" />
      ) : (
        <div className="flex items-baseline gap-2">
          <p className="animate-data-in display text-2xl leading-8 font-medium text-foreground tabular-nums">
            {value}
          </p>
          {subvalueTitle && subvalue !== undefined && (
            <p className="animate-data-in text-[0.8125rem] text-muted-foreground tabular-nums">
              {subvalue} {subvalueTitle}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** A row of KPI figures on the page itself, spaced apart with no boxes or rules. */
export function KPIGroup({ children }: { readonly children: ReactNode }): ReactNode {
  return <div className="grid grid-cols-2 gap-x-10 gap-y-5 lg:grid-cols-4">{children}</div>;
}
