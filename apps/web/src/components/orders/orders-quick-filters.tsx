import { useOrdersFilters } from "@/hooks/use-orders";
import { ORDER_STATUSES } from "@myakiba/contracts/shared/constants";
import type { OrderFilters } from "@myakiba/contracts/orders/schema";
import type { OrderStatus } from "@myakiba/contracts/shared/types";
import { QuickFilterChips } from "../quick-filter-chips";

const PAID_CHIPS = { Paid: true, Unpaid: false } as const;
type PaidChip = keyof typeof PAID_CHIPS;
const CHIPS = [...ORDER_STATUSES, "Paid", "Unpaid"] as const;

const isStatus = (chip: string): chip is OrderStatus =>
  ORDER_STATUSES.some((status) => status === chip);
const isPaidChip = (chip: string): chip is PaidChip => chip in PAID_CHIPS;

function paidChipOf(paid: boolean | undefined): PaidChip | undefined {
  if (paid === undefined) return undefined;
  return paid ? "Paid" : "Unpaid";
}

function newlyPressedPaidChip(
  pressed: readonly PaidChip[],
  current: PaidChip | undefined,
): PaidChip | undefined {
  return pressed.find((chip) => chip !== current) ?? pressed[0];
}

export function OrdersQuickFilters(): React.ReactElement {
  const { filters, setFilters } = useOrdersFilters();
  const statuses = filters.status ?? [];
  const current = paidChipOf(filters.paid);

  return (
    <QuickFilterChips
      options={CHIPS}
      selected={current ? [...statuses, current] : statuses}
      onChange={(chips) => {
        const nextStatuses = chips.filter(isStatus);
        const paidChip = newlyPressedPaidChip(chips.filter(isPaidChip), current);
        const paid = paidChip === undefined ? undefined : PAID_CHIPS[paidChip];
        const next: Partial<OrderFilters> = {
          status: nextStatuses.length > 0 ? nextStatuses : undefined,
          paid,
          offset: 0,
        };
        if (paid !== filters.paid) next.feesPaid = undefined;
        setFilters(next);
      }}
    />
  );
}
