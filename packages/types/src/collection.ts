import type { ShippingMethod, Condition, CollectionStatus, Category } from "./enums";
import type { CollectionFilters as SchemaCollectionFilters } from "@myakiba/schemas";

export type CollectionFilters = SchemaCollectionFilters;

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

export type CollectionQueryResponse = CollectionItem[];
