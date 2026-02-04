import type { VariantProps } from "class-variance-authority";
import { badgeVariants } from "@/components/ui/badge";
import { COLLECTION_STATUSES, ORDER_STATUSES } from "@myakiba/constants";

const STATUS_VARIANT_MAP: Record<string, VariantProps<typeof badgeVariants>["variant"]> = {
  ...Object.fromEntries(
    COLLECTION_STATUSES.map((status) => [
      status.toLowerCase(),
      status === "Owned"
        ? "success"
        : status === "Shipped"
          ? "primary"
          : status === "Paid"
            ? "warning"
            : "info",
    ]),
  ),
  ...Object.fromEntries(
    ORDER_STATUSES.map((status) => [
      status.toLowerCase(),
      status === "Owned"
        ? "success"
        : status === "Shipped"
          ? "primary"
          : status === "Paid"
            ? "warning"
            : "info",
    ]),
  ),
};

export function getStatusVariant(status: string): VariantProps<typeof badgeVariants>["variant"] {
  return STATUS_VARIANT_MAP[status.toLowerCase()] || "outline";
}
