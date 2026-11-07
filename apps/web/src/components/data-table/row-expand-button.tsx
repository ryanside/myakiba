import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Row } from "@tanstack/react-table";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
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
