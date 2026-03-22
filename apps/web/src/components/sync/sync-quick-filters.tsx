import { useFilters } from "@/hooks/use-filters";
import type { SyncSessionStatus, SyncType } from "@myakiba/contracts/shared/types";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";

type FilterOption<T extends string> = {
  readonly value: T;
  readonly label: string;
};

const SYNC_TYPE_OPTIONS: readonly FilterOption<SyncType>[] = [
  { value: "csv", label: "CSV" },
  { value: "order", label: "Order" },
  { value: "order-item", label: "Order Item" },
  { value: "collection", label: "Collection" },
];

const STATUS_OPTIONS: readonly FilterOption<SyncSessionStatus>[] = [
  { value: "processing", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "partial", label: "Partial" },
  { value: "pending", label: "Pending" },
];

const VALID_SYNC_TYPES = new Set<string>(SYNC_TYPE_OPTIONS.map((o) => o.value));
const VALID_STATUSES = new Set<string>(STATUS_OPTIONS.map((o) => o.value));

export function SyncQuickFilters(): React.ReactElement {
  const { filters, setFilters } = useFilters("/(app)/sync");

  const handleSyncTypeChange = (values: string[]): void => {
    const types = values.filter((v): v is SyncType => VALID_SYNC_TYPES.has(v));

    setFilters({
      syncType: types.length > 0 ? types : undefined,
      page: undefined,
    });
  };

  const handleStatusChange = (values: string[]): void => {
    const statuses = values.filter((v): v is SyncSessionStatus => VALID_STATUSES.has(v));

    setFilters({
      status: statuses.length > 0 ? statuses : undefined,
      page: undefined,
    });
  };

  return (
    <>
      <ToggleGroup
        value={filters.syncType ?? []}
        onValueChange={handleSyncTypeChange}
        multiple
        variant="outline"
        size="sm"
      >
        {SYNC_TYPE_OPTIONS.map((option) => (
          <ToggleGroupItem key={option.value} value={option.value}>
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <ToggleGroup
        value={filters.status ?? []}
        onValueChange={handleStatusChange}
        multiple
        variant="outline"
        size="sm"
      >
        {STATUS_OPTIONS.map((option) => (
          <ToggleGroupItem key={option.value} value={option.value}>
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </>
  );
}
