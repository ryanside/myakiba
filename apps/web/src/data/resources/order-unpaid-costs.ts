import type { QueryClient } from "@tanstack/react-query";
import type { ItemFill } from "@myakiba/contracts/collection/fill";
import type { CollectionPage } from "@myakiba/contracts/collection/types";
import type { OrderFill } from "@myakiba/contracts/orders/fill";
import type { Order, OrderItem, OrdersPage } from "@myakiba/contracts/orders/types";
import type { Page } from "@myakiba/contracts/shared/pagination";
import { Holds, useHeld } from "../client";
import type { HeldKeys } from "../client";

/** Orders whose Unpaid Costs a write in flight can move, so no screen draws them until it settles. */
const unpaidCostsHolds = new Holds();

export function useUnpaidCostsHeld(): (orderId: string) => boolean {
  return useHeld(unpaidCostsHolds);
}

const ORDER_INPUTS = ["paid", "shippingFee", "taxes", "duties", "tariffs", "miscFees"] as const;
const ITEM_INPUTS = ["paid", "price", "orderId"] as const;

type ItemInputs = { readonly id: string } & Pick<OrderItem, (typeof ITEM_INPUTS)[number]>;

/** A write on Orders or their items, by what it changes that Unpaid Costs depend on. */
type UnpaidCostsWrite =
  | {
      readonly edits: "order";
      readonly values: Pick<Order, "orderId" | (typeof ORDER_INPUTS)[number]>;
    }
  | { readonly edits: "item"; readonly values: ItemInputs }
  | { readonly edits: "paid"; readonly orderIds: Iterable<string> }
  | {
      readonly edits: "order fill";
      readonly orderIds: Iterable<string>;
      readonly field: OrderFill["field"];
    }
  | { readonly edits: "item fill"; readonly field: ItemFill["field"] }
  | { readonly edits: "membership"; readonly orderIds: Iterable<string> | "unknown" }
  | { readonly edits: "nothing they depend on" };

function cachedOrders(queryClient: QueryClient, orderId: string): Order[] {
  const detail = queryClient.getQueryData<Order>(["order", orderId]);
  const listed = queryClient
    .getQueriesData<OrdersPage>({ queryKey: ["orders"] })
    .flatMap(([, page]) => page?.items.filter((row) => row.orderId === orderId) ?? []);
  return detail ? [detail, ...listed] : listed;
}

function cachedItem(queryClient: QueryClient, id: string): ItemInputs | undefined {
  return [
    ...queryClient.getQueriesData<Page<OrderItem>>({ queryKey: ["orderItems"] }),
    ...queryClient.getQueriesData<CollectionPage>({ queryKey: ["collection"] }),
  ]
    .flatMap(([, page]) => page?.items ?? [])
    .find((item) => item.id === id);
}

/**
 * Which Orders' Unpaid Costs a write can move: an Order's fees or its own Paid, an item's price or
 * Paid, or which items an Order holds. When the write or the cache cannot say, it answers yes.
 */
function unpaidCostsMovedBy(queryClient: QueryClient, write: UnpaidCostsWrite): HeldKeys {
  switch (write.edits) {
    case "order": {
      const { values } = write;
      const copies = cachedOrders(queryClient, values.orderId);
      const moves =
        copies.length === 0 ||
        copies.some((copy) => ORDER_INPUTS.some((field) => copy[field] !== values[field]));
      return moves ? [values.orderId] : [];
    }
    case "item": {
      const { values } = write;
      const before = cachedItem(queryClient, values.id);
      if (!before) return values.orderId === null ? "every" : [values.orderId];
      if (ITEM_INPUTS.every((field) => before[field] === values[field])) return [];
      return [before.orderId, values.orderId].filter((orderId) => orderId !== null);
    }
    case "paid":
      return [...write.orderIds];
    case "order fill":
      return write.field === "paid" ? [...write.orderIds] : [];
    case "item fill":
      return write.field === "paid" || write.field === "price" ? "every" : [];
    case "membership":
      return write.orderIds === "unknown" ? "every" : [...write.orderIds];
    case "nothing they depend on":
      return [];
  }
}

/** The hold a command that can change Orders declares, read through `unpaidCostsMovedBy`. */
export function holdsUnpaidCosts<Input>(write: (input: Input) => UnpaidCostsWrite) {
  return {
    in: unpaidCostsHolds,
    keys: (queryClient: QueryClient, input: Input) => unpaidCostsMovedBy(queryClient, write(input)),
  };
}
