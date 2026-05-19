import type { CSSProperties, ReactNode } from "react";
import { PackageIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import type { Currency, DateFormat } from "@myakiba/contracts/shared/types";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { ImageThumbnail } from "@/components/ui/image-thumbnail";
import { formatDateOnlyForDisplay } from "@/lib/date-display";
import type { ExpenseOrder } from "@/queries/expenses";
import { cn } from "@/lib/utils";

interface ExpenseOrderRowProps {
  readonly order: ExpenseOrder;
  readonly currency: Currency;
  readonly locale: string;
  readonly dateFormat: DateFormat;
  readonly className?: string;
  readonly style?: CSSProperties;
}

export function ExpenseOrderRow({
  order,
  currency,
  locale,
  dateFormat,
  className,
  style,
}: ExpenseOrderRowProps): ReactNode {
  return (
    <Link
      to="/orders/$id"
      params={{ id: order.orderId }}
      className={cn(
        "grid gap-1 py-3 transition-colors duration-150 ease-out hover:bg-muted/40 sm:grid-cols-[1fr_auto]",
        className,
      )}
      style={style}
    >
      <div className="flex min-w-0 items-center gap-3">
        <ImageThumbnail
          images={order.images}
          title={order.title}
          fallbackIcon={<HugeiconsIcon icon={PackageIcon} className="size-4" />}
          className="size-8 rounded-md"
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{order.title}</p>
          <p className="text-xs text-muted-foreground">
            {order.shop} ·{" "}
            {order.expenseDate
              ? formatDateOnlyForDisplay(order.expenseDate, dateFormat)
              : "Undated"}
          </p>
        </div>
      </div>
      <div className="text-left sm:text-right">
        <p className="text-sm font-medium tabular-nums">
          {formatCurrencyFromMinorUnits(order.totalSpend, currency, locale)}
        </p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {formatCurrencyFromMinorUnits(order.feeSpend, currency, locale)} fees
        </p>
      </div>
    </Link>
  );
}
