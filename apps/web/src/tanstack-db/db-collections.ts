import { QueryClient } from "@tanstack/react-query";
import {
  createCollection,
  gte,
  ilike,
  inArray,
  lower,
  lte,
  useLiveQuery,
} from "@tanstack/react-db";
import { queryCollectionOptions } from "@tanstack/query-db-collection";
import type { CollectionFilters, CollectionItem, CollectionItemFormValues } from "@myakiba/types";
import { deleteCollectionItems, getCollection, updateCollectionItem } from "@/queries/collection";

const BASE_COLLECTION_LIMIT: number = 10000;

const toCollectionItemFormValues = (item: CollectionItem): CollectionItemFormValues => ({
  id: item.id,
  orderId: item.orderId,
  itemId: item.itemId,
  itemExternalId: item.itemExternalId,
  itemTitle: item.itemTitle,
  itemImage: item.itemImage,
  status: item.status,
  count: item.count,
  score: item.score,
  price: item.price,
  shop: item.shop,
  condition: item.condition,
  orderDate: item.orderDate,
  paymentDate: item.paymentDate,
  shippingDate: item.shippingDate,
  collectionDate: item.collectionDate,
  shippingMethod: item.shippingMethod,
  tags: item.tags,
  notes: item.notes,
  releaseId: item.releaseId,
  releaseDate: item.releaseDate,
  releasePrice: item.releasePrice,
  releaseCurrency: item.releaseCurrency,
  releaseBarcode: item.releaseBarcode,
  releaseType: item.releaseType,
});

// 1. create reusable tanstack db collection for collection
// takes in filters from useFilters hook
// with onUpdate and onDelete

export const createBaseCollection = (filters: CollectionFilters, queryClient: QueryClient) => {
  const baseEntriesKey = filters.entries ? [...filters.entries].sort().join("|") : "";
  const baseQueryKey: readonly [string, string] = ["collection", baseEntriesKey];
  const entries = baseEntriesKey ? baseEntriesKey.split("|") : undefined;
  const baseQueryFilters: CollectionFilters = {
    limit: BASE_COLLECTION_LIMIT,
    offset: 0,
    sort: "createdAt",
    order: "desc",
    entries,
  };

  return createCollection(
    queryCollectionOptions({
      queryKey: baseQueryKey,
      // entries filter requires server-side entry_to_item mapping
      queryFn: () => getCollection(baseQueryFilters),
      queryClient,
      getKey: (collection) => collection.id,
      onUpdate: async ({ transaction }): Promise<void> => {
        await Promise.all(
          transaction.mutations.map((mutation) =>
            updateCollectionItem(toCollectionItemFormValues(mutation.modified)),
          ),
        );
        await queryClient.invalidateQueries();
      },
      onDelete: async ({ transaction }): Promise<void> => {
        const ids = transaction.mutations.map((mutation) => mutation.original.id);
        await deleteCollectionItems(ids);
        await queryClient.invalidateQueries();
      },
    }),
  );
};

// 2. create reusable mutation handlers for update and delete
// 3. create exportable base collection live query hook:

type BaseCollection = ReturnType<typeof createBaseCollection>;

export const useCollectionLiveQuery = (
  baseCollection: BaseCollection,
  filters: CollectionFilters,
) => {
  const searchTerm = filters.search?.trim() ?? "";
  const shopKey = filters.shop?.join("|") ?? "";
  const shipMethodKey = filters.shipMethod?.join("|") ?? "";
  const relCurrencyKey = filters.relCurrency?.join("|") ?? "";
  const categoryKey = filters.category?.join("|") ?? "";
  const scaleKey = filters.scale?.join("|") ?? "";
  const tagsKey = filters.tags?.join("|") ?? "";
  const conditionKey = filters.condition?.join("|") ?? "";
  const sortField = filters.sort ?? "createdAt";
  const sortOrder: "asc" | "desc" = filters.order ?? "desc";

  return useLiveQuery(
    (q) => {
      let query = q.from({ item: baseCollection });

      if (searchTerm) {
        query = query.where(({ item }) => ilike(item.itemTitle, `%${searchTerm}%`));
      }
      if (filters.paidMin !== undefined) {
        query = query.where(({ item }) => gte(item.price, filters.paidMin));
      }
      if (filters.paidMax !== undefined) {
        query = query.where(({ item }) => lte(item.price, filters.paidMax));
      }
      if (filters.shop && filters.shop.length > 0) {
        query = query.where(({ item }) => inArray(item.shop, filters.shop));
      }
      if (filters.payDateStart) {
        query = query.where(({ item }) => gte(item.paymentDate, filters.payDateStart));
      }
      if (filters.payDateEnd) {
        query = query.where(({ item }) => lte(item.paymentDate, filters.payDateEnd));
      }
      if (filters.shipDateStart) {
        query = query.where(({ item }) => gte(item.shippingDate, filters.shipDateStart));
      }
      if (filters.shipDateEnd) {
        query = query.where(({ item }) => lte(item.shippingDate, filters.shipDateEnd));
      }
      if (filters.colDateStart) {
        query = query.where(({ item }) => gte(item.collectionDate, filters.colDateStart));
      }
      if (filters.colDateEnd) {
        query = query.where(({ item }) => lte(item.collectionDate, filters.colDateEnd));
      }
      if (filters.shipMethod && filters.shipMethod.length > 0) {
        query = query.where(({ item }) => inArray(item.shippingMethod, filters.shipMethod));
      }
      if (filters.relDateStart) {
        query = query.where(({ item }) => gte(item.releaseDate, filters.relDateStart));
      }
      if (filters.relDateEnd) {
        query = query.where(({ item }) => lte(item.releaseDate, filters.relDateEnd));
      }
      if (filters.relPriceMin !== undefined) {
        query = query.where(({ item }) => gte(item.releasePrice, filters.relPriceMin));
      }
      if (filters.relPriceMax !== undefined) {
        query = query.where(({ item }) => lte(item.releasePrice, filters.relPriceMax));
      }
      if (filters.relCurrency && filters.relCurrency.length > 0) {
        query = query.where(({ item }) => inArray(item.releaseCurrency, filters.relCurrency));
      }
      if (filters.category && filters.category.length > 0) {
        query = query.where(({ item }) => inArray(item.itemCategory, filters.category));
      }
      if (filters.scale && filters.scale.length > 0) {
        query = query.where(({ item }) => inArray(item.itemScale, filters.scale));
      }
      if (filters.tags && filters.tags.length > 0) {
        const tags = filters.tags;
        query = query.fn.where((row) => tags.every((tag) => row.item.tags.includes(tag)));
      }
      if (filters.condition && filters.condition.length > 0) {
        query = query.where(({ item }) => inArray(item.condition, filters.condition));
      }

      switch (sortField) {
        case "itemTitle":
          query = query.orderBy(({ item }) => item.itemTitle, sortOrder);
          break;
        case "itemCategory":
          query = query.orderBy(({ item }) => item.itemCategory, sortOrder);
          break;
        case "itemScale":
          query = query.orderBy(({ item }) => item.itemScale, sortOrder);
          break;
        case "status":
          query = query.orderBy(({ item }) => item.status, sortOrder);
          break;
        case "count":
          query = query.orderBy(({ item }) => item.count, sortOrder);
          break;
        case "score":
          query = query.orderBy(({ item }) => item.score, sortOrder);
          break;
        case "price":
          query = query.orderBy(({ item }) => item.price, sortOrder);
          break;
        case "shop":
          query = query.orderBy(({ item }) => lower(item.shop), sortOrder);
          break;
        case "orderDate":
          query = query.orderBy(({ item }) => item.orderDate, sortOrder);
          break;
        case "paymentDate":
          query = query.orderBy(({ item }) => item.paymentDate, sortOrder);
          break;
        case "shippingDate":
          query = query.orderBy(({ item }) => item.shippingDate, sortOrder);
          break;
        case "releaseDate":
          query = query.orderBy(({ item }) => item.releaseDate, sortOrder);
          break;
        case "collectionDate":
          query = query.orderBy(({ item }) => item.collectionDate, sortOrder);
          break;
        case "createdAt":
        default:
          query = query.orderBy(({ item }) => item.createdAt, sortOrder);
          break;
      }

      return query.orderBy(({ item }) => item.createdAt, sortOrder);
    },
    [
      baseCollection,
      searchTerm,
      filters.paidMin,
      filters.paidMax,
      shopKey,
      filters.payDateStart,
      filters.payDateEnd,
      filters.shipDateStart,
      filters.shipDateEnd,
      filters.colDateStart,
      filters.colDateEnd,
      shipMethodKey,
      filters.relDateStart,
      filters.relDateEnd,
      filters.relPriceMin,
      filters.relPriceMax,
      relCurrencyKey,
      categoryKey,
      scaleKey,
      tagsKey,
      conditionKey,
      sortField,
      sortOrder,
    ],
  );
};
