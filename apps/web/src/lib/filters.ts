import type { CollectionFilters } from "@myakiba/contracts/collection/schema";
import type { OrderFilters } from "@myakiba/contracts/orders/schema";

type ListFilters = CollectionFilters | OrderFilters;

export function hasActiveFiltersOrSorting({
  limit: _limit,
  offset: _offset,
  sort = "createdAt",
  order = "desc",
  ...filters
}: ListFilters): boolean {
  return (
    sort !== "createdAt" ||
    order !== "desc" ||
    Object.values(filters).some((value) =>
      Array.isArray(value) ? value.length > 0 : value !== undefined,
    )
  );
}
