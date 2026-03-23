import { useOrdersFilters } from "@/hooks/use-orders";
import { ORDER_STATUSES } from "@myakiba/contracts/shared/constants";
import type { OrderStatus } from "@myakiba/contracts/shared/types";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";

const VALID_STATUSES = new Set<string>(ORDER_STATUSES);

export function OrdersQuickFilters(): React.ReactElement {
  const { filters, setFilters } = useOrdersFilters();

  const handleValueChange = (values: string[]): void => {
    const statuses = values.filter((v): v is OrderStatus => VALID_STATUSES.has(v));

    setFilters({
      status: statuses.length > 0 ? statuses : undefined,
      offset: 0,
    });
  };

  return (
    <ToggleGroup
      value={filters.status ?? []}
      onValueChange={handleValueChange}
      multiple
      variant="outline"
      size="sm"
    >
      {ORDER_STATUSES.map((status) => (
        <ToggleGroupItem key={status} value={status}>
          {status}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
