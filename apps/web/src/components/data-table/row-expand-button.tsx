import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Row } from "@tanstack/react-table";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function RowExpandButton<TData>({ row }: { readonly row: Row<TData> }): ReactNode {
  if (!row.getCanExpand()) return null;
  const isExpanded = row.getIsExpanded();

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={(event) => {
        event.stopPropagation();
        row.toggleExpanded();
      }}
      aria-label={isExpanded ? "Collapse row" : "Expand row"}
      aria-expanded={isExpanded}
    >
      <HugeiconsIcon
        icon={ArrowRight01Icon}
        className={cn(
          "text-muted-foreground transition-transform duration-150 ease-out",
          isExpanded && "rotate-90",
        )}
      />
    </Button>
  );
}

/** Stands in for the expand button in a loading row: its box, with a bar where the chevron sits. */
export const ROW_EXPAND_SKELETON = (
  <div className="flex size-7 items-center justify-center">
    <Skeleton className="size-3 rounded-sm" />
  </div>
);
