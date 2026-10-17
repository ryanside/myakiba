import type { QueryClient } from "@tanstack/react-query";
import { collectionWriteFamilies, inFamilies, syncResultFamilies } from "@/data/catalog";
import type { Family } from "@/data/catalog";

function invalidateFamilies(queryClient: QueryClient, families: readonly Family[]): Promise<void> {
  return queryClient.invalidateQueries({
    predicate: (query) => inFamilies(query.queryKey, families),
  });
}

export function invalidateCollectionAndOrderQueries(queryClient: QueryClient): Promise<void> {
  return invalidateFamilies(queryClient, collectionWriteFamilies);
}

export function invalidateSyncResultQueries(queryClient: QueryClient): Promise<void> {
  return invalidateFamilies(queryClient, syncResultFamilies);
}
