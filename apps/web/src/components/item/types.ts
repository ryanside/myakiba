import type { InferOk } from "better-result";
import type {
  getItem,
  getItemRelatedCollection,
  getItemRelatedOrders,
  getResyncStatus,
} from "@/queries/item";

export type ItemDetail = NonNullable<InferOk<Awaited<ReturnType<typeof getItem>>>>["item"];
export type ItemCollectionEntry = InferOk<
  Awaited<ReturnType<typeof getItemRelatedCollection>>
>["collection"][number];
export type ItemRelatedOrder = InferOk<
  Awaited<ReturnType<typeof getItemRelatedOrders>>
>["orders"][number];

export type ResyncStatus = InferOk<Awaited<ReturnType<typeof getResyncStatus>>>["status"];
