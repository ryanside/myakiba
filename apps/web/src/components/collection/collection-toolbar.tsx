import { FilterIcon, FilterResetIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { DebouncedInput } from "@/components/debounced-input";
import FiltersForm from "@/components/collection/filters-form";
import { Button } from "@/components/ui/button";
import { SortCombobox } from "@/components/ui/sort-combobox";
import type { SortableColumn } from "@/components/ui/sort-combobox";
import { useCollectionFilters } from "@/hooks/use-collection";
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
    <div className="flex items-center justify-start gap-2">
      <DebouncedInput
        value={filters.search ?? ""}
        onChange={(value) => setFilters({ search: value.toString() || undefined })}
        placeholder="Search"
        className="max-w-xs"
      />
      <FiltersForm
        renderTrigger={
          <Button variant="outline">
            <HugeiconsIcon icon={FilterIcon} />
            <span className="hidden md:block">Filters</span>
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
      <Button onClick={resetFilters} variant="outline">
        <HugeiconsIcon icon={FilterResetIcon} />
        <span className="hidden md:block">Reset Filters</span>
      </Button>
    </div>
  );
}
