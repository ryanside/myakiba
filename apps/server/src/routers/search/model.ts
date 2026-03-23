export {
  searchQuerySchema,
  searchResponseSchema,
  searchReleasesQuerySchema,
  searchEntriesQuerySchema,
  searchOrdersQuerySchema,
} from "@myakiba/contracts/search/schema";

export const SEARCH_COLLECTION_RESULT_LIMIT = 5;
export const SEARCH_ORDER_RESULT_LIMIT = 5;

export type SearchCollectionResult = {
  readonly itemId: string;
  readonly itemExternalId: number | null;
  readonly itemTitle: string;
  readonly itemImage: string | null;
  readonly itemCategory: string | null;
};

export type SearchOrderResult = {
  readonly orderId: string;
  readonly orderTitle: string;
  readonly itemImages: readonly string[];
};

export type SearchData = {
  readonly collectionResults: readonly SearchCollectionResult[];
  readonly orderResults: readonly SearchOrderResult[];
};

export type SearchEntryResult = {
  readonly id: string;
  readonly name: string;
  readonly category: string | null;
};

export type SearchOrderIdAndTitle = {
  readonly id: string;
  readonly title: string;
};
