import type {
  ItemDatabaseSearch,
  ItemDatabaseSearchResponse,
  SearchCommandCollectionResult,
  SearchEntriesQuery,
  SearchEntriesResponse,
  SearchOrdersQuery,
  SearchOrdersResponse,
} from "@myakiba/contracts/search/schema";
import { Result } from "better-result";
import { call } from "@/data/api";
import type { ApiFailure } from "@/data/api";
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

export function searchCommandResults(
  search: string,
): Promise<Result<CommandSearchResults, ApiFailure>> {
  return call(app.api.search.command.get({ query: { search } }), {
    fallback: "Failed to search orders and items",
    empty: "Failed to search orders and items",
  }).then(
    Result.map((data): CommandSearchResults => ({
      orderMatches: data.searchData.orderResults.map((order) => ({
        id: order.orderId,
        title: order.orderTitle,
        itemImages: order.itemImages,
      })),
      itemMatches: data.searchData.collectionResults,
    })),
  );
}

export function getItemDatabaseItems(
  params: ItemDatabaseSearch,
): Promise<Result<ItemDatabaseSearchResponse, ApiFailure>> {
  return call(
    app.api.search.items.get({
      query: params,
    }),
    { fallback: "Failed to search item database", empty: "Failed to search item database" },
  );
}

export function searchEntries(
  params: SearchEntriesQuery,
): Promise<Result<SearchEntriesResponse, ApiFailure>> {
  return call(
    app.api.search.entries.get({
      query: params,
    }),
    { fallback: "Failed to search entries", empty: "Failed to search entries" },
  );
}

export function searchOrders(
  params: SearchOrdersQuery,
): Promise<Result<SearchOrdersResponse, ApiFailure>> {
  return call(
    app.api.search.orders.get({
      query: params,
    }),
    { fallback: "Failed to search orders", empty: "Failed to search orders" },
  );
}
