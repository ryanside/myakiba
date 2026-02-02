import type { ShippingMethod, Condition, CollectionStatus, Category } from "./enums";

export type CollectionFilters = {
  limit?: number | undefined;
  offset?: number | undefined;
  sort?:
    | "itemTitle"
    | "itemCategory"
    | "itemScale"
    | "status"
    | "count"
    | "score"
    | "price"
    | "shop"
    | "orderDate"
    | "paymentDate"
    | "shippingDate"
    | "releaseDate"
    | "collectionDate"
    | "createdAt"
    | undefined;
  order?: "asc" | "desc" | undefined;
  search?: string | undefined;
  paidMin?: number | undefined;
  paidMax?: number | undefined;
  shop?: string[] | undefined;
  payDateStart?: string | undefined;
  payDateEnd?: string | undefined;
  shipDateStart?: string | undefined;
  shipDateEnd?: string | undefined;
  colDateStart?: string | undefined;
  colDateEnd?: string | undefined;
  shipMethod?: ShippingMethod[] | undefined;
  relDateStart?: string | undefined;
  relDateEnd?: string | undefined;
  relPriceMin?: number | undefined;
  relPriceMax?: number | undefined;
  relCurrency?: string[] | undefined;
  category?: Category[] | undefined;
  entries?: string[] | undefined;
  scale?: string[] | undefined;
  tags?: string[] | undefined;
  condition?: Condition[] | undefined;
};

export type CollectionItem = {
  id: string;
  orderId: string | null;
  itemId: string;
  itemExternalId: number | null;
  itemTitle: string;
  itemImage: string | null;
  itemCategory: Category | null;
  itemScale: string | null;
  status: CollectionStatus;
  count: number;
  score: string;
  price: number;
  shop: string;
  condition: Condition;
  orderDate: string | null;
  paymentDate: string | null;
  shippingDate: string | null;
  collectionDate: string | null;
  shippingMethod: ShippingMethod;
  tags: string[];
  notes: string;
  releaseId: string | null;
  releaseDate: string | null;
  releasePrice: number | null;
  releaseType: string | null;
  releaseCurrency: string | null;
  releaseBarcode: string | null;
  createdAt: string;
  updatedAt: string;
  totalCount: number;
  totalValue: number;
};

export type CollectionItemFormValues = Omit<
  CollectionItem,
  "createdAt" | "updatedAt" | "totalCount" | "totalValue" | "itemCategory" | "itemScale"
>;

export type CollectionStats = {
  totalItems: number;
  totalSpent: number;
  totalItemsThisMonth: number;
  totalSpentThisMonth: number;
};

export type CollectionQueryResponse = {
  collection: {
    collectionItems: CollectionItem[];
    collectionStats: CollectionStats;
  };
};
