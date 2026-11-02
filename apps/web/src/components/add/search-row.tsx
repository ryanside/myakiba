import { ArrowUpRight01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { mfcSearchUrl } from "@myakiba/contracts/add/constants";
import { buttonVariants } from "@/components/ui/button";
import type { AddController } from "./add-controller";
import { AddSearch, NARROW_HIDDEN } from "./add-search";

/**
 * Where more rows come from, as the table's foot. It sits in the table's frame but not in the table,
 * so the keys, the sort, the selection and a screen reader's row count all leave it out. It mirrors
 * the header: MFC's icon on the Item column's edge, or its words when too narrow for the icon, and the
 * quieter search at the end, as Fill all is.
 */
export function SearchRow({ controller: c }: { readonly controller: AddController }) {
  return (
    <div className="flex items-center justify-between gap-1 border-t bg-muted/40 py-1 ps-8.5 pe-2">
      <a
        href={mfcSearchUrl("")}
        target="_blank"
        rel="noopener noreferrer"
        className={buttonVariants({ variant: "ghost", size: "sm" })}
      >
        <HugeiconsIcon
          icon={Search01Icon}
          data-icon="inline-start"
          strokeWidth={2}
          className="@max-[21rem]/grid:hidden"
          aria-hidden="true"
        />
        <span>
          <span className={NARROW_HIDDEN}>Search </span>MyFigureCollection
        </span>
        <HugeiconsIcon
          icon={ArrowUpRight01Icon}
          data-icon="inline-end"
          strokeWidth={2}
          className="text-muted-foreground group-hover/button:text-foreground"
          aria-hidden="true"
        />
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
      <AddSearch {...c.searchProps} />
    </div>
  );
}
