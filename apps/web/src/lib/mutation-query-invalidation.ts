import type { QueryClient } from "@tanstack/react-query";

const collectionAndOrderQueryRoots = new Set<unknown>([
  "analytics",
  "app-command",
  "calendar",
  "collection",
  "dashboard",
  "expenses",
  "item",
  "order",
  "orderItemReleases",
  "orderItems",
  "orderIdsAndTitles",
  "orders",
  "releaseCalendar",
]);

const syncResultQueryRoots = new Set<unknown>([
  ...collectionAndOrderQueryRoots,
  "entries",
  "itemReleases",
  "syncSessions",
  "syncSessionDetail",
]);

function invalidateQueriesByRoot(
  queryClient: QueryClient,
  queryRoots: ReadonlySet<unknown>,
): Promise<void> {
  return queryClient.invalidateQueries({
    predicate: (query) => queryRoots.has(query.queryKey[0]),
  });
}

export function invalidateCollectionAndOrderQueries(queryClient: QueryClient): Promise<void> {
  return invalidateQueriesByRoot(queryClient, collectionAndOrderQueryRoots);
}

export function invalidateSyncResultQueries(queryClient: QueryClient): Promise<void> {
  return invalidateQueriesByRoot(queryClient, syncResultQueryRoots);
}
