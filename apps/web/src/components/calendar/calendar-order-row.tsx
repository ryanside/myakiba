import type { ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { PackageIcon } from "@hugeicons/core-free-icons";
import { Link } from "@tanstack/react-router";
import type { Currency } from "@myakiba/contracts/shared/types";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { ImageThumbnail } from "@/components/ui/image-thumbnail";
import { ThemedBadge } from "@/components/reui/badge";
import { getStatusVariant } from "@/lib/orders";
import type { CalendarOrder } from "@/queries/calendar";

interface CalendarOrderRowProps {
  readonly order: CalendarOrder;
  readonly currency: Currency;
  readonly locale: string;
}

export function CalendarOrderRow({ order, currency, locale }: CalendarOrderRowProps): ReactNode {
  return (
    <Link
      to="/orders/$id"
      params={{ id: order.orderId }}
      className="group/row grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-md px-1.5 py-2 transition-colors duration-150 ease-out hover:bg-muted/40"
    >
      <ImageThumbnail
        images={order.images}
        title={order.title}
        fallbackIcon={<HugeiconsIcon icon={PackageIcon} className="size-4 text-muted-foreground" />}
        className="size-10 rounded-md"
      />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium leading-tight">{order.title}</p>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="truncate">{order.shop || "-"}</span>
          <span aria-hidden>·</span>
          <span className="shrink-0 tabular-nums">
            {order.itemCount} {order.itemCount === 1 ? "item" : "items"}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 justify-self-end">
        <ThemedBadge variant={getStatusVariant(order.status)} size="sm">
          {order.status}
        </ThemedBadge>
        <span className="text-sm font-medium tabular-nums">
          {formatCurrencyFromMinorUnits(order.total, currency, locale)}
        </span>
      </div>
    </Link>
  );
}
