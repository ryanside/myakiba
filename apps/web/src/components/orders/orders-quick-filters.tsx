import { useOrdersFilters } from "@/hooks/use-orders";
import { ORDER_STATUSES } from "@myakiba/contracts/shared/constants";
import type { OrderStatus } from "@myakiba/contracts/shared/types";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";

const VALID_STATUSES = new Set<string>(ORDER_STATUSES);
// "All" is pressed while no filter is on; pressing it clears the filters.
const ALL = "All";

export function OrdersQuickFilters(): React.ReactElement {
  const { filters, setFilters } = useOrdersFilters();

  const isAll = (filters.status?.length ?? 0) === 0;

  const handleValueChange = (values: string[]): void => {
    const statuses =
      values.includes(ALL) && !isAll
        ? []
        : values.filter((v): v is OrderStatus => VALID_STATUSES.has(v));

    setFilters({
      status: statuses.length > 0 ? statuses : undefined,
      offset: 0,
    });
  };

  return (
    <ToggleGroup
      value={isAll ? [ALL] : (filters.status ?? [])}
      onValueChange={handleValueChange}
      multiple
      variant="pill"
      size="sm"
      spacing={1.5}
      aria-label="Quick filters"
    >
      <ToggleGroupItem value={ALL}>{ALL}</ToggleGroupItem>
      {ORDER_STATUSES.map((status) => (
        <ToggleGroupItem key={status} value={status}>
          {status}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
