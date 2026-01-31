import {
  getRouteApi,
  type RegisteredRouter,
  type RouteIds,
  useNavigate,
} from "@tanstack/react-router";
import { cleanEmptyParams } from "../lib/utils";

export function useFilters<T extends RouteIds<RegisteredRouter["routeTree"]>>(routeId: T) {
  const routeApi = getRouteApi<T>(routeId);
  const navigate = useNavigate();
  const filters = routeApi.useSearch();

  const setFilters = (partialFilters: Partial<typeof filters>) =>
    navigate({
      to: ".",
      search: (prev) => cleanEmptyParams({ ...prev, ...partialFilters }),
    });
  const resetFilters = () => navigate({ to: ".", search: {} });

  return { filters, setFilters, resetFilters };
}
