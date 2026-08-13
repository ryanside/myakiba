import type { BadgeVariant } from "@/components/reui/badge";
import type { OrderStatus } from "@myakiba/contracts/shared/types";

const STATUS_VARIANT_MAP = {
  Ordered: "info",
  Paid: "warning",
  Shipped: "default",
  Owned: "success",
} satisfies Readonly<Record<OrderStatus, BadgeVariant>>;

export function getStatusVariant(status: OrderStatus): BadgeVariant {
  return STATUS_VARIANT_MAP[status];
}

export const ORDER_STATUS_COLORS = {
  Ordered: "bg-info",
  Paid: "bg-warning",
  Shipped: "bg-primary",
  Owned: "bg-success",
} satisfies Readonly<Record<OrderStatus, string>>;
