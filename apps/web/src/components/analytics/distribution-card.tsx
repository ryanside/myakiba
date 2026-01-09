import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@myakiba/utils";
import { Progress } from "@/components/ui/progress";
import { Badge } from "../ui/badge";

interface RowNavigation {
  to: string;
  search?: Record<string, unknown>;
}

interface DistributionItem {
  label: string;
  count: number;
  value?: string | number;
}

interface DistributionCardProps {
  title: string;
  icon?: React.ReactNode;
  data: DistributionItem[];
  maxValue: number;
  emptyMessage?: string;
  className?: string;
  currency?: string;
  getRowNavigation?: (item: DistributionItem) => RowNavigation | undefined;
}

export function DistributionCard({
  title,
  icon,
  data,
  maxValue,
  emptyMessage = "No data found",
  className,
  currency = "USD",
  getRowNavigation,
}: DistributionCardProps): React.ReactNode {
  const navigate = useNavigate();

  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border border-border bg-card overflow-hidden",
        className
      )}
    >
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border">
        {icon && (
          <span className="text-muted-foreground flex-shrink-0">{icon}</span>
        )}
        <h3 className="text-base font-medium text-foreground">{title}</h3>
      </div>

      <div className="flex-1 px-5 py-4 space-y-4">
        {data.length > 0 ? (
          data.map((item, index) => {
            const rowNav = getRowNavigation?.(item);
            return (
              <div
                key={index}
                className={cn(
                  "space-y-2 rounded-lg p-2 -mx-2 transition-colors",
                  rowNav && "cursor-pointer hover:bg-muted/30"
                )}
                onClick={() => {
                  if (rowNav) {
                    navigate({ to: rowNav.to, search: rowNav.search });
                  }
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">
                    {item.label}
                  </span>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">{item.count} items</Badge>
                    {item.value && (
                      <span className="text-sm text-muted-foreground tabular-nums">
                        {formatCurrency(item.value as number, currency)}
                      </span>
                    )}
                  </div>
                </div>
                <Progress
                  value={item.count}
                  max={maxValue}
                  className="h-1.5 bg-muted/30"
                />
              </div>
            );
          })
        ) : (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            {emptyMessage}
          </div>
        )}
      </div>
    </div>
  );
}
