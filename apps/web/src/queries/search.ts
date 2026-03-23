import {
  searchResponseSchema,
  searchReleasesResponseSchema,
  searchEntriesResponseSchema,
  searchOrdersResponseSchema,
} from "@myakiba/contracts/search/schema";
import type { ItemReleasesResponse } from "@myakiba/contracts/items/schema";
import { app, getErrorMessage } from "@/lib/treaty-client";
import type { z } from "zod";

export type OrderCommandMatch = {
  readonly id: string;
  readonly title: string;
  readonly itemImages: readonly string[];
};

export type ItemCommandMatch = {
  readonly itemId: string;
  readonly itemTitle: string;
  readonly itemImage: string | null;
  readonly itemCategory: string | null;
  readonly itemExternalId: number | null;
};

export type CommandSearchResults = {
  readonly orderMatches: readonly OrderCommandMatch[];
  readonly itemMatches: readonly ItemCommandMatch[];
};

export type SearchEntriesParams = {
  readonly search: string;
  readonly limit?: number;
  readonly offset?: number;
};

export type SearchOrdersParams = {
  readonly title?: string;
  readonly limit?: number;
  readonly offset?: number;
};

type SearchEntriesResponse = z.infer<typeof searchEntriesResponseSchema>;
type SearchOrdersResponse = z.infer<typeof searchOrdersResponseSchema>;

export async function searchCommandResults(search: string): Promise<CommandSearchResults> {
  const { data, error } = await app.api.search.get({
    query: { search },
  });

  if (error) {
    throw new Error(getErrorMessage(error, "Failed to search orders and items"));
  }

  const parsed = searchResponseSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error("Failed to parse search results");
  }

  return {
    orderMatches: parsed.data.searchData.orderResults.map((order) => ({
      id: order.orderId,
      title: order.orderTitle,
      itemImages: order.itemImages,
    })),
    itemMatches: parsed.data.searchData.collectionResults.map((item) => ({
      itemId: item.itemId,
      itemTitle: item.itemTitle,
      itemImage: item.itemImage,
      itemCategory: item.itemCategory,
      itemExternalId: item.itemExternalId,
    })),
  };
}

export async function searchReleases(itemId: string): Promise<ItemReleasesResponse> {
  const { data, error } = await app.api.search.releases.get({
    query: { itemId },
  });

  if (error) {
    throw new Error(getErrorMessage(error, "Failed to search releases"));
  }

  const parsed = searchReleasesResponseSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error("Failed to parse releases response");
  }

  return parsed.data;
}

export async function searchEntries(params: SearchEntriesParams): Promise<SearchEntriesResponse> {
  const { data, error } = await app.api.search.entries.get({
    query: params,
  });

  if (error) {
    throw new Error(getErrorMessage(error, "Failed to search entries"));
  }

  const parsed = searchEntriesResponseSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error("Failed to parse entries response");
  }

  return parsed.data;
}

export async function searchOrders(params: SearchOrdersParams): Promise<SearchOrdersResponse> {
  const { data, error } = await app.api.search.orders.get({
    query: params,
  });

  if (error) {
    throw new Error(getErrorMessage(error, "Failed to search orders"));
  }

  const parsed = searchOrdersResponseSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error("Failed to parse orders response");
  }

  return parsed.data;
}
