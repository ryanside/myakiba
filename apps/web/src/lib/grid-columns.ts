import type { VisibilityState } from "@tanstack/react-table";
import type { ViewMode } from "@/components/ui/view-toggle";

type GridColumn = {
  readonly id: string;
  readonly label: string;
};

const COLLECTION_COLUMNS: readonly GridColumn[] = [
  { id: "itemTitle", label: "Item" },
  { id: "itemScale", label: "Scale" },
  { id: "count", label: "Count" },
  { id: "score", label: "Score" },
  { id: "shop", label: "Shop" },
  { id: "price", label: "Price" },
  { id: "releaseDate", label: "Release" },
  { id: "orderDate", label: "Order Date" },
  { id: "paymentDate", label: "Payment Date" },
  { id: "shippingDate", label: "Shipping Date" },
  { id: "collectionDate", label: "Collected" },
];

const ORDER_COLUMNS: readonly GridColumn[] = [
  { id: "title", label: "Order" },
  { id: "shop", label: "Shop" },
  { id: "shippingMethod", label: "Shipping" },
  { id: "releaseDate", label: "Release" },
  { id: "orderDate", label: "Order Date" },
  { id: "paymentDate", label: "Payment Date" },
  { id: "shippingDate", label: "Shipping Date" },
  { id: "collectionDate", label: "Collection Date" },
  { id: "itemCount", label: "Items" },
  { id: "total", label: "Total" },
  { id: "shippingFee", label: "Shipping Fee" },
  { id: "taxes", label: "Taxes" },
  { id: "duties", label: "Duties" },
  { id: "tariffs", label: "Tariffs" },
  { id: "miscFees", label: "Misc Fees" },
  { id: "status", label: "Status" },
];

const DEFAULT_COLLECTION_VISIBILITY: VisibilityState = {
  orderDate: false,
  paymentDate: false,
  shippingDate: false,
  releaseDate: false,
};

const DEFAULT_ORDER_VISIBILITY: VisibilityState = {
  orderDate: false,
  paymentDate: false,
  shippingDate: false,
  collectionDate: false,
  shippingFee: false,
  taxes: false,
  duties: false,
  tariffs: false,
  miscFees: false,
};

const DEFAULT_VIEW_MODE: ViewMode = "compact";

const COLLECTION_VIEW_MODE_KEY = "collection:viewMode";
const ORDER_VIEW_MODE_KEY = "orders:viewMode";
const COLLECTION_COLUMN_VISIBILITY_KEY = "collection:columnVisibility";
const ORDER_COLUMN_VISIBILITY_KEY = "orders:columnVisibility";

function visibleColumnIds(
  columns: readonly GridColumn[],
  visibility: VisibilityState,
): readonly string[] {
  return columns.filter(({ id }) => visibility[id] !== false).map(({ id }) => id);
}

function visibilityFromIds(
  columns: readonly GridColumn[],
  visibleIds: readonly string[],
): VisibilityState {
  const next: VisibilityState = {};
  const visibleSet = new Set(visibleIds);
  for (const { id } of columns) {
    next[id] = visibleSet.has(id);
  }
  return next;
}

export {
  COLLECTION_COLUMNS,
  ORDER_COLUMNS,
  DEFAULT_COLLECTION_VISIBILITY,
  DEFAULT_ORDER_VISIBILITY,
  DEFAULT_VIEW_MODE,
  COLLECTION_VIEW_MODE_KEY,
  ORDER_VIEW_MODE_KEY,
  COLLECTION_COLUMN_VISIBILITY_KEY,
  ORDER_COLUMN_VISIBILITY_KEY,
  visibleColumnIds,
  visibilityFromIds,
};

export type { GridColumn };
