import type { ExpenseFilters } from "../model";
import {
  EMPTY_ORDER_TOTAL,
  EMPTY_OWNED_ITEM_TOTAL,
  EMPTY_PAID_ITEM_TOTAL,
  getOrderAggregates,
  getOwnedItemAggregates,
  getPaidItemAggregates,
} from "./expense-queries";

export type ExpenseFacts = Awaited<ReturnType<typeof loadExpenseFacts>>;

export function mergeExpenseFacts(base: ExpenseFacts, addition: ExpenseFacts): ExpenseFacts {
  return {
    paidItemTotal: {
      itemSpend: base.paidItemTotal.itemSpend + addition.paidItemTotal.itemSpend,
      paidItemCount: base.paidItemTotal.paidItemCount + addition.paidItemTotal.paidItemCount,
    },
    ownedItemTotal: {
      itemSpend: base.ownedItemTotal.itemSpend + addition.ownedItemTotal.itemSpend,
      itemCount: base.ownedItemTotal.itemCount + addition.ownedItemTotal.itemCount,
    },
    orderTotal: {
      shippingSpend: base.orderTotal.shippingSpend + addition.orderTotal.shippingSpend,
      taxesSpend: base.orderTotal.taxesSpend + addition.orderTotal.taxesSpend,
      dutiesSpend: base.orderTotal.dutiesSpend + addition.orderTotal.dutiesSpend,
      tariffsSpend: base.orderTotal.tariffsSpend + addition.orderTotal.tariffsSpend,
      miscSpend: base.orderTotal.miscSpend + addition.orderTotal.miscSpend,
      orderItemSpend: base.orderTotal.orderItemSpend + addition.orderTotal.orderItemSpend,
      orderSpend: base.orderTotal.orderSpend + addition.orderTotal.orderSpend,
      paidOrderCount: base.orderTotal.paidOrderCount + addition.orderTotal.paidOrderCount,
      orderItemCount: base.orderTotal.orderItemCount + addition.orderTotal.orderItemCount,
    },
  };
}

export async function loadExpenseFacts(userId: string, filters: ExpenseFilters) {
  const [paidItemTotals, ownedItemTotals, orderTotals] = await Promise.all([
    getPaidItemAggregates(userId, filters),
    getOwnedItemAggregates(userId, filters),
    getOrderAggregates(userId, filters),
  ]);

  return {
    paidItemTotal: paidItemTotals[0] ?? EMPTY_PAID_ITEM_TOTAL,
    ownedItemTotal: ownedItemTotals[0] ?? EMPTY_OWNED_ITEM_TOTAL,
    orderTotal: orderTotals[0] ?? EMPTY_ORDER_TOTAL,
  };
}
