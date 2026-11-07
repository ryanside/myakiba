import { useId, useState } from "react";
import { FilterIcon, FilterResetIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { SearchPill } from "@/components/search-pill";
import FiltersForm from "@/components/collection/filters-form";
import { Button } from "@/components/ui/button";
import { SortCombobox } from "@/components/ui/sort-combobox";
import type { SortableColumn } from "@/components/ui/sort-combobox";
import { useCollectionFilters } from "@/hooks/use-collection";
import { hasActiveFiltersOrSorting } from "@/lib/filters";
import { useUserPreferences } from "@/hooks/use-user-preferences";

const SORTABLE_COLUMNS: SortableColumn[] = [
  { id: "itemTitle", label: "Item" },
  { id: "itemScale", label: "Scale" },
  { id: "count", label: "Count" },
  { id: "score", label: "Score" },
  { id: "shop", label: "Shop" },
  { id: "price", label: "Price" },
  { id: "orderDate", label: "Order Date" },
  { id: "paymentDate", label: "Payment Date" },
  { id: "shippingDate", label: "Shipping Date" },
  { id: "collectionDate", label: "Collection Date" },
  { id: "createdAt", label: "Created At" },
];

export function CollectionToolbar(): React.JSX.Element {
  const { filters, setFilters, resetFilters } = useCollectionFilters();
  const [searchResetKey, setSearchResetKey] = useState(0);
  // Reset shows only when there is something to reset: an applied filter or sort, or typed text.
  const [hasSearchDraft, setHasSearchDraft] = useState(false);
  const searchId = useId();
  const { currency } = useUserPreferences();
  const currentSort =
    filters.sort && filters.order
      ? { columnId: filters.sort, direction: filters.order as "asc" | "desc" }
      : null;

  const handleSortChange = (columnId: string | null, direction: "asc" | "desc" | null): void => {
    if (columnId === null || direction === null) {
      setFilters({ sort: "createdAt", order: "desc", offset: 0 });
      return;
    }

    setFilters({
      sort: columnId as
        | "itemTitle"
        | "itemScale"
        | "count"
        | "score"
        | "price"
        | "shop"
        | "orderDate"
        | "paymentDate"
        | "shippingDate"
        | "collectionDate"
        | "createdAt",
      order: direction,
      offset: 0,
    });
  };

  return (
    <div className="flex min-w-0 items-center justify-start gap-2">
      <SearchPill
        key={searchResetKey}
        value={filters.search ?? ""}
        onChange={(value) => setFilters({ search: value.toString() || undefined })}
        placeholder="Search"
        aria-label="Search Collection"
        id={searchId}
        onInput={(event) => setHasSearchDraft(event.currentTarget.value !== "")}
        className="max-w-64"
      />
      <FiltersForm
        renderTrigger={
          <Button variant="outline">
            <HugeiconsIcon icon={FilterIcon} data-icon="inline-start" />
            <span className="max-md:sr-only">Filters</span>
          </Button>
        }
        currentFilters={{ ...filters }}
        onApplyFilters={(newFilters) => setFilters({ ...filters, ...newFilters, offset: 0 })}
        currency={currency}
      />
      <SortCombobox
        columns={SORTABLE_COLUMNS}
        currentSort={currentSort}
        onSortChange={handleSortChange}
      />
      {hasActiveFiltersOrSorting(filters) || hasSearchDraft ? (
        <Button
          onClick={async () => {
            setSearchResetKey((key) => key + 1);
            setHasSearchDraft(false);
            await resetFilters();
            // The button leaves with the filters, so focus returns to the search it cleared. It
            // waits for the reset: a focused search ignores outside changes to its value.
            requestAnimationFrame(() =>
              document.querySelector<HTMLInputElement>(`[id="${searchId}"]`)?.focus(),
            );
          }}
          variant="ghost"
          className="text-muted-foreground"
        >
          <HugeiconsIcon icon={FilterResetIcon} data-icon="inline-start" />
          <span className="max-md:sr-only">Reset Filters</span>
        </Button>
      ) : null}
    </div>
  );
}
