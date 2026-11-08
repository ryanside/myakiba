import { useOrdersFilters } from "@/hooks/use-orders";
import { ORDER_STATUSES } from "@myakiba/contracts/shared/constants";
import { QuickFilterChips } from "../quick-filter-chips";

export function OrdersQuickFilters(): React.ReactElement {
  const { filters, setFilters } = useOrdersFilters();

  return (
    <QuickFilterChips
      options={ORDER_STATUSES}
      selected={filters.status ?? []}
      onChange={(statuses) => {
        setFilters({ status: statuses.length > 0 ? statuses : undefined, offset: 0 });
      }}
    />
  );
}
