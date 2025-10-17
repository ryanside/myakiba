import { client } from "@/lib/hono-client";
import type {
  CollectionFilters,
  CollectionItemFormValues,
} from "@/lib/collection/types";

export async function getCollection(filters: CollectionFilters) {
  const queryParams = {
    limit: filters.limit?.toString(),
    offset: filters.offset?.toString(),
    sort: filters.sort,
    order: filters.order,
    search: filters.search,
    paidMin: filters.paidMin,
    paidMax: filters.paidMax,
    shop: filters.shop?.join(",") || [],
    payDateStart: filters.payDateStart,
    payDateEnd: filters.payDateEnd,
    shipDateStart: filters.shipDateStart,
    shipDateEnd: filters.shipDateEnd,
    colDateStart: filters.colDateStart,
    colDateEnd: filters.colDateEnd,
    shipMethod: filters.shipMethod?.join(",") || [],
    relDateStart: filters.relDateStart,
    relDateEnd: filters.relDateEnd,
    relPriceMin: filters.relPriceMin,
    relPriceMax: filters.relPriceMax,
    relCurrency: filters.relCurrency?.join(",") || [],
    category: filters.category?.join(",") || [],
    entries: filters.entries?.join(",") || [],
    scale: filters.scale?.join(",") || [],
    tags: filters.tags?.join(",") || [],
    condition: filters.condition?.join(",") || [],
  };

  const response = await client.api.collection.$get({
    query: queryParams,
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `HTTP ${response.status}`);
  }
  const data = await response.json();
  return data;
}

export async function deleteCollectionItems(ids: string[]) {
  const response = await client.api.collection.$delete({
    json: { ids },
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `HTTP ${response.status}`);
  }
}

export async function searchEntries(search: string) {
  const response = await client.api.entries.search.$get({
    query: { search },
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `HTTP ${response.status}`);
  }
  return response.json();
}

export async function updateCollectionItem(values: CollectionItemFormValues) {
  const response = await client.api.collection[":id"].$put({
    param: { id: values.id },
    json: values,
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `HTTP ${response.status}`);
  }
}
