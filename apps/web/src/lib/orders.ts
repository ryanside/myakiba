import type { BadgeVariant } from "@/components/reui/badge";
import type { OrderPayment, OrderStatus } from "@myakiba/contracts/shared/types";

const STATUS_VARIANT_MAP = {
  Ordered: "info",
  Shipped: "default",
  Owned: "success",
} satisfies Readonly<Record<OrderStatus, BadgeVariant>>;

export function getStatusVariant(status: OrderStatus): BadgeVariant {
  return STATUS_VARIANT_MAP[status];
}

export const ORDER_STATUS_COLORS = {
  Ordered: "bg-info",
  Shipped: "bg-violet-500",
  Owned: "bg-success",
} satisfies Readonly<Record<OrderStatus, string>>;

export const ORDER_PAYMENT_DISPLAY = {
  paid: { label: "Paid", variant: "success-light" },
  partly: { label: "Partly paid", variant: "info-light" },
  unpaid: { label: "Unpaid", variant: "warning-light" },
} as const satisfies Readonly<
  Record<OrderPayment, { readonly label: string; readonly variant: BadgeVariant }>
>;

export function paymentOf(paid: boolean): OrderPayment {
  return paid ? "paid" : "unpaid";
}

type UnpaidCostsRow = { readonly unpaidCosts: number; readonly unpaidCostsPending?: true };

/** Set by an optimistic patch of a Total, fee or Paid; the refetched row has no such field. */
export function withUnpaidCostsPending<Row extends object>(
  row: Row,
): Row & { readonly unpaidCostsPending: true } {
  return { ...row, unpaidCostsPending: true };
}

export function shownUnpaidCosts(order: UnpaidCostsRow): number | null {
  return order.unpaidCostsPending || order.unpaidCosts <= 0 ? null : order.unpaidCosts;
}

export function partlyPaidUnpaidCosts(
  order: UnpaidCostsRow & { readonly payment: OrderPayment },
): number | null {
  return order.payment === "partly" ? shownUnpaidCosts(order) : null;
}
