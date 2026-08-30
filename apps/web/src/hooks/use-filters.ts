import { useNavigate, useSearch } from "@tanstack/react-router";
import type { RegisteredRouter, RouteIds } from "@tanstack/react-router";

interface UseFiltersOptions {
  readonly resetOffsetOnFilterChange?: boolean;
}

const PAGINATION_KEYS = new Set(["limit", "offset"]);

export function useFilters<T extends RouteIds<RegisteredRouter["routeTree"]>>(
  routeId: T,
  options?: UseFiltersOptions,
) {
  const navigate = useNavigate();
  const filters = useSearch({ from: routeId });

  const setFilters = (partialFilters: Partial<typeof filters>) => {
    const shouldResetOffset =
      options?.resetOffsetOnFilterChange === true &&
      !("offset" in partialFilters) &&
      Object.keys(partialFilters).some((key) => !PAGINATION_KEYS.has(key));

    return navigate({
      to: ".",
      search: (prev) => ({
        ...prev,
        offset: shouldResetOffset ? 0 : prev.offset,
        ...partialFilters,
      }),
    });
  };
  const resetFilters = () => navigate({ to: ".", search: {} });

  return { filters, setFilters, resetFilters };
}
