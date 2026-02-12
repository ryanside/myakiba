import {
  getRouteApi,
  type RegisteredRouter,
  type RouteIds,
  useNavigate,
} from "@tanstack/react-router";
import { cleanEmptyParams } from "../lib/utils";

interface UseFiltersOptions {
  readonly paginationDefaults?: {
    readonly limit?: number;
  };
}

export function useFilters<T extends RouteIds<RegisteredRouter["routeTree"]>>(
  routeId: T,
  options?: UseFiltersOptions,
) {
  const routeApi = getRouteApi<T>(routeId);
  const navigate = useNavigate();
  const filters = routeApi.useSearch();

  const setFilters = (partialFilters: Partial<typeof filters>) =>
    navigate({
      to: ".",
      search: (prev) =>
        cleanEmptyParams({ ...prev, ...partialFilters }, options?.paginationDefaults),
    });
  const resetFilters = () => navigate({ to: ".", search: {} });

  return { filters, setFilters, resetFilters };
}
