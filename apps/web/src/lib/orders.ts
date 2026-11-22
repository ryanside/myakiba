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

/** An Order's Unpaid Costs, or null while a write moves them or when nothing is owed. */
export function shownUnpaidCosts(
  order: { readonly unpaidCosts: number },
  held: boolean,
): number | null {
  return held || order.unpaidCosts <= 0 ? null : order.unpaidCosts;
}

export function partlyPaidUnpaidCosts(
  order: { readonly payment: OrderPayment; readonly unpaidCosts: number },
  held: boolean,
): number | null {
  return order.payment === "partly" ? shownUnpaidCosts(order, held) : null;
}
