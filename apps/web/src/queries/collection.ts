import { requireData, checkResponse } from "@/lib/api-response";
import { app } from "@/lib/treaty-client";
import type { CollectionFilters } from "@myakiba/contracts/collection/schema";
import type { CollectionItemFormValues } from "@myakiba/contracts/collection/types";
import { DEFAULT_LIMIT } from "@myakiba/contracts/shared/constants";

export async function getCollection(filters: CollectionFilters) {
  const queryParams = {
    limit: filters.limit ?? DEFAULT_LIMIT,
    offset: filters.offset ?? 0,
    sort: filters.sort ?? "createdAt",
    order: filters.order ?? "desc",
    search: filters.search,
    paidMin: filters.paidMin,
    paidMax: filters.paidMax,
    shop: filters.shop,
    payDateStart: filters.payDateStart,
    payDateEnd: filters.payDateEnd,
    shipDateStart: filters.shipDateStart,
    shipDateEnd: filters.shipDateEnd,
    colDateStart: filters.colDateStart,
    colDateEnd: filters.colDateEnd,
    shipMethod: filters.shipMethod,
    relDateStart: filters.relDateStart,
    relDateEnd: filters.relDateEnd,
    relPriceMin: filters.relPriceMin,
    relPriceMax: filters.relPriceMax,
    relCurrency: filters.relCurrency,
    category: filters.category,
    entries: filters.entries,
    scale: filters.scale,
    tags: filters.tags,
    condition: filters.condition,
  };

  return requireData(app.api.collection.get({ query: queryParams }), "Failed to get collection");
}

export async function deleteCollectionItems(ids: string[]) {
  await checkResponse(app.api.collection.delete({ ids }), "Failed to delete collection items");
}

export async function updateCollectionItem(values: CollectionItemFormValues) {
  await checkResponse(
    app.api.collection({ id: values.id }).put(values),
    "Failed to update collection item",
  );
}
