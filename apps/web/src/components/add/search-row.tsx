import { ArrowUpRight01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { mfcSearchUrl } from "@myakiba/contracts/add/constants";
import { buttonVariants } from "@/components/ui/button";
import type { AddController } from "./add-controller";
import { AddSearch, NARROW_HIDDEN } from "./add-search";

/**
 * Where more rows come from, under the last one. It sits in the table's frame but not in the table,
 * so the keys, the sort, the selection and a screen reader's row count all leave it out. Its start
 * clears the select column, its icon sits under the rows' pictures, and its words under their titles.
 */
export function SearchRow({ controller: c }: { readonly controller: AddController }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t py-1.5 ps-10 pe-2">
      <a
        href={mfcSearchUrl("")}
        target="_blank"
        rel="noopener noreferrer"
        className={buttonVariants({ variant: "ghost" })}
      >
        <HugeiconsIcon icon={Search01Icon} data-icon="inline-start" aria-hidden="true" />
        <span className="ms-3.5">
          <span className={NARROW_HIDDEN}>Search </span>MyFigureCollection
        </span>
        <HugeiconsIcon icon={ArrowUpRight01Icon} data-icon="inline-end" aria-hidden="true" />
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
      <AddSearch {...c.searchProps} />
    </div>
  );
}
