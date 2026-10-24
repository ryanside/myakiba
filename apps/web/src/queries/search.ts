import type {
  ItemDatabaseSearch,
  ItemDatabaseSearchResponse,
  SearchCommandCollectionResult,
  SearchEntriesQuery,
  SearchEntriesResponse,
  SearchOrdersQuery,
  SearchOrdersResponse,
} from "@myakiba/contracts/search/schema";
import { call, rejectErr } from "@/data/api";
import { app } from "@/lib/treaty-client";

export type OrderCommandMatch = {
  readonly id: string;
  readonly title: string;
  readonly itemImages: readonly string[];
};

export type CommandSearchResults = {
  readonly orderMatches: readonly OrderCommandMatch[];
  readonly itemMatches: readonly SearchCommandCollectionResult[];
};

export async function searchCommandResults(search: string): Promise<CommandSearchResults> {
  const data = await call(app.api.search.command.get({ query: { search } }), {
    fallback: "Failed to search orders and items",
  }).then(rejectErr);

  return {
    orderMatches: data.searchData.orderResults.map((order) => ({
      id: order.orderId,
      title: order.orderTitle,
      itemImages: order.itemImages,
    })),
    itemMatches: data.searchData.collectionResults,
  };
}

export async function getItemDatabaseItems(
  params: ItemDatabaseSearch,
): Promise<ItemDatabaseSearchResponse> {
  return call(
    app.api.search.items.get({
      query: params,
    }),
    { fallback: "Failed to search item database" },
  ).then(rejectErr);
}

export async function searchEntries(params: SearchEntriesQuery): Promise<SearchEntriesResponse> {
  return call(
    app.api.search.entries.get({
      query: params,
    }),
    { fallback: "Failed to search entries" },
  ).then(rejectErr);
}

export async function searchOrders(params: SearchOrdersQuery): Promise<SearchOrdersResponse> {
  return call(
    app.api.search.orders.get({
      query: params,
    }),
    { fallback: "Failed to search orders" },
  ).then(rejectErr);
}
