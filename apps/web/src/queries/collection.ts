import { app, getErrorMessage } from "@/lib/treaty-client";
import type {
  CollectionFilters,
  CollectionItemFormValues,
} from "@/lib/collection/types";

export async function getCollection(filters: CollectionFilters) {
  const queryParams = {
    limit: filters.limit ?? 10,
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

  const { data, error } = await app.api.collection.get({
    query: queryParams,
  });
  if (error) {
    throw new Error(getErrorMessage(error, "Failed to get collection"));
  }
  return data;
}

export async function deleteCollectionItems(ids: string[]) {
  const { error } = await app.api.collection.delete({ ids });
  if (error) {
    throw new Error(getErrorMessage(error, "Failed to delete collection items"));
  }
}

export async function searchEntries(search: string) {
  const { data, error } = await app.api.entries.search.get({
    query: { search },
  });
  if (error) {
    throw new Error(getErrorMessage(error, "Failed to search entries"));
  }
  return data;
}

export async function updateCollectionItem(values: CollectionItemFormValues) {
  const { error } = await app.api.collection({ id: values.id }).put(values);
  if (error) {
    throw new Error(getErrorMessage(error, "Failed to update collection item"));
  }
}
