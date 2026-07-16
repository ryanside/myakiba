const NON_FILTER_KEYS = new Set(["limit", "offset", "sort", "order", "search"]);

interface SortState {
  readonly sort?: string;
  readonly order?: string;
}

interface DefaultSortState {
  readonly sort: string;
  readonly order: string;
}

const DEFAULT_SORT_STATE: DefaultSortState = {
  sort: "createdAt",
  order: "desc",
};

function hasActiveFilters<T extends Record<string, unknown>>(filters: T): boolean {
  return Object.entries(filters).some(([key, value]) => {
    if (NON_FILTER_KEYS.has(key)) return false;
    if (value === undefined || value === null) return false;
    if (typeof value === "string") return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return true;
  });
}

export function hasActiveFiltersOrSorting<T extends Record<string, unknown> & SortState>(
  filters: T,
  defaultSort: DefaultSortState = DEFAULT_SORT_STATE,
): boolean {
  if (hasActiveFilters(filters)) {
    return true;
  }

  const currentSort = filters.sort ?? defaultSort.sort;
  const currentOrder = filters.order ?? defaultSort.order;

  return currentSort !== defaultSort.sort || currentOrder !== defaultSort.order;
}
