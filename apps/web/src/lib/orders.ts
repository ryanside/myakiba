import type { BadgeVariant } from "@/components/reui/badge";

const STATUS_VARIANT_MAP: Readonly<Record<string, BadgeVariant>> = {
  ordered: "info",
  paid: "warning",
  shipped: "default",
  owned: "success",
};

export function getStatusVariant(status: string): BadgeVariant {
  return STATUS_VARIANT_MAP[status.toLowerCase()] ?? "outline";
}

export const ORDER_STATUS_COLORS: Readonly<Record<string, string>> = {
  Ordered: "bg-info",
  Paid: "bg-warning",
  Shipped: "bg-primary",
  Owned: "bg-success",
};
