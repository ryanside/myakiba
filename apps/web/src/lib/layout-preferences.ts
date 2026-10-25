import * as z from "zod";
import type { DataViewMode, MediaViewMode } from "@/components/ui/view-toggle";
import { useLocalStorage } from "@/hooks/use-local-storage";

const DATA_VIEW_MODES = [
  "compact",
  "table",
  "grid",
  "gallery",
] as const satisfies readonly DataViewMode[];
const MEDIA_VIEW_MODES = ["grid", "list", "gallery"] as const satisfies readonly MediaViewMode[];
const DATA_VIEW_MODE = z.enum(DATA_VIEW_MODES);
const MEDIA_VIEW_MODE = z.enum(MEDIA_VIEW_MODES);

/** Where each page keeps the view it opens in. Settings writes the same keys the pages read. */
export const VIEW_PREFERENCES = {
  collection: {
    key: "collection:viewMode",
    modes: DATA_VIEW_MODES,
    schema: DATA_VIEW_MODE,
    fallback: "compact",
  },
  orders: {
    key: "orders:viewMode",
    modes: DATA_VIEW_MODES,
    schema: DATA_VIEW_MODE,
    fallback: "compact",
  },
  wishlist: {
    key: "wishlist:viewMode",
    modes: MEDIA_VIEW_MODES,
    schema: MEDIA_VIEW_MODE,
    fallback: "grid",
  },
  lists: {
    key: "lists:viewMode",
    modes: MEDIA_VIEW_MODES,
    schema: MEDIA_VIEW_MODE,
    fallback: "grid",
  },
  itemDatabase: {
    key: "item-database:viewMode",
    modes: MEDIA_VIEW_MODES,
    schema: MEDIA_VIEW_MODE,
    fallback: "grid",
  },
} as const;

/** The view a page opens in. A stored value the page doesn't know falls back to its default. */
export function useViewPreference<M extends string>({
  key,
  fallback,
  schema,
}: {
  readonly key: string;
  readonly fallback: NoInfer<M>;
  readonly schema: z.ZodType<M>;
}) {
  return useLocalStorage(key, fallback, schema);
}

/** Where each table keeps the columns the user hid, moved, resized or pinned. */
export const TABLE_LAYOUTS = {
  collection: {
    visibility: "collection:columnVisibility",
    order: "collection:columnOrder:v1",
    sizing: "collection:columnSizing:v1",
    pinning: "collection:columnPinning:v1",
  },
  orders: {
    visibility: "orders:columnVisibility",
    order: "orders:columnOrder:v1",
    sizing: "orders:columnSizing:v1",
    pinning: "orders:columnPinning:v1",
  },
  orderItems: {
    visibility: "orderItems:columnVisibility:v1",
    order: "orderItems:columnOrder:v1",
    sizing: "orderItems:columnSizing:v1",
    pinning: "orderItems:columnPinning:v1",
  },
} as const;
