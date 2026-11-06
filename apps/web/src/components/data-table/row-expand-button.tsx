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
      <ExpandChevron isExpanded={isExpanded} />
    </Button>
  );
}

function ExpandChevron({ isExpanded }: { readonly isExpanded: boolean }): ReactNode {
  return (
    <HugeiconsIcon
      icon={ArrowRight01Icon}
      className={cn(
        "text-muted-foreground transition-transform duration-150 ease-out",
        isExpanded && "rotate-90",
      )}
    />
  );
}

/** An invisible copy of the expand button for a loading row, so the row keeps the height it loads with. */
export const ROW_EXPAND_SKELETON = (
  <Button variant="ghost" size="icon-sm" disabled aria-hidden tabIndex={-1} className="invisible">
    <ExpandChevron isExpanded={false} />
  </Button>
);
