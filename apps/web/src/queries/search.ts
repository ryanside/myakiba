import { requireData } from "@/lib/api-response";
import type {
  ItemDatabaseSearch,
  ItemDatabaseSearchResponse,
  SearchCommandCollectionResult,
  SearchEntriesQuery,
  SearchEntriesResponse,
  SearchOrdersQuery,
  SearchOrdersResponse,
} from "@myakiba/contracts/search/schema";
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
  const data = await requireData(
    app.api.search.command.get({ query: { search } }),
    "Failed to search orders and items",
  );

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
  return requireData(app.api.search.items.get({ query: params }), "Failed to search item database");
}

export async function searchEntries(params: SearchEntriesQuery): Promise<SearchEntriesResponse> {
  return requireData(app.api.search.entries.get({ query: params }), "Failed to search entries");
}

export async function searchOrders(params: SearchOrdersQuery): Promise<SearchOrdersResponse> {
  return requireData(app.api.search.orders.get({ query: params }), "Failed to search orders");
}
