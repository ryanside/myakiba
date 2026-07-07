import type {
  getItem,
  getItemRelatedCollection,
  getItemRelatedOrders,
  getResyncStatus,
} from "@/queries/item";

export type ItemDetail = NonNullable<Awaited<ReturnType<typeof getItem>>>["item"];
export type ItemCollectionEntry = Awaited<
  ReturnType<typeof getItemRelatedCollection>
>["collection"][number];
export type ItemRelatedOrder = Awaited<ReturnType<typeof getItemRelatedOrders>>["orders"][number];

export type ResyncStatus = Awaited<ReturnType<typeof getResyncStatus>>["status"];
