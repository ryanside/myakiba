import type { QueryClient } from "@tanstack/react-query";
import { inFamilies, syncResultFamilies } from "@/data/catalog";
import type { Family } from "@/data/catalog";

function invalidateFamilies(queryClient: QueryClient, families: readonly Family[]): Promise<void> {
  return queryClient.invalidateQueries({
    predicate: (query) => inFamilies(query.queryKey, families),
  });
}

export function invalidateSyncResultQueries(queryClient: QueryClient): Promise<void> {
  return invalidateFamilies(queryClient, syncResultFamilies);
}
