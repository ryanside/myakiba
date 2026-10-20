import type { Page } from "../shared/pagination";
import type { Category, CollectionStatus, Condition, ShippingMethod } from "../shared/types";

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
};

export type CollectionItemFormValues = Omit<
  CollectionItem,
  "createdAt" | "updatedAt" | "itemCategory" | "itemScale"
>;

export type CollectionStats = {
  totalItems: number;
  totalSpent: number;
  totalItemsThisMonth: number;
  totalSpentThisMonth: number;
};

/** A page of Collection Items and the summary of every item the filters match. */
export type CollectionPage = Page<CollectionItem> & {
  readonly totalValue: number;
  readonly totalItemsThisMonth: number;
};
