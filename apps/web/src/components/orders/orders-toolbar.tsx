import { FilterIcon, FilterResetIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { OrderFilters } from "@myakiba/contracts/orders/schema";
import { useToolbarSearch } from "@/hooks/use-toolbar-search";
import { SearchPill } from "@/components/search-pill";
import OrdersFiltersForm from "@/components/orders/orders-filters-form";
import { Button } from "@/components/ui/button";
import { SortCombobox } from "@/components/ui/sort-combobox";
import type { SortableColumn } from "@/components/ui/sort-combobox";
import { useOrdersFilters } from "@/hooks/use-orders";
import { hasActiveFiltersOrSorting } from "@/lib/filters";
import { useUserPreferences } from "@/hooks/use-user-preferences";

const SORTABLE_COLUMNS: SortableColumn[] = [
  { id: "title", label: "Order" },
  { id: "shop", label: "Shop" },
  { id: "orderDate", label: "Order Date" },
  { id: "paymentDate", label: "Payment Date" },
  { id: "shippingDate", label: "Shipping Date" },
  { id: "collectionDate", label: "Collection Date" },
  { id: "releaseDate", label: "Release" },
  { id: "shippingMethod", label: "Shipping Method" },
  { id: "total", label: "Total" },
  { id: "shippingFee", label: "Shipping Fee" },
  { id: "taxes", label: "Taxes" },
  { id: "duties", label: "Duties" },
  { id: "tariffs", label: "Tariffs" },
  { id: "miscFees", label: "Misc Fees" },
  { id: "itemCount", label: "Items" },
  { id: "status", label: "Status" },
  { id: "createdAt", label: "Created At" },
];

export function OrdersToolbar(): React.JSX.Element {
  const { filters, setFilters, resetFilters } = useOrdersFilters();
  const { inputRef, searchResetKey, hasSearchDraft, onSearchTextChange, resetSearch } =
    useToolbarSearch(resetFilters);
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

    setFilters({ sort: columnId as OrderFilters["sort"], order: direction, offset: 0 });
  };

  return (
    <div className="flex min-w-0 items-center justify-start gap-2">
      <SearchPill
        key={searchResetKey}
        value={filters.search ?? ""}
        onChange={(value) => setFilters({ search: value.toString() || undefined })}
        placeholder="Search"
        aria-label="Search Orders"
        ref={inputRef}
        onTextChange={onSearchTextChange}
        className="max-w-64"
      />
      <OrdersFiltersForm
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
        <Button onClick={resetSearch} variant="ghost" className="text-muted-foreground">
          <HugeiconsIcon icon={FilterResetIcon} data-icon="inline-start" />
          <span className="max-md:sr-only">Reset Filters</span>
        </Button>
      ) : null}
    </div>
  );
}
