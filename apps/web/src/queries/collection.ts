import { call } from "@/data/api";
import { app } from "@/lib/treaty-client";
import type { CollectionFilters } from "@myakiba/contracts/collection/schema";
import type { CollectionItemFormValues } from "@myakiba/contracts/collection/types";
import { DEFAULT_LIMIT } from "@myakiba/contracts/shared/constants";

export function getCollection(filters: CollectionFilters) {
  const queryParams = {
    ...filters,
    limit: filters.limit ?? DEFAULT_LIMIT,
    offset: filters.offset ?? 0,
    sort: filters.sort ?? "createdAt",
    order: filters.order ?? "desc",
  };

  return call(
    app.api.collection.get({
      query: queryParams,
    }),
    { fallback: "Failed to get collection", empty: "Failed to get collection" },
  );
}

export function deleteCollectionItems(ids: string[]) {
  return call(app.api.collection.delete({ ids }), {
    fallback: "Failed to delete collection items",
  });
}

export function updateCollectionItem(values: CollectionItemFormValues) {
  return call(app.api.collection({ id: values.id }).put(values), {
    fallback: "Failed to update collection item",
  });
}
