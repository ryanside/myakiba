import { FilterIcon, FilterResetIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { OrderFilters } from "@myakiba/contracts/orders/schema";
import { DebouncedInput } from "@/components/debounced-input";
import OrdersFiltersForm from "@/components/orders/orders-filters-form";
import { Button } from "@/components/ui/button";
import { SortCombobox } from "@/components/ui/sort-combobox";
import type { SortableColumn } from "@/components/ui/sort-combobox";
import { useOrdersFilters } from "@/hooks/use-orders";
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
    <div className="flex items-center justify-start gap-2">
      <DebouncedInput
        value={filters.search ?? ""}
        onChange={(value) => setFilters({ search: value.toString() || undefined })}
        placeholder="Search"
        className="max-w-xs"
      />
      <OrdersFiltersForm
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
