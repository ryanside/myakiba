import type {
  ItemDatabaseSearch,
  ItemDatabaseSearchResponse,
  SearchCommandCollectionResult,
  SearchEntriesQuery,
  SearchEntriesResponse,
  SearchOrdersQuery,
  SearchOrdersResponse,
} from "@myakiba/contracts/search/schema";
import { app, getErrorMessage } from "@/lib/treaty-client";

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
  const { data, error } = await app.api.search.command.get({
    query: { search },
  });

  if (error) {
    throw new Error(getErrorMessage(error, "Failed to search orders and items"));
  }

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
  const { data, error } = await app.api.search.items.get({
    query: params,
  });

  if (error) {
    throw new Error(getErrorMessage(error, "Failed to search item database"));
  }

  return data;
}

export async function searchEntries(params: SearchEntriesQuery): Promise<SearchEntriesResponse> {
  const { data, error } = await app.api.search.entries.get({
    query: params,
  });

  if (error) {
    throw new Error(getErrorMessage(error, "Failed to search entries"));
  }

  return data;
}

export async function searchOrders(params: SearchOrdersQuery): Promise<SearchOrdersResponse> {
  const { data, error } = await app.api.search.orders.get({
    query: params,
  });

  if (error) {
    throw new Error(getErrorMessage(error, "Failed to search orders"));
  }

  return data;
}
